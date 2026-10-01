"""Loads ml-service/.env and backend/.env into the process environment.

Precedence, highest first:
  1. variables already set in the real environment (containers, CI, shell)
  2. backend/.env for keys both services must agree on (SHARED_KEYS)
  3. ml-service/.env
  4. backend/.env for everything else

The shared keys come from the backend because it is the source of truth for the database and
for token signing; a stale copy of MONGODB_URI in ml-service/.env used to shadow it.
"""
from __future__ import annotations

import os
from typing import MutableMapping

from dotenv import dotenv_values

SHARED_KEYS = ("MONGODB_URI", "JWT_ACCESS_SECRET")


def _read(path: str) -> dict[str, str]:
    try:
        values = dotenv_values(path)
    except (ValueError, UnicodeDecodeError, OSError):
        return {}
    return {k: v for k, v in values.items() if v is not None}


def load_service_env(
    ml_env_path: str,
    backend_env_path: str,
    environ: MutableMapping[str, str] | None = None,
) -> list[str]:
    """Apply both files to `environ` (default os.environ). Returns the names of the keys it set;
    values are never returned or logged."""
    target = os.environ if environ is None else environ

    ml_values = _read(ml_env_path)
    backend_values = _read(backend_env_path)

    merged = {**backend_values, **ml_values}
    for key in SHARED_KEYS:
        if key in backend_values:
            merged[key] = backend_values[key]

    applied = []
    for key, value in merged.items():
        if key not in target:
            target[key] = value
            applied.append(key)
    return applied
