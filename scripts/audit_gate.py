#!/usr/bin/env python3
"""Dependency-audit gate for CI.

    python3 scripts/audit_gate.py npm backend          # npm audit --omit=dev in that folder
    python3 scripts/audit_gate.py pip ml-service/requirements.lock   # pip-audit on the lock file

Fails (exit 1) on a high or critical npm advisory, or on any pip-audit vulnerability, unless security/audit-allowlist.json
allows it. An allowance applies only while ALL of these hold (so it cannot hide a fixable problem or live forever):
  1. the entry names the advisory id (a GHSA id, or a pip-audit alias) and the ecosystem;
  2. the tool reports NO fix for it (npm fixAvailable false; pip-audit fix_versions empty);
  3. the entry has not expired (`expires`, an ISO date, inclusive);
  4. SECURITY.md contains the id (that is where the reason, "build-time only", is recorded for readers).
When a fix appears or the date passes, the job fails again, which is the signal to upgrade or to review the entry.
Moderate and low npm advisories are printed, not failing (the same bar as the earlier `--audit-level=high`).
"""
from __future__ import annotations

import datetime as dt
import json
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
ALLOWLIST = REPO / "security" / "audit-allowlist.json"
FAILING_NPM = {"high", "critical"}


@dataclass
class Result:
    failures: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)


def _allowed(entries, ecosystem: str, ids: list[str], has_fix: bool, today: dt.date, security_text: str):
    """Return (allowed, why_not) for one advisory."""
    cands = [e for e in entries if e.get("ecosystem") == ecosystem and e.get("id") in ids]
    if not cands:
        return False, "not in the allowlist"
    e = cands[0]
    if has_fix:
        return False, "a fix is available now"
    if dt.date.fromisoformat(e["expires"]) < today:
        return False, f"allowance expired on {e['expires']}"
    if e["id"] not in security_text:
        return False, "SECURITY.md does not record it"
    return True, e.get("reason", "")


def evaluate_npm(report: dict, entries: list, today: dt.date, security_text: str) -> Result:
    res = Result()
    for name, v in (report.get("vulnerabilities") or {}).items():
        has_fix = bool(v.get("fixAvailable"))
        for via in v.get("via", []):
            if not isinstance(via, dict):
                continue   # a dependent package; the advisory is reported on the package that carries it
            ghsa = (via.get("url") or "").rstrip("/").rsplit("/", 1)[-1]
            sev = via.get("severity", v.get("severity", "")).lower()
            line = f"npm {via.get('name', name)} {sev} {ghsa} fix={'yes' if has_fix else 'no'}"
            if sev not in FAILING_NPM:
                res.notes.append(f"{line} (below the failing level)")
                continue
            ok, why = _allowed(entries, "npm", [ghsa], has_fix, today, security_text)
            if ok:
                res.notes.append(f"{line} allowed: {why}")
            else:
                res.failures.append(f"{line} FAILS: {why}")
    return res


def evaluate_pip(report: dict, entries: list, today: dt.date, security_text: str) -> Result:
    res = Result()
    for dep in report.get("dependencies", []):
        for vuln in dep.get("vulns") or []:
            ids = [vuln["id"], *vuln.get("aliases", [])]
            has_fix = bool(vuln.get("fix_versions"))
            line = f"pip {dep['name']}=={dep['version']} {vuln['id']} fix={'yes' if has_fix else 'no'}"
            ok, why = _allowed(entries, "pip", ids, has_fix, today, security_text)
            if ok:
                res.notes.append(f"{line} allowed: {why}")
            else:
                res.failures.append(f"{line} FAILS: {why}")
    return res


def _load_allow() -> list:
    return json.loads(ALLOWLIST.read_text(encoding="utf-8"))["allow"]


def _json_from(text: str) -> dict:
    return json.loads(text[text.index("{"):])


def main(argv: list[str]) -> int:
    if len(argv) != 2 or argv[0] not in ("npm", "pip"):
        print(__doc__)
        return 2
    kind, target = argv
    security_text = (REPO / "SECURITY.md").read_text(encoding="utf-8")
    today = dt.date.today()
    if kind == "npm":
        proc = subprocess.run(["npm", "audit", "--omit=dev", "--json"], cwd=REPO / target, capture_output=True, text=True)
        if not proc.stdout.strip():
            print(f"npm audit gave no output (exit {proc.returncode}): the gate cannot judge, failing")
            return 1
        res = evaluate_npm(_json_from(proc.stdout), _load_allow(), today, security_text)
    else:
        proc = subprocess.run(["pip-audit", "-r", target, "--no-deps", "--disable-pip", "-f", "json"],
                              capture_output=True, text=True)
        if not proc.stdout.strip():
            print(f"pip-audit gave no output (exit {proc.returncode}): the gate cannot judge, failing")
            return 1
        res = evaluate_pip(_json_from(proc.stdout), _load_allow(), today, security_text)
    for n in res.notes:
        print(n)
    for f in res.failures:
        print(f)
    print(f"{kind} audit gate: {'FAIL' if res.failures else 'ok'} ({len(res.failures)} failing, {len(res.notes)} noted)")
    return 1 if res.failures else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
