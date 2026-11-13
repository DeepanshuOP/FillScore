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
    # M1.1, ADR-0012: taker-event spread baseline, 90 days, streamed summaries:
    # scripts/calibrate_v2.py --id v2.1.0 --symbols BTCUSDT ETHUSDT BNBUSDT SOLUSDT --start 2026-08-12 --end 2026-11-09
    #   --every 1 --discard-raw (rebuilt from the same day summaries after the review fixes: only codeHash changed)
    "v2.1.0": "63e20f1dc10b62e34bb43afdf0c875aee336b12145e4d750f2bef9e6fc0a57b0",
    # M2 closing steps, ADR-0013: cost-based timing. Same 90 days as v2.1.0 (spread and slippage anchors identical),
    # re-streamed into summary format 2:
    # scripts/calibrate_v2.py --id v2.2.0 --symbols BTCUSDT ETHUSDT BNBUSDT SOLUSDT --start 2026-08-12 --end 2026-11-09
    #   --every 1 --discard-raw
    "v2.2.0": "a0fa45c7ab977bd7c3f3c1afa8afc83f7ee5810a44011896868ab9bb5c3c3e8d",
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


def test_current_version_scores_spread_on_taker_events_over_90_days():
    # M1.1: the current version uses the taker-event unit, covers 90 consecutive days, needs 30 days per hour, and
    # every anchor has its sample count; each hour profile is backed by at least minProfileDays days.
    v = load_version(SCORING_V2_VERSION)
    assert v["spreadUnit"] == "taker_event"
    assert len(v["calibrationWindow"]["days"]) == 90 and v["calibrationWindow"]["rule"] == "every day"
    assert v["minProfileDays"] >= 30
    for sym, a in v["anchors"].items():
        counts = v["calibrationCounts"][sym]
        assert counts["days"] == 90
        for comp in ("spread", "slippage"):
            for b, an in a[comp].items():
                assert an is None or counts[comp][b] >= 200
        if v["hourProfiles"][sym] is not None:
            assert min(counts["profileDays"]) >= v["minProfileDays"]


def test_v220_reproduces_the_v210_anchors_and_adds_a_cost_based_timing_rule():
    # ADR-0013: same 90 days and same code for spread and slippage, so those anchors must equal v2.1.0's exactly; only
    # the hour profile (now a cost in bps) and the timing rule are new.
    old, new = load_version("v2.1.0"), load_version("v2.2.0")
    assert new["calibrationWindow"] == old["calibrationWindow"]
    assert new["calibrationRefs"] == old["calibrationRefs"]
    for sym in old["anchors"]:
        assert new["anchors"][sym] == old["anchors"][sym], sym
    assert new["timingUnit"] == "excess_event_cost" and new["timingReferenceHours"] == 3 and new["timingFloorSteps"] == 1.0
    for sym, prof in new["hourProfiles"].items():
        assert len(prof) == 24 and all(x >= 0 for x in prof)
        t = new["calibrationCounts"][sym]["timing"]
        assert min(t["eventDays"]) >= new["minProfileDays"] and min(t["events"]) > 0
        assert t["stepBps"] > 0 and new["timingFloorBps"][sym] == pytest.approx(t["stepBps"] * new["timingFloorSteps"])


def test_bad_version_id_refused():
    with pytest.raises(ValueError):
        load_version("../../etc/passwd")
