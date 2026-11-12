"""C5: ScoringVersion files. A version is canonical JSON committed under scoring_v2/versions/<id>.json and never
edited after commit (tests/scoring_v2/test_version.py pins each file's SHA-256). ADR-0010: versions live in the repo,
not in MongoDB, so they are reviewable in a diff, reproducible from git and need no database write.
"""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

from config.versions import MEASURE_VERSION

from .aggregate import BANDS, MIN_FILLS
from .components import WEIGHTS
from .integrity import canonical_json

VERSIONS_DIR = Path(__file__).resolve().parent / "versions"
_ID_RE = re.compile(r"^v2\.\d+\.\d+$")
# Published regular-tier spot taker rate, used as the fee anchor when an account's best rate is 0 (a zero-fee pair).
# Source: https://www.binance.com/en/fee/schedule (Regular: maker 0.1000%, taker 0.1000%), searched 2026-11-11.
# The page's volume thresholds are still in BUSD, so the table may be dated; the value is stored in the version file.
PUBLISHED_TAKER_BPS = {"binance": 10.0}
CODE_FILES = ("measure/benchmarks.py", "measure/enrich_fill.py", "measure/metrics.py", "measure/orders.py", "measure/fees.py",
              "scoring_v2/anchors.py", "scoring_v2/components.py", "scoring_v2/aggregate.py", "scoring_v2/calibrate.py",
              "scoring_v2/score.py")   # score.py since v2.1.0: it forms the spread units (taker events)


def _path(version_id: str) -> Path:
    if not _ID_RE.match(version_id or ""):
        raise ValueError(f"bad scoring version id {version_id!r}")
    return VERSIONS_DIR / f"{version_id}.json"


def version_file_sha256(version_id: str) -> str:
    return hashlib.sha256(_path(version_id).read_bytes()).hexdigest()


def load_version(version_id: str) -> dict:
    v = json.loads(_path(version_id).read_text(encoding="utf-8"))
    if v.get("id") != version_id:
        raise ValueError(f"version file {version_id} has id {v.get('id')!r}")
    return v


def code_hash(root: Path | None = None) -> str:
    root = root or Path(__file__).resolve().parents[1]
    h = hashlib.sha256()
    for rel in CODE_FILES:
        h.update(rel.encode() + b"\0" + (root / rel).read_bytes() + b"\0")
    return h.hexdigest()


def build_version(version_id: str, anchors: dict, hour_profiles: dict, window: dict, refs: list[dict],
                  extra: dict | None = None) -> dict:
    """`extra` adds version-level fields that change how a score is computed or read, e.g. "spreadUnit" (v2.1.0+:
    "taker_event") and the sample counts behind each anchor. A version without "spreadUnit" scores spread per fill."""
    _path(version_id)
    return {
        **(extra or {}),
        "id": version_id,
        "weights": WEIGHTS,
        "bands": [[edge, g] for edge, g in BANDS],
        "minFills": MIN_FILLS,
        "anchors": anchors,
        "hourProfiles": hour_profiles,
        "feeTable": {"publishedTakerBps": PUBLISHED_TAKER_BPS, "source": "https://www.binance.com/en/fee/schedule (searched 2026-11-11)"},
        "calibrationWindow": window,
        "calibrationRefs": sorted(refs, key=lambda r: r["file"]),
        "measureVersion": MEASURE_VERSION,
        "codeHash": code_hash(),
    }


def dumps_version(v: dict) -> str:
    return canonical_json(v) + "\n"
