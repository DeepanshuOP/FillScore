"""The 3b.2 live plan: what ends up on disk, in what priority order (no network)."""
from collections import Counter

from evals.live_eval import plan_3b2, recording_meta
from tests.council_fakes import make_router


def test_plan_gives_every_user_three_council_and_three_single_runs():
    already = {("council", "demo-disciplined", 1), ("council", "demo-disciplined", 2), ("council", "demo-moderate", 1)}
    final = already | set(plan_3b2())
    for u in ("demo-disciplined", "demo-moderate", "demo-aggressive"):
        assert {n for a, uu, n in final if a == "council" and uu == u} == {1, 2, 3}
        assert {n for a, uu, n in final if a == "single" and uu == u} == {1, 2, 3}
    assert Counter(a for a, _, _ in plan_3b2()) == {"council": 6, "single": 9}
    assert not (already & set(plan_3b2()))


def test_plan_priority_l1_then_single_then_extra_council():
    arms = [a for a, _, _ in plan_3b2()]
    assert arms == ["council"] * 3 + ["single"] * 9 + ["council"] * 3


def test_recording_meta_names_arm_prompt_and_routes():
    router, _ = make_router()
    council, single = recording_meta("council", router), recording_meta("single", router)
    assert council["arm"] == "council" and single["arm"] == "single"
    from config.versions import PROMPT_VERSION, SINGLE_PROMPT_VERSION
    assert council["prompt_version"] == PROMPT_VERSION and single["prompt_version"] == SINGLE_PROMPT_VERSION
    assert single["single_prompt_version"] == SINGLE_PROMPT_VERSION and council["single_prompt_version"] is None
    assert council["route_config_hash"] == router.config.hash
    assert council["synthesis_prompt_sha256"] != single["synthesis_prompt_sha256"]
    assert "synthesis" in single["routes"]
