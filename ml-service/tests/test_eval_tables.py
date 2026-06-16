import pytest
from eval.table_renderers import (
    render_table1_faithfulness,
    render_table2_consistency,
    render_table3_utility,
    render_eval_tables_placeholder
)

@pytest.fixture
def eval_fixture():
    # Shape matches run_full_eval return format
    return {
        "demo-disciplined": {
            "user_id": "demo-disciplined",
            "n_runs": 3,
            "E1_avg_faithfulness": 0.95,
            "E2_agreement": {
                "overall": {"agreement_rate": 0.9},
                "fee": {"agreement_rate": 0.8},
                "risk": {"agreement_rate": 0.85},
                "liquidity": {"agreement_rate": 0.95}
            },
            "E2_avg_agreement_rate": 0.875,
            "avg_latency_ms": 11000.5
        },
        "demo-moderate": {
            "user_id": "demo-moderate",
            "n_runs": 3,
            "E1_avg_faithfulness": 0.92,
            "E2_agreement": {
                "overall": {"agreement_rate": 0.8},
                "fee": {"agreement_rate": 0.75},
                "risk": {"agreement_rate": 0.8},
                "liquidity": {"agreement_rate": 0.9}
            },
            "E2_avg_agreement_rate": 0.8125,
            "avg_latency_ms": 12000.0
        },
        "demo-aggressive": {
            "user_id": "demo-aggressive",
            "n_runs": 3,
            "E1_avg_faithfulness": 0.88,
            "E2_agreement": {
                "overall": {"agreement_rate": 0.7},
                "fee": {"agreement_rate": 0.6},
                "risk": {"agreement_rate": 0.7},
                "liquidity": {"agreement_rate": 0.8}
            },
            "E2_avg_agreement_rate": 0.7,
            "avg_latency_ms": 13000.0
        }
    }

def test_render_table1(eval_fixture):
    out = render_table1_faithfulness(eval_fixture)
    assert "demo-disciplined" in out
    assert "demo-moderate" in out
    assert "demo-aggressive" in out
    assert "0.95" in out

def test_render_table2(eval_fixture):
    out = render_table2_consistency(eval_fixture)
    assert "demo-disciplined" in out
    assert "demo-moderate" in out
    assert "demo-aggressive" in out

def test_render_table3(eval_fixture):
    out = render_table3_utility(eval_fixture)
    assert "demo-disciplined" in out
    assert "demo-moderate" in out
    assert "demo-aggressive" in out

def test_render_placeholder():
    out = render_eval_tables_placeholder()
    assert "PENDING" in out
    assert "run_full_eval" in out
