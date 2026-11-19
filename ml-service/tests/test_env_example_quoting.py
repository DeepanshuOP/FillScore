"""Every value in a committed env template that can contain & ? or # (or a space) must be quoted.

Why: an unquoted value splits at "&" or "#" when a shell, a compose file or a careless script reads the file.
Proposed location: ml-service/tests/test_env_example_quoting.py. Reports file:line and the key NAME only.
Not run by the agent: the agent is denied read access to env template files (permission settings, 2026-11-19).
"""
from __future__ import annotations

import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
TEMPLATES = ["backend/.env.example", "ml-service/.env.example", "frontend/.env.example"]
RISKY = re.compile(r"[&?#\s]")


def unquoted_risky(text: str) -> list[tuple[int, str]]:
    bad = []
    for n, raw in enumerate(text.splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.strip()
        quoted = len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'"
        if not quoted and RISKY.search(value.split(" #", 1)[0] if value.startswith(("http", "mongodb")) else value):
            bad.append((n, key.strip()))
    return bad


def test_detector_on_hand_cases():
    assert unquoted_risky("A=mongodb://u:p@h/db?retryWrites=true&w=majority\n") == [(1, "A")]
    assert unquoted_risky('A="mongodb://u:p@h/db?retryWrites=true&w=majority"\n') == []
    assert unquoted_risky("B=plain\n# C=x&y\n\n") == []
    assert unquoted_risky("D=a b\n") == [(1, "D")]


def test_templates_quote_risky_values():
    for rel in TEMPLATES:
        p = REPO / rel
        if p.exists():
            assert unquoted_risky(p.read_text(encoding="utf-8")) == [], rel
