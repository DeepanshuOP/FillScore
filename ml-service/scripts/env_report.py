"""Load the service env files from Python (python-dotenv) and report variable NAMES only.

Never source a .env file in a shell: an unquoted value with "&" splits into background jobs and the shell's job
notice prints the line (this leaked the Atlas password twice). Shell scripts call this instead:

    .venv/bin/python scripts/env_report.py GROQ_API_KEY MONGODB_URI

Exit 0 when every named variable is non-empty after loading, 1 otherwise. Values are never printed.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import MutableMapping

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from config.env_loader import load_service_env  # noqa: E402

MONGO_ALIASES = ("MONGO_URI", "MONGODB_URL")


def load_and_report(names: list[str], ml_env_path: str, backend_env_path: str,
                    environ: MutableMapping[str, str] | None = None) -> dict:
    env = os.environ if environ is None else environ
    loaded = load_service_env(ml_env_path, backend_env_path, environ=env)
    if not env.get("MONGODB_URI"):
        for alias in MONGO_ALIASES:
            if env.get(alias):
                env["MONGODB_URI"] = env[alias]
                print(f"MONGODB_URI taken from variable {alias} (name only)")
                break
    present = {n: bool(env.get(n)) for n in names}
    print("loaded from the env files (names only): " + (", ".join(sorted(loaded)) or "none"))
    for n in names:
        print(f"{n}: {'set' if present[n] else 'NOT set'}")
    return {"loaded": loaded, "present": present}


def main(argv: list[str]) -> int:
    res = load_and_report(argv, str(ROOT / ".env"), str(ROOT.parent / "backend" / ".env"))
    return 0 if all(res["present"].values()) else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
