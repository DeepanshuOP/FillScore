"""K4: ablation table arithmetic on hand-made recordings, and byte-for-byte regeneration."""
import json
import os

from evals import ablation
from tests.test_eval_invariants import GOLDEN, good

HERE = os.path.dirname(__file__)


def council(rating, viol1, redactions, calls, tin, tout, ms, degraded=False, proposed=2, passed=1):
    r = good()
    r["synthesis"]["overallRating"] = rating
    r["degraded"] = degraded
    r["grounding"].update(violations_first_pass=viol1, redactions=[{}] * redactions, fallbacks=[])
    r["claims"] = {"flagged_first_pass": 1, "debate_flagged": 3}
    r["verification"] = {"proposed": proposed, "passed": passed}
    r["llm_calls"] = [{}] * calls
    r["tokenUsage"] = {"prompt_tokens": tin, "completion_tokens": tout}
    r["totalLatencyMs"] = ms
    return r


def single(rating, calls, tin, tout, ms):
    r = council(rating, 0, 0, calls, tin, tout, ms, proposed=1, passed=1)
    for k in ("liquidity", "alpha", "risk", "fee"):
        r.pop(k)
    r["grounding"]["per_agent"] = {"synthesis": {"values_cited": 3}}
    r["synthesis"]["narrative"] = "Makers were 50.0%, adverse 11.0%, slippage 2.4 bps."
    return r


def write(dirpath, arm, n, res):
    with open(os.path.join(dirpath, f"{arm}-t-{n}.json"), "w") as f:
        json.dump({"arm": arm, "golden_id": "t", "run": n, "council_result": res}, f)


def fixture(tmp_path):
    write(tmp_path, "council", 1, council("GOOD", 2, 1, 9, 1000, 100, 10000))
    write(tmp_path, "council", 2, council("GOOD", 0, 0, 11, 3000, 300, 20000))
    write(tmp_path, "council", 3, council(None, 5, 5, 4, 10, 10, 1, degraded=True))
    write(tmp_path, "single", 1, single("GOOD", 1, 500, 50, 2000))
    write(tmp_path, "single", 2, single("FAIR", 1, 500, 50, 4000))
    return ablation.load_recordings(str(tmp_path))


def test_table_numbers_by_hand(tmp_path):
    rows = ablation.summarise(fixture(tmp_path), {"t": GOLDEN})
    c, s = rows[("council", "t")], rows[("single", "t")]
    # council: 2 completed + 1 degraded (excluded everywhere else)
    assert (c["completed"], c["degraded"]) == (2, 1)
    assert c["viol1"] == 1.0            # (2 + 0) / 2
    assert c["redact"] == 0.5           # (1 + 0) / 2
    assert c["calls"] == 10.0           # (9 + 11) / 2
    assert (c["tok_in"], c["tok_out"], c["wall_s"]) == (2000.0, 200.0, 15.0)
    assert c["agree"] == (1, 1)         # GOOD, GOOD
    assert c["inv_all"] == (12, 12) and c["agent_ev"] == (2, 2) and s["agent_ev"] is None   # Council-only column
    assert (c["proposed"], c["passed"]) == (4, 2)
    assert (c["claims_syn"], c["claims_deb"]) == (1.0, 3.0)
    assert rows[("council", "ALL")]["agree"] == (1, 1)
    # single: GOOD vs FAIR disagree
    assert (s["completed"], s["degraded"]) == (2, 0) and s["agree"] == (0, 1) and s["calls"] == 1.0
    assert s["inv_all"] == (12, 12)


def test_cost_ratio_line(tmp_path):
    rows = ablation.summarise(fixture(tmp_path), {"t": GOLDEN})
    # calls 10.0/1.0, tokens in 2000/500, out 200/50, wall 15.0/3.0
    assert ablation.cost_ratio(rows) == ("Cost ratio (Council / single, means over completed runs): LLM calls 10.0x, "
                                         "tokens in 4.0x, tokens out 4.0x, wall time 5.0x.")


def test_degraded_runs_do_not_enter_quality_means(tmp_path):
    runs = fixture(tmp_path)
    md = ablation.render(runs, {"t": GOLDEN}, "NOTES")
    assert "| Council (9 calls) | t | 2 / 1 |" in md and md.rstrip().endswith("NOTES")


def test_render_is_deterministic_and_regenerates_the_committed_file():
    first = ablation.generate()
    assert first == ablation.generate()
    committed = os.path.join(HERE, "..", "evals", "ablation_results.md")
    assert os.path.exists(committed), "run: python evals/ablation.py"
    assert open(committed).read() == first, "ablation_results.md is stale: run python evals/ablation.py"
