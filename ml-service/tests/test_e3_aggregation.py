import pytest

def test_aggregate_e3():
    from eval.harness import aggregate_e3
    # 3 single eval results
    runs = [
        {
            "E3_total_recs": 3,
            "E3_recommendations": [
                {"action_type": "some_action", "passed": True},
                {"action_type": "other_action", "passed": False},
                {"action_type": "general_improvement", "passed": True}
            ]
        },
        {
            "E3_total_recs": 2,
            "E3_recommendations": [
                {"action_type": "action_a", "passed": True},
                {"action_type": "action_b", "passed": True}
            ]
        },
        {
            "E3_total_recs": 3,
            "E3_recommendations": [
                {"action_type": "general_improvement", "passed": True},
                {"action_type": "general_improvement", "passed": True},
                {"action_type": "action_c", "passed": False}
            ]
        }
    ]

    agg = aggregate_e3(runs)

    assert agg["E3_total_recs_all_runs"] == 8
    assert agg["E3_overall_pass_rate"] == 6 / 8  # 6 total passes
    assert agg["E3_actionable_total"] == 5       # 5 actionable recs
    assert agg["E3_actionable_pass_rate"] == 3 / 5  # 3 actionable passes out of 5
    assert agg["E3_pct_general_improvement"] == 3 / 8

def test_aggregate_e3_zero_actionable():
    from eval.harness import aggregate_e3
    runs = [
        {
            "E3_total_recs": 3,
            "E3_recommendations": [
                {"action_type": "general_improvement", "passed": True},
                {"action_type": "general_improvement", "passed": True},
                {"action_type": "general_improvement", "passed": True}
            ]
        },
        {
            "E3_total_recs": 3,
            "E3_recommendations": [
                {"action_type": "general_improvement", "passed": False},
                {"action_type": "general_improvement", "passed": True},
                {"action_type": "general_improvement", "passed": False}
            ]
        }
    ]
    agg = aggregate_e3(runs)
    assert agg["E3_total_recs_all_runs"] == 6
    assert agg["E3_pct_general_improvement"] == 1.0
    assert agg["E3_actionable_total"] == 0
    assert agg["E3_actionable_pass_rate"] is None
