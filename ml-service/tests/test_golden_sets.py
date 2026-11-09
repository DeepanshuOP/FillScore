"""4R-0d: versioned golden sets. v1 = the set the ablation was recorded against (immutable); v2 = regenerated
packets, not yet recorded. Recorded sets get the full invariant run against recordings stamped with that set's
versions; unrecorded sets only get a determinism check. A recorded set can never be silently skipped."""
import json
import os
import shutil

import pytest

from evals import dump_golden_packets, golden_sets, run_offline
from evals.edge_cases import REQUIRED_EVIDENCE, edge_trades
from agents.metrics.loader import build_all_packets
from agents.render import packet_ctx
from tests.test_eval_invariants import good

REAL = golden_sets.GOLDEN_ROOT


def _mk_set(root, name, golden, manifest):
    d = os.path.join(root, name)
    os.makedirs(d)
    json.dump(golden, open(os.path.join(d, f"{golden['id']}.json"), "w"))
    json.dump(manifest, open(os.path.join(d, "MANIFEST.json"), "w"))


def _stamped(res, prompt, metrics):
    res = json.loads(json.dumps(res))
    res["prompt_version"], res["metrics_version"] = prompt, metrics
    return res


def test_v1_provenance_passes():
    g = golden_sets.load_golden("v1")
    runs = run_offline.collect_runs(g, True, "v1")
    # 9 council + 9 single recordings (+ the committed demo fixtures stamped v1.5.0, if still present)
    assert len([r for r in runs if r[0].startswith("rec:")]) == 18
    for label, gid, res in runs:
        out = run_offline.check_all(res, g[gid])["packet_provenance"]
        assert out.ok, f"{label}: {out.detail}"
    assert run_offline.main() == 0


def test_unrecorded_set_skips_recording_checks(tmp_path, capsys):
    from tests.test_eval_invariants import GOLDEN
    g1 = dict(GOLDEN, id="t")
    # v2 packets deliberately differ from what any recording saw; being unrecorded, that must not matter.
    g2 = dict(GOLDEN, id="t", n_trades=999)
    _mk_set(tmp_path, "v1", g1, {"prompt_version": "P1", "metrics_version": "M1", "recorded": True})
    _mk_set(tmp_path, "v2", g2, {"prompt_version": "P2", "metrics_version": "M2", "recorded": False})
    rec = tmp_path / "rec"
    rec.mkdir()
    json.dump({"arm": "council", "golden_id": "t", "run": 1, "council_result": _stamped(good(), "P1", "M1")},
              open(rec / "council-t-1.json", "w"))
    assert golden_sets.recorded_sets(str(tmp_path)) == ["v1"]
    assert run_offline.main(golden_root=str(tmp_path), recordings_dir=str(rec), demo_runs_dir=str(tmp_path / "none")) == 0
    out = capsys.readouterr().out
    assert "council-t-1" in out and "[v2] v2: not recorded, determinism check only" in out
    # a fixture stamped with the unrecorded set's versions is allowed and not checked (fresh re-records sit there)
    demo = tmp_path / "demo"
    demo.mkdir()
    json.dump({"account_id": "t", "council_result": _stamped(good(), "P2", "M2")}, open(demo / "t.json", "w"))
    assert run_offline.main(golden_root=str(tmp_path), recordings_dir=str(rec), demo_runs_dir=str(demo)) == 0


def test_recording_owned_only_by_an_unrecorded_set_fails(tmp_path, capsys):
    from tests.test_eval_invariants import GOLDEN
    _mk_set(tmp_path, "v1", dict(GOLDEN, id="t"), {"prompt_version": "P1", "metrics_version": "M1", "recorded": True})
    _mk_set(tmp_path, "v2", dict(GOLDEN, id="t"), {"prompt_version": "P2", "metrics_version": "M2", "recorded": False})
    rec = tmp_path / "rec"
    rec.mkdir()
    for n, (p, m) in enumerate((("P1", "M1"), ("P2", "M2")), 1):
        json.dump({"arm": "council", "golden_id": "t", "run": n, "council_result": _stamped(good(), p, m)},
                  open(rec / f"council-t-{n}.json", "w"))
    assert run_offline.main(golden_root=str(tmp_path), recordings_dir=str(rec), demo_runs_dir=str(tmp_path / "none")) == 1
    assert "unrecorded set" in capsys.readouterr().out


def test_fixture_matching_no_set_fails_and_zero_runs_fails(tmp_path, capsys):
    from tests.test_eval_invariants import GOLDEN
    _mk_set(tmp_path, "v1", dict(GOLDEN, id="t"), {"prompt_version": "P1", "metrics_version": "M1", "recorded": True})
    demo = tmp_path / "demo"
    demo.mkdir()
    json.dump({"account_id": "t", "council_result": _stamped(good(), "P0", "M0")}, open(demo / "t.json", "w"))
    assert run_offline.main(recordings=False, golden_root=str(tmp_path), demo_runs_dir=str(demo)) == 1
    assert "fixture matches no golden set" in capsys.readouterr().out
    assert run_offline.main(recordings=False, golden_root=str(tmp_path), demo_runs_dir=str(tmp_path / "none")) == 1   # zero runs


def test_recorded_set_with_no_recordings_fails(tmp_path):
    from tests.test_eval_invariants import GOLDEN
    _mk_set(tmp_path, "v1", dict(GOLDEN, id="t"), {"prompt_version": "P1", "metrics_version": "M1", "recorded": True})
    (tmp_path / "rec").mkdir()
    assert run_offline.main(golden_root=str(tmp_path), recordings_dir=str(tmp_path / "rec"),
                            demo_runs_dir=str(tmp_path / "none")) == 1


def test_orphan_recording_fails(tmp_path, capsys):
    from tests.test_eval_invariants import GOLDEN
    _mk_set(tmp_path, "v1", dict(GOLDEN, id="t"), {"prompt_version": "P1", "metrics_version": "M1", "recorded": True})
    rec = tmp_path / "rec"
    rec.mkdir()
    for n, (p, m) in enumerate((("P1", "M1"), ("P0", "M0")), 1):   # second matches no set at all
        json.dump({"arm": "council", "golden_id": "t", "run": n, "council_result": _stamped(good(), p, m)},
                  open(rec / f"council-t-{n}.json", "w"))
    assert run_offline.main(golden_root=str(tmp_path), recordings_dir=str(rec), demo_runs_dir=str(tmp_path / "none")) == 1
    assert "matches no golden set" in capsys.readouterr().out


def test_dump_refuses_to_overwrite_recorded_set():
    with pytest.raises(SystemExit) as e:
        dump_golden_packets.resolve_out_dir("v1")
    assert "recorded" in str(e.value)
    assert dump_golden_packets.resolve_out_dir("v2").endswith(os.path.join("golden", "v2"))
    # a brand-new directory with no manifest is allowed
    assert dump_golden_packets.resolve_out_dir("v9-new").endswith("v9-new")
    for bad in (".", "..", "", "../golden/v1", "v1/"):   # path tricks aimed at the golden root or v1
        with pytest.raises(SystemExit):
            dump_golden_packets.resolve_out_dir(bad)


def test_dump_treats_a_non_false_recorded_flag_as_recorded(tmp_path):
    for i, flag in enumerate(("true", 1, None)):
        d = tmp_path / f"s{i}"
        d.mkdir()
        json.dump({"prompt_version": "P", "metrics_version": "M", "recorded": flag}, open(d / "MANIFEST.json", "w"))
        with pytest.raises(SystemExit):
            dump_golden_packets.resolve_out_dir(f"s{i}", str(tmp_path))


def test_v2_packets_deterministic():
    """The edge packets are built from in-code trades, so they must reproduce hash-identically from the current
    code. The three demo packets need a read-only Mongo read; they are checked when one is reachable (see
    evals/dump_golden_packets.py --check v2), else the check says so and skips that part."""
    g = golden_sets.load_golden("v2")
    assert set(g) >= {"demo-disciplined", "demo-moderate", "demo-aggressive"}
    for name, trades in edge_trades().items():
        ctx = packet_ctx(*build_all_packets(trades, name, "BTCUSDT"))
        for k in ("fee", "risk", "liquidity", "alpha"):
            assert ctx[k]["content_hash"] == g[name]["packet"][k]["content_hash"], (name, k)
        assert g[name]["required_evidence"] == REQUIRED_EVIDENCE
    m = golden_sets.read_manifest("v2")
    from config.versions import METRICS_VERSION, PROMPT_VERSION
    assert (m["prompt_version"], m["metrics_version"], m["recorded"]) == (PROMPT_VERSION, METRICS_VERSION, False)
    for gid, gg in g.items():   # every packet in the set was built by the current metrics code
        assert all(gg["packet"][k]["metrics_version"] == METRICS_VERSION for k in ("fee", "risk", "liquidity", "alpha")), gid
    mismatches = dump_golden_packets.check_demo_hashes("v2")
    if mismatches is None:
        pytest.skip("no reachable Mongo: demo packet determinism not checked here")
    assert mismatches == []


def test_v1_manifest_pins_the_ablation_versions():
    m = golden_sets.read_manifest("v1")
    assert m == {"prompt_version": "1.5.0", "single_prompt_version": "1.0.0", "metrics_version": "1.1.0",
                 "recorded": True,
                 "note": "ablation results in ablation_results.md were produced from this set"}
