from agents.llm_client import rollup_token_usage

def test_rollup_token_usage():
    fixture = [
        {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
        {"prompt_tokens": 20, "completion_tokens": 10, "total_tokens": 30},
        {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
    ]
    res = rollup_token_usage(fixture)
    assert res == {"prompt_tokens": 30, "completion_tokens": 15, "total_tokens": 45, "n_calls": 3}

    assert rollup_token_usage([]) == {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0, "n_calls": 0}

    fixture_missing = [{"prompt_tokens": 10, "total_tokens": 10}]
    assert rollup_token_usage(fixture_missing) == {"prompt_tokens": 10, "completion_tokens": 0, "total_tokens": 10, "n_calls": 1}
