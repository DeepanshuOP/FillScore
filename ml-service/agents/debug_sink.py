"""Opt-in LOCAL grounding debug sink (A3). Off by default.

With FILLSCORE_GROUNDING_DEBUG=1 (and FILLSCORE_DEPLOY unset) each flagged or redacted sentence is
appended to ml-service/.debug/grounding.jsonl so a developer can see what the model wrote that grounding
or the claim check removed. The file is gitignored and dockerignored; a production config
(FILLSCORE_DEPLOY=1) refuses the sink. Nothing here prints, logs or returns the sentence.
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path

DEBUG_PATH = Path(__file__).resolve().parents[1] / ".debug" / "grounding.jsonl"


def _deployed() -> bool:
    """FILLSCORE_DEPLOY=1 (set by the image and render.yaml) or RENDER (set by Render on every service)."""
    return os.environ.get("FILLSCORE_DEPLOY") == "1" or bool(os.environ.get("RENDER", "").strip())


def refused() -> bool:
    return os.environ.get("FILLSCORE_GROUNDING_DEBUG") == "1" and _deployed()


def enabled() -> bool:
    return os.environ.get("FILLSCORE_GROUNDING_DEBUG") == "1" and not _deployed()


def record(agent: str, field: str, kind: str, sentence: str, tokens: list[str]) -> None:
    if not enabled():
        return
    line = json.dumps({"ts": datetime.now(timezone.utc).isoformat(), "agent": agent, "field": field,
                       "kind": kind, "sentence": sentence, "tokens": list(tokens)})
    try:
        DEBUG_PATH.parent.mkdir(parents=True, exist_ok=True)
        with DEBUG_PATH.open("a", encoding="utf-8") as fh:
            fh.write(line + "\n")
    except OSError:
        pass
