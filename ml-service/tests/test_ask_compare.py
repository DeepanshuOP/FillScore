"""The measurement of the two Ask paths (B3). Hand cases for the classification and the summary, and one offline run of both paths through the
fake provider (the same code the live script calls)."""
import asyncio

from evals import ask_compare as cmp
from tests.council_fakes import make_router
from tests.test_ask import MS, SCORE


def rec(path, answer, degraded=False, raw=None, attempts=2, outcomes=("ok",), fallback=None, tools=("score",), kind=None):
    result = {"answer": answer, "degraded": degraded, "fallback": fallback, "tools_used": list(tools), "n_calls": 2}
    if kind:
        result["answer_kind"] = kind
    return {"path": path, "question": "q", "result": result, "http_attempts": attempts, "outcomes": list(outcomes), "raw_answer": raw}


def test_a_free_answer_is_written_as_the_model_wrote_it_only_if_code_changed_nothing():
    ctx = {"score": {"grade": "A"}}
    same = rec("free", "The score was A.", raw="The score was {{score.grade}}.")
    assert cmp.classify(same, ctx) == "written"
    altered = rec("free", "The score was A.", raw="You saved 500 dollars. The score was {{score.grade}}.")   # a sentence was removed
    assert cmp.classify(altered, ctx) == "altered"
    assert cmp.classify(rec("free", "x", degraded=True, fallback="why"), ctx) == "degraded"
    assert cmp.classify(rec("free", "refusal", tools=()), ctx) == "refused"


def test_a_claims_answer_that_passed_is_written_as_chosen_and_a_failed_one_is_degraded():
    assert cmp.classify(rec("claims", "The costs.", kind="claims"), {}) == "written"
    assert cmp.classify(rec("claims", "x", degraded=True, fallback="unit_mismatch", kind="claims"), {}) == "degraded"


def test_schema_invalid_is_an_invalid_reply_of_the_answerer_or_a_fallback_of_that_name():
    assert cmp.schema_invalid(rec("free", "a", outcomes=("invalid_json", "ok"))) is True      # one invalid reply, then a good one
    assert cmp.schema_invalid(rec("claims", "a", degraded=True, fallback="schema_invalid", outcomes=("invalid_json", "invalid_json"))) is True
    assert cmp.schema_invalid(rec("claims", "a", degraded=True, fallback="unit_mismatch")) is False
    assert cmp.schema_invalid(rec("free", "a")) is False


def test_summary_hand_case():
    # 4 questions: written (2 calls), altered (2), degraded (3 calls: one invalid reply, then a good one), refused (1 call)
    ctx = {"score": {"grade": "A"}}
    rs = [rec("free", "A.", raw="{{score.grade}}."), rec("free", "A.", raw="500. {{score.grade}}."),
          rec("free", "x", degraded=True, fallback="y", attempts=3, outcomes=("invalid_json", "ok")), rec("free", "no", tools=(), attempts=1, outcomes=())]
    s = cmp.summarize(rs, [ctx] * 4)
    # calls 2 + 2 + 3 + 1 = 8, mean 8 / 4 = 2.0
    assert s == {"questions": 4, "written": 1, "altered": 1, "degraded": 1, "refused": 1, "schema_invalid": 1, "calls_total": 8, "calls_mean": 2.0}


def test_both_paths_run_offline_on_the_same_question_and_count_their_calls():
    router, _provider = make_router({"ask_answerer": {"answer": "The measured score was {{score.grade}} at {{score.composite_score}}."},
                                     "ask_claims": {"claims": [{"claim_type": "SCORE_GRADE", "value_ids": ["score.grade", "score.composite_score"]}]}})

    async def load():
        return SCORE, MS

    old = asyncio.run(cmp.run_question(router, "free", "How did my orders do?", load))
    new = asyncio.run(cmp.run_question(router, "claims", "How did my orders do?", load))
    assert old["result"]["answer"] == "The measured score was A at 93.4." and cmp.classify(old, {"score": {"grade": "A", "composite_score": 93.4}}) == "written"
    assert new["result"]["answer"] == "The measured score was A (93.4 / 100)." and new["result"]["answer_kind"] == "claims"
    assert old["http_attempts"] == 2 and new["http_attempts"] == 2 and old["outcomes"] == ["ok"] and new["outcomes"] == ["ok"]
    assert old["raw_answer"] == "The measured score was {{score.grade}} at {{score.composite_score}}." and new["raw_answer"] is not None
