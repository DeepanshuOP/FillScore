"""The golden set is intact and the offline runner passes on the stored fixtures."""
from evals import run_offline


def test_golden_set_shape():
    g = run_offline.load_golden()
    assert {"demo-disciplined", "demo-moderate", "demo-aggressive"} <= set(g)
    assert {k for k in g if k.startswith("edge-")} == {
        "edge-all-maker", "edge-all-taker", "edge-single-trade", "edge-whale-adverse", "edge-missing-data"}


def test_edge_packet_facts():
    g = run_offline.load_golden()
    # 12 maker trades of 1000 notional paying 0.5 each: fees 6.0, maker_ratio 1.0
    assert g["edge-all-maker"]["packet"]["fee"]["total_fee_paid_usd"] == 6.0
    assert g["edge-all-maker"]["packet"]["fee"]["maker_ratio"] == 1.0
    # 12 taker trades paying 1.0 each: fees 12.0, maker_ratio 0
    assert g["edge-all-taker"]["packet"]["fee"]["total_fee_paid_usd"] == 12.0
    assert g["edge-all-taker"]["packet"]["fee"]["maker_ratio"] == 0.0
    assert g["edge-single-trade"]["n_trades"] == 1
    # i % 3 == 0 for i in 0..11 -> 0,3,6,9 = 4 whale-adverse
    assert g["edge-whale-adverse"]["packet"]["risk"]["whale_adverse_count"] == 4


def test_demo_packets_match_the_stored_fixture_hashes():
    import json, os
    for u in ("demo-disciplined", "demo-moderate", "demo-aggressive"):
        res = json.load(open(os.path.join(run_offline.ROOT, "demo_runs", f"{u}.json")))["council_result"]
        pk = run_offline.load_golden("v2")[u]["packet"]   # 4R-0e: demo_runs re-recorded on the v2 (metrics 1.2.0) packets
        assert res["tradeContext"]["fee_packet_hash"] == pk["fee"]["content_hash"]


def test_offline_runner_is_green_on_fixtures():
    # 4R-0e: the demo_runs fixtures are now stamped with the unrecorded v2 set (determinism check only), so a
    # fixtures-only run checks zero runs and main() rightly returns 1. The v1 recordings are the checked set.
    assert run_offline.main(recordings=True) == 0
