import os
import json
import subprocess

def build_repro_config(git_commit_hash: str, packet_content_hashes: dict | None = None) -> dict:
    from eval.harness import CUTOFF_DATE, EVAL_USERS, EVAL_SYMBOL
    from agents.llm_client import SPECIALIST_MODEL, SYNTHESIS_MODEL, SYNTHESIS_PROVIDER
    
    # We found metrics_version="1.0.0" across packet builders
    # We found prompt_version="1.0.0" in persistence.py
    metrics_version = "1.0.0"
    prompt_version = "1.0.0"
    
    return {
        "git_commit_hash": git_commit_hash,
        "cutoff_date": CUTOFF_DATE,
        "eval_users": EVAL_USERS,
        "eval_symbol": EVAL_SYMBOL,
        "specialist_model": SPECIALIST_MODEL,
        "synthesis_model": SYNTHESIS_MODEL,
        "synthesis_provider": SYNTHESIS_PROVIDER,
        "metrics_version": metrics_version,
        "prompt_version": prompt_version,
        "packet_content_hashes": packet_content_hashes if packet_content_hashes is not None else {}
    }


def _get_git_commit_hash() -> str:
    try:
        # Run from repo root (which is parent of ml-service, or ml-service itself if git is initialized there)
        # We will just run it in the current directory and hope git is available
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"], 
            capture_output=True, 
            text=True, 
            check=True
        )
        return result.stdout.strip()
    except Exception:
        return "unknown"


async def generate_repro_config(write: bool = True) -> dict:
    git_hash = _get_git_commit_hash()
    
    # STEP 0 found NO clean reusable function to get cutoff-filtered packet hashes without LLMs.
    # Therefore, we skip building packet_content_hashes here as instructed.
    packet_content_hashes = {}
    
    config = build_repro_config(
        git_commit_hash=git_hash,
        packet_content_hashes=packet_content_hashes
    )
    
    if write:
        out_dir = os.path.join(os.path.dirname(__file__), "artifacts")
        os.makedirs(out_dir, exist_ok=True)
        out_path = os.path.join(out_dir, "repro_config.json")
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2)
            
    return config
