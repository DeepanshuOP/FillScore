"""A0: the e2e no-LLM flag must never be live in a deployed environment."""
from __future__ import annotations

import os


def assert_no_e2e_flag_in_production(env=None) -> None:
    env = os.environ if env is None else env
    deployed = env.get("FILLSCORE_DEPLOY") == "1" or "RENDER" in env
    if deployed and env.get("FILLSCORE_E2E_NO_LLM") == "1":
        raise RuntimeError(
            "Refusing to start: FILLSCORE_E2E_NO_LLM=1 is set in a deployed environment "
            "(FILLSCORE_DEPLOY=1 or RENDER present). It disables every LLM call; unset it."
        )
