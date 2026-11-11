"""Field-ownership registry helper (TEST / SCRIPT USE ONLY).

Reads shared/fieldRegistry.json. Never import this from service runtime code: the Docker build contexts do not
include shared/. Scripts that write to Mongo call assert_writable() on every key they are about to $set.
"""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any

REGISTRY_PATH = Path(__file__).resolve().parents[2] / "shared" / "fieldRegistry.json"


class FieldOwnershipError(Exception):
    pass


_PY_TYPES = {"number": (int, float), "string": (str,), "bool": (bool,), "object": (dict,), "array": (list, tuple), "datetime": (datetime, str)}


def load_registry() -> dict:
    return json.loads(REGISTRY_PATH.read_text())


def assert_writable(collection: str, field: str, value: Any, writer: str) -> None:
    spec = load_registry().get(collection, {}).get(field)
    if spec is None:
        raise FieldOwnershipError(f"{collection}.{field} is not in the field registry")
    if spec["owner"] != writer and writer not in spec.get("coOwners", []):
        if writer not in spec.get("repair", []):
            raise FieldOwnershipError(f"{collection}.{field} is owned by {spec['owner']}, not {writer}")
        if value is not None:
            raise FieldOwnershipError(f"{collection}.{field}: repair writer {writer} may only set null")
    if value is None:
        if not spec["nullable"]:
            raise FieldOwnershipError(f"{collection}.{field} is not nullable")
        return
    ok = isinstance(value, _PY_TYPES[spec["type"]])
    if spec["type"] == "number" and isinstance(value, bool):
        ok = False
    if not ok:
        raise FieldOwnershipError(f"{collection}.{field} expects {spec['type']}, got {type(value).__name__}")
    if spec["type"] == "object" and "keys" in spec:
        extra = set(value) - set(spec["keys"])
        if extra:
            raise FieldOwnershipError(f"{collection}.{field} has unknown keys {sorted(extra)}")
