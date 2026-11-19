"""No script or doc may tell anyone to source an env file in a shell.

Cause (2026-11): `set -a; . ml-service/<env file>` split an unquoted URI at "&" into background jobs and the shell's
job notice printed the line, leaking the Atlas password twice. Scripts load env values themselves (python-dotenv or
dotenv) and print names only.

Exempt: the guard's own deny tests, the old plan that lists denied commands, and the notes that describe the incident.
"""
from __future__ import annotations

import re
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
PATTERNS = [
    re.compile(r"\bset\s+-a\b"),
    re.compile(r"(^|[;&|(\s`])source\s+\S*\.env\b"),
    re.compile(r"(^|[;&|(`])\s*\.\s+\S*\.env\b"),
    re.compile(r"export\s+\$\(.*\.env"),
]
EXEMPT = {
    ".claude/hooks/test_guard.sh",
    "docs/superpowers/plans/2026-11-07-phase-4r0.md",
    "docs/research/LOG.md",
    "docs/PROGRESS.md",
    "docs/runbooks/SECRETS.md",
    "ml-service/tests/test_no_env_sourcing.py",
}


def _tracked() -> list[str]:
    out = subprocess.run(["git", "ls-files"], cwd=REPO, capture_output=True, text=True, check=True).stdout
    return [p for p in out.splitlines() if p.endswith((".sh", ".md", ".yml", ".yaml", ".txt", ".py", ".ts", ".json"))]


def test_no_tracked_file_sources_an_env_file():
    hits = []
    for rel in _tracked():
        if rel in EXEMPT or rel.endswith(("package-lock.json", "requirements.lock")) or "/node_modules/" in rel:
            continue
        path = REPO / rel
        if not path.is_file():
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        for n, line in enumerate(text.splitlines(), 1):
            if any(p.search(line) for p in PATTERNS):
                hits.append(f"{rel}:{n}")
    assert hits == [], "sourcing an env file is forbidden; load it with python-dotenv/dotenv instead: " + ", ".join(hits)


def test_the_patterns_catch_the_original_incident_line():
    line = "set -a; . ml-service/.env; set +a"
    assert any(p.search(line) for p in PATTERNS)
    assert any(p.search("source backend/.env") for p in PATTERNS)
    assert not any(p.search("dotenv.config()") for p in PATTERNS)
