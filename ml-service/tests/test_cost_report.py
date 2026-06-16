import pytest
from eval.cost_report import aggregate_costs

def test_aggregate_costs():
    runs = [
        {
            "run_id": "R1",
            "user_id": "demo-aggressive",
            "symbol": "BTCUSDT",
            "total_latency_ms": 11000.0,
            "model_usage": {"synthesis_model": "llama-3.3-70b-versatile (groq)"},
            "token_usage": {
                "prompt_tokens": 10000,
                "completion_tokens": 1000,
                "total_tokens": 11000,
                "n_calls": 9
            }
        },
        {
            "run_id": "R2",
            "user_id": "demo-aggressive",
            "symbol": "BTCUSDT",
            "total_latency_ms": 13000.0,
            "model_usage": {"synthesis_model": "llama-3.3-70b-versatile (groq)"},
            "token_usage": {
                "prompt_tokens": 20000,
                "completion_tokens": 2000,
                "total_tokens": 22000,
                "n_calls": 9
            }
        },
        {
            "run_id": "R3",
            "user_id": "demo-aggressive",
            "symbol": "BTCUSDT",
            "total_latency_ms": 15000.0,
            "model_usage": {"synthesis_model": "llama-3.3-70b-versatile (groq)"},
            "token_usage": {} # Should be skipped
        },
        {
            "run_id": "R4",
            "user_id": "demo-aggressive",
            "symbol": "BTCUSDT",
            "total_latency_ms": 16000.0,
            "model_usage": {"synthesis_model": "llama-3.3-70b-versatile (groq)"}
            # No token_usage at all, should be skipped
        }
    ]

    agg = aggregate_costs(runs)

    assert len(agg["rows"]) == 2
    
    # Check row 1
    r1 = agg["rows"][0]
    assert r1["run_id"] == "R1"
    assert r1["user_symbol"] == "demo-aggressive/BTCUSDT"
    assert r1["model"] == "llama-3.3-70b-versatile (groq)"
    assert r1["prompt_tokens"] == 10000
    assert r1["completion_tokens"] == 1000
    assert r1["total_tokens"] == 11000
    assert r1["n_calls"] == 9
    assert r1["latency_ms"] == 11000.0
    assert r1["cost_usd"] == 0.00

    # Check totals
    t = agg["totals"]
    assert t["total_tokens"] == 33000
    assert t["prompt_tokens"] == 30000
    assert t["completion_tokens"] == 3000
    assert t["n_runs"] == 2
    assert t["avg_total_tokens"] == 16500.0
    assert t["avg_latency_ms"] == 12000.0
