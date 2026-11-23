"""ADR-0018 for Ask (seventh order, Part B): the answerer returns typed claims (a claim type and value ids, never a digit), code validates them
and writes the sentence from a code-owned template with the existing formatters. Any invalid claim sends the answer to the degraded path.

Hand values (the fixture of tests/test_ask.py, SCORE A 93.4 band 92.5 to 94.1; orders A, B, C):
  total cost  = 2 bps x 10,000 / 1e4 + 4 bps x 20,000 / 1e4 + 6 bps x 10,000 / 1e4 = 2.00 + 8.00 + 6.00 = $16.00
  median total = median(2, 4, 6) = 4 -> "4.0 bps";  median execution = median(1, 2, 3) = 2 -> "2.0 bps"
  fees = 0.5 bps x (10,000 + 20,000 + 10,000) / 1e4 = $2.00
  costliest by USD: B $8.00, C $6.00, A $2.00 -> rank 0 is order B
  expected (hand ctx): paid 2.34 -> "2.3 bps", modelled 1.26 -> "1.3 bps" (one decimal, as the formatter does)
Code-built answer for the tools score and costs (the existing degraded sentence):
  "The measured score is A (93.4 / 100). The orders cost $16.00 in total (median 4.0 bps)."
"""
import asyncio
import re

import pytest

from agents import ask_claims as ac
from agents.ask import ASK_REFUSAL, _FORWARD, ask_flow
from tests.council_fakes import ROUTES, make_router
from tests.test_ask import MS, SCORE

FALLBACK_SCORE_COSTS = "The measured score is A (93.4 / 100). The orders cost $16.00 in total (median 4.0 bps)."


async def _data():
    return SCORE, MS


def _ask(claims=None, planner=None, **answers):
    ans = dict(answers)
    if claims is not None:
        ans["ask_claims"] = claims
    if planner is not None:
        ans["ask_planner"] = planner
    # the synthesis route is served by "groq" (the provider that gets a strict json_schema, ADR-0018); the endpoint is still the fake client
    routes = {**ROUTES, "providers": {"groq": {"base_url": "https://fake.invalid/v1", "key_env": "FAKE_KEY"}},
              "models": {"m1": {"provider": "groq", "model": "fake-small"}, "m2": {"provider": "groq", "model": "fake-big"}}}
    router, provider = make_router(ans, routes=routes)
    out = asyncio.run(ask_flow("How did my orders do?", _data, router, mode="claims"))
    return out, provider


def C(t, *ids):
    return {"claim_type": t, "value_ids": list(ids)}


# ---- the valid path -------------------------------------------------------------------------------------------------------------

def test_a_valid_claim_set_renders_the_exact_sentences_from_the_templates():
    out, provider = _ask({"claims": [C("SCORE_GRADE", "score.grade", "score.composite_score"), C("COST_TOTAL", "costs.total_cost_usd")]})
    assert out["answer"] == "The measured score was A (93.4 / 100). The measured orders cost $16.00 in total."
    assert out["degraded"] is False and out["fallback"] is None
    assert out["answer_kind"] == "claims" and out["ask_prompt_version"] == "2.0.0" and out["ask_claim_rules_version"] == "1.1.0"
    assert out["n_calls"] == 2 and len(provider.calls) == 2
    assert out["claims"] == [C("SCORE_GRADE", "score.grade", "score.composite_score"), C("COST_TOTAL", "costs.total_cost_usd")]
    assert out["values"] == [{"placeholder": "score.grade", "shown": "A"}, {"placeholder": "score.composite_score", "shown": "93.4"},
                             {"placeholder": "costs.total_cost_usd", "shown": "$16.00"}]


def test_each_claim_type_with_its_hand_value():
    ctx = {"score": {"grade": "A", "composite_score": 93.4, "band_low_score": 92.5, "band_high_score": 94.1},
           "costs": {"total_cost_usd": 16.0, "median_total_bps": 4.0, "median_execution_bps": 2.0, "total_fees_usd": 2.0},
           "costliest": {"orders": [{"order_id": "B", "cost_usd": 8.0}, {"order_id": "C", "cost_usd": 6.0}]},
           "expected": {"paid_bps": 2.34, "expected_bps": 1.26, "interval_low_bps": 0.5, "interval_high_bps": 2.04}}
    cases = [
        (C("SCORE_RANGE", "score.band_low_score", "score.band_high_score"), "The score's range ran from 92.5 to 94.1."),
        (C("COST_MEDIAN", "costs.median_total_bps"), "The median order cost 4.0 bps."),
        (C("COST_EXECUTION_MEDIAN", "costs.median_execution_bps"), "The median execution cost was 2.0 bps."),
        (C("FEES_TOTAL", "costs.total_fees_usd"), "Fees came to $2.00."),
        (C("COSTLIEST_ORDER", "costliest.orders.0.order_id", "costliest.orders.0.cost_usd"), "The costliest order was B, at $8.00."),
        (C("COSTLIEST_ORDER", "costliest.orders.1.order_id", "costliest.orders.1.cost_usd"), "Order C was among the costliest, at $6.00."),
        (C("EXPECTED_COMPARE", "expected.paid_bps", "expected.expected_bps"), "Market orders cost 2.3 bps against a modelled 1.3 bps."),
        # the interval is a bootstrap interval of the mean excess (paid minus modelled): expected_cost/aggregate.py lowBps and highBps (review 2026-11-23)
        (C("EXPECTED_INTERVAL", "expected.interval_low_bps", "expected.interval_high_bps"), "The interval of paid minus modelled cost ran from 0.5 bps to 2.0 bps."),
    ]
    for claim, sentence in cases:
        r = ac.validate_claims({"claims": [claim]}, ctx)
        assert r.reason is None, (claim, r.reason)
        assert r.sentences == [sentence], claim


def test_a_costliest_order_is_named_by_the_real_id_but_the_model_sees_only_order_n():
    out, provider = _ask({"claims": [C("COSTLIEST_ORDER", "costliest.orders.0.order_id", "costliest.orders.0.cost_usd")]},
                         planner={"tools": ["costliest"]})
    assert out["answer"] == "The costliest order was B, at $8.00." and out["degraded"] is False
    seen = provider.calls[1]["messages"][1]["content"]
    assert "costliest.orders.0.order_id = order 1" in seen and "order_id = B" not in seen


# ---- degraded: every invalid claim set -----------------------------------------------------------------------------------------

BAD = [
    ("a digit in a value id", {"claims": [C("COST_TOTAL", "16.00")]}, "unknown_value_id"),
    ("an id that is not in the tool results", {"claims": [C("COST_TOTAL", "costs.total_cost_eur")]}, "unknown_value_id"),
    ("an id of a tool that was not run", {"claims": [C("EXPECTED_COMPARE", "expected.paid_bps", "expected.expected_bps")]}, "unknown_value_id"),
    ("a unit mismatch: a bps value in a dollar slot (the old bps-in-bps)", {"claims": [C("COST_TOTAL", "costs.median_total_bps")]}, "unit_mismatch"),
    ("a unit mismatch: dollars in a bps slot", {"claims": [C("COST_MEDIAN", "costs.total_cost_usd")]}, "unit_mismatch"),
    ("the wrong number of ids", {"claims": [C("SCORE_GRADE", "score.grade")]}, "slot_count"),
    # review 2026-11-23: the unit matches but the value is not the one the sentence says it is (rules 1.1.0: each slot names its exact id)
    ("total fees stated as the total cost", {"claims": [C("COST_TOTAL", "costs.total_fees_usd")]}, "value_mismatch"),
    ("the execution median stated as the median cost", {"claims": [C("COST_MEDIAN", "costs.median_execution_bps")]}, "value_mismatch"),
    ("the low end of the range stated as the score", {"claims": [C("SCORE_GRADE", "score.grade", "score.band_low_score")]}, "value_mismatch"),
    ("the ends of a range swapped", {"claims": [C("SCORE_RANGE", "score.band_high_score", "score.band_low_score")]}, "value_mismatch"),
    ("the same end of a range twice", {"claims": [C("SCORE_RANGE", "score.band_low_score", "score.band_low_score")]}, "value_mismatch"),
    ("an unknown claim type", {"claims": [C("PREDICT_COST", "costs.total_cost_usd")]}, "schema_invalid"),
    ("an empty claim set", {"claims": []}, "empty_claims"),
    ("more than three claims", {"claims": [C("COST_TOTAL", "costs.total_cost_usd")] * 4}, "too_many_claims"),
    ("the same claim twice", {"claims": [C("COST_TOTAL", "costs.total_cost_usd")] * 2}, "duplicate_claim"),
    ("free text with a digit instead of claims", {"answer": "The orders cost 500 dollars."}, "schema_invalid"),
    ("an extra text key holding a digit", {"claims": [C("COST_TOTAL", "costs.total_cost_usd")], "note": "saved 500"}, "schema_invalid"),
    ("an extra key inside a claim", {"claims": [{**C("COST_TOTAL", "costs.total_cost_usd"), "text": "about 500"}]}, "schema_invalid"),
]


@pytest.mark.parametrize("name,payload,reason", BAD, ids=[b[0] for b in BAD])
def test_every_invalid_claim_set_goes_to_the_degraded_path_unchanged(name, payload, reason):
    out, _ = _ask(payload)
    assert out["degraded"] is True and out["fallback"] == reason, name
    assert out["answer"] == FALLBACK_SCORE_COSTS               # exactly the code-built answer that exists today
    assert out["answer_kind"] == "claims"
    assert not re.search(r"500", out["answer"])


def test_compare_with_the_interval_ids_and_an_interval_with_the_compare_ids_are_value_mismatches():
    ctx = {"expected": {"paid_bps": 2.34, "expected_bps": 1.26, "interval_low_bps": 0.5, "interval_high_bps": 2.04}}
    assert ac.validate_claims({"claims": [C("EXPECTED_COMPARE", "expected.interval_low_bps", "expected.interval_high_bps")]}, ctx).reason == "value_mismatch"
    assert ac.validate_claims({"claims": [C("EXPECTED_INTERVAL", "expected.paid_bps", "expected.expected_bps")]}, ctx).reason == "value_mismatch"


def test_the_twelve_recorded_claim_sets_of_the_first_measurement_still_pass_the_stricter_rules():
    """B3's runs (ml-service/evals/ask_claims_runs/claims_runs.json) were made under rules 1.0.0; every claim set in them names the exact ids,
    so rules 1.1.0 accept all twelve and the measurement stands."""
    import json
    import pathlib
    runs = json.loads((pathlib.Path(__file__).resolve().parents[1] / "evals" / "ask_claims_runs" / "claims_runs.json").read_text())
    assert len(runs) == 12
    for r in runs:
        res = ac.validate_claims({"claims": r["result"]["claims"]}, r["ctx"])
        assert res.reason is None, (r["question"], res.reason)


def test_an_order_claim_that_mixes_ranks_is_degraded_with_the_code_built_costliest_sentence():
    out, _ = _ask({"claims": [C("COSTLIEST_ORDER", "costliest.orders.0.order_id", "costliest.orders.1.cost_usd")]}, planner={"tools": ["costliest"]})
    assert out["degraded"] is True and out["fallback"] == "rank_mismatch"
    assert out["answer"] == "The order that cost the most was B at $8.00."


def test_a_failed_claims_call_is_degraded_like_a_failed_answerer():
    out, _ = _ask(ask_claims=RuntimeError("model down"))
    assert out["degraded"] is True and out["answer"] == FALLBACK_SCORE_COSTS and out["n_calls"] == 2


# ---- the call, the schema, the templates -------------------------------------------------------------------------------------

def test_the_claims_call_asks_groq_for_a_strict_json_schema_and_the_planner_call_does_not():
    out, provider = _ask()
    planner, claims = provider.calls
    assert "response_format" not in planner
    rf = claims["response_format"]
    assert rf["type"] == "json_schema" and rf["json_schema"]["strict"] is True
    s = rf["json_schema"]["schema"]
    assert s["additionalProperties"] is False and s["required"] == ["claims"]
    item = s["properties"]["claims"]["items"]
    assert item["additionalProperties"] is False and item["required"] == ["claim_type", "value_ids"]
    assert item["properties"]["claim_type"]["enum"] == list(ac.CLAIM_TYPES)
    assert out["degraded"] is False


def test_the_prompt_names_no_account_or_identifier_and_asks_for_no_sentence():
    low = ac.CLAIMS_SYSTEM.lower()
    assert "ask claim selector" in low and "never write a digit" in low
    for bad in ("account id", "token", "demo-"):
        assert bad not in low


def test_a_question_that_needs_no_tool_is_still_refused_before_the_claims_call():
    out, provider = _ask(planner={"tools": []})
    assert out["answer"] == ASK_REFUSAL and out["n_calls"] == 1 and len(provider.calls) == 1


def test_the_template_table_has_no_digit_and_no_forward_advising_or_causal_word():
    from agents import claims as claims_mod
    assert len(ac.TEMPLATES) >= 9
    for name, tpl in ac.TEMPLATES.items():
        for variant in (tpl if isinstance(tpl, tuple) else (tpl,)):
            text = re.sub(r"\{\w+\}", " ", variant)          # the fixed words only: a slot's name is not printed
            assert not re.search(r"\d", re.sub(r"\{\w+\}", "", variant).replace("/ 100", "")), (name, variant)
            assert not _FORWARD.search(text), (name, variant)
            redacted, flags = claims_mod.redact_claims(variant.format(**{k: "X" for k in re.findall(r"\{(\w+)\}", variant)}), set(), "answer")
            assert redacted.strip() == variant.format(**{k: "X" for k in re.findall(r"\{(\w+)\}", variant)}).strip(), (name, variant, flags)
            assert variant.strip().endswith("."), (name, variant)


@pytest.mark.parametrize("path,unit", [
    ("costs.total_cost_usd", "usd"), ("expected.interval_low_bps", "bps"), ("costs.median_total_bps", "bps"), ("score.band_low_score", "score"),
    ("score.composite_score", "score"), ("costs.measured_order_count", "count"), ("score.fill_count", "count"), ("score.grade", "grade"),
    ("costliest.orders.0.order_id", "order"), ("costliest.orders.2.cost_usd", "usd"), ("score.version", None), ("costliest.orders.0.symbol", None),
])
def test_the_unit_of_an_id_is_read_from_its_key_name(path, unit):
    assert ac.unit_of(path) == unit


def test_the_service_uses_the_claims_path_in_production():
    """ask_account (what POST /ml/agents/ask calls) runs mode "claims": the ADR-0018 acceptance for Ask. "free" stays only for comparison."""
    from agents import ask_service
    from config.budget import council_budget

    async def load(_account):
        return SCORE, MS

    council_budget.reset()
    router, _provider = make_router({"ask_claims": {"claims": [C("COST_TOTAL", "costs.total_cost_usd")]}})
    orig = ask_service.load_account_data
    ask_service.load_account_data = load
    try:
        out = asyncio.run(ask_service.ask_account("acct-real-claims", "What did my orders cost?", llm=router))
    finally:
        ask_service.load_account_data = orig
        council_budget.reset()
    assert ask_service.ASK_MODE == "claims"
    assert out["answer_kind"] == "claims" and out["answer"] == "The measured orders cost $16.00 in total." and out["degraded"] is False
