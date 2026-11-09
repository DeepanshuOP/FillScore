"""Versioned golden sets: evals/golden/<set>/{<case>.json, MANIFEST.json}.

MANIFEST: {prompt_version, metrics_version, recorded, note, [single_prompt_version]}.
  recorded: true   recordings stamped with that set's prompt/metrics versions are checked against that set's packets.
  recorded: false  packets only; the only check is that the dumper reproduces them hash-identically.

A recording belongs to the set whose versions it carries (council_result.prompt_version, and metrics_version
when the arm stamps one; single-call results carry only prompt_version)."""
from __future__ import annotations

import glob
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
GOLDEN_ROOT = os.path.join(HERE, "golden")


def list_sets(root: str | None = None) -> list[str]:
    root = root or GOLDEN_ROOT
    return sorted(os.path.basename(os.path.dirname(p)) for p in glob.glob(os.path.join(root, "*", "MANIFEST.json")))


def read_manifest(name: str, root: str | None = None) -> dict:
    with open(os.path.join(root or GOLDEN_ROOT, name, "MANIFEST.json")) as f:
        return json.load(f)


def recorded_sets(root: str | None = None) -> list[str]:
    return [n for n in list_sets(root) if read_manifest(n, root).get("recorded") is True]


def load_golden(name: str = "v1", root: str | None = None) -> dict[str, dict]:
    out = {}
    for p in sorted(glob.glob(os.path.join(root or GOLDEN_ROOT, name, "*.json"))):
        if os.path.basename(p) == "MANIFEST.json":
            continue
        g = json.load(open(p))
        out[g["id"]] = g
    return out


def stamp_matches(res: dict, manifest: dict) -> bool:
    """True when the result carries the manifest's prompt version (and its metrics version, if it carries one)."""
    if res.get("prompt_version") != manifest.get("prompt_version"):
        return False
    mv = res.get("metrics_version")
    return mv is None or mv == manifest.get("metrics_version")


def owning_sets(res: dict, root: str | None = None) -> list[str]:
    """Every set (recorded or not) whose versions the result carries."""
    return [n for n in list_sets(root) if stamp_matches(res, read_manifest(n, root))]
