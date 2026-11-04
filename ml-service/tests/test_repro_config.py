import pytest
from eval.repro_config import build_repro_config

def test_build_repro_config():
    from eval.harness import CUTOFF_DATE, EVAL_USERS, EVAL_SYMBOL
    from agents.llm_router import load_routes
    routes = load_routes()
    
    # 1. packet_content_hashes=None
    cfg = build_repro_config(git_commit_hash="abc1234", packet_content_hashes=None)
    
    assert cfg["git_commit_hash"] == "abc1234"
    assert cfg["cutoff_date"] == CUTOFF_DATE
    assert cfg["eval_users"] == EVAL_USERS
    assert cfg["eval_symbol"] == EVAL_SYMBOL
    assert cfg["route_config_hash"] == routes.hash
    first_synth = routes.models[routes.roles["synthesis"][0]]
    assert cfg["llm_routes"]["synthesis"][0] == f"{first_synth.provider}/{first_synth.model}"
    assert set(cfg["llm_routes"]) == set(routes.roles)
    
    assert isinstance(cfg["metrics_version"], str) and len(cfg["metrics_version"]) > 0
    assert isinstance(cfg["prompt_version"], str) and len(cfg["prompt_version"]) > 0
    
    assert cfg["packet_content_hashes"] == {}

    # 2. with explicit packet_content_hashes
    hashes = {"demo-aggressive": "hash1", "demo-moderate": "hash2", "demo-disciplined": "hash3"}
    cfg2 = build_repro_config(git_commit_hash="abc1234", packet_content_hashes=hashes)
    assert cfg2["packet_content_hashes"] == hashes
