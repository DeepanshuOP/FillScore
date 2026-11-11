"""Committed ScoringVersion files are never edited: each file's SHA-256 is pinned here. A new calibration is a new
version id (v2.0.1, ...), never an edit. ADR-0010."""
import json

import pytest

from config.versions import MEASURE_VERSION, SCORING_V2_VERSION
from scoring_v2.anchors import check_anchors
from scoring_v2.components import WEIGHTS
from scoring_v2.version import VERSIONS_DIR, load_version, version_file_sha256

PINNED = {
    # scripts/calibrate_v2.py --id v2.0.0 --symbols BTCUSDT ETHUSDT BNBUSDT SOLUSDT --start 2025-10-01 --end 2025-10-29 --every 7
    "v2.0.0": "f2fb091f77d608f7b896398cf1822f13e91cbea0d3d4e57b33a697c3d59d562d",
}


def test_every_committed_version_is_pinned():
    assert sorted(p.stem for p in VERSIONS_DIR.glob("*.json")) == sorted(PINNED)


@pytest.mark.parametrize("vid,sha", sorted(PINNED.items()))
def test_version_file_unchanged(vid, sha):
    assert version_file_sha256(vid) == sha


def test_current_version_exists_and_is_consistent():
    v = load_version(SCORING_V2_VERSION)
    assert v["weights"] == WEIGHTS
    assert v["measureVersion"] == MEASURE_VERSION
    assert v["minFills"] == 20
    assert len(v["calibrationRefs"]) == len(v["anchors"]) * len(v["calibrationWindow"]["days"])
    assert all(len(r["sha256"]) == 64 for r in v["calibrationRefs"])


def test_anchors_are_valid_or_null_and_profiles_have_24_hours():
    v = load_version(SCORING_V2_VERSION)
    for sym, a in v["anchors"].items():
        assert a["tick"] > 0
        for comp in ("spread", "slippage"):
            for bucket, an in a[comp].items():
                if an is not None:
                    check_anchors(*an)
        prof = v["hourProfiles"][sym]
        assert prof is None or len(prof) == 24


def test_version_file_is_canonical_json():
    raw = (VERSIONS_DIR / f"{SCORING_V2_VERSION}.json").read_text(encoding="utf-8")
    from scoring_v2.integrity import canonical_json
    assert raw == canonical_json(json.loads(raw)) + "\n"


def test_bad_version_id_refused():
    with pytest.raises(ValueError):
        load_version("../../etc/passwd")
