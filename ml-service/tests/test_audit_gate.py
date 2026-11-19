"""scripts/audit_gate.py: the dependency-audit gate and its allowance for build-time advisories with no fix.

Rules under test (hand-built reports; no network):
  npm: fail on a high or critical advisory (moderate and low are reported, not failing), unless the allowlist holds its
       GHSA id AND npm says no fix is available AND the entry has not expired AND SECURITY.md contains the id.
  pip: pip-audit has no severity; fail on any vulnerability under the same four conditions (fix_versions empty).
"""
from __future__ import annotations

import datetime as dt
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "scripts"))

import audit_gate as g  # noqa: E402

TODAY = dt.date(2026, 11, 19)
GHSA = "GHSA-aaaa-bbbb-cccc"


def npm_report(severity="high", fix=False, ghsa=GHSA, pkg="somepkg"):
    return {"vulnerabilities": {
        pkg: {"name": pkg, "severity": severity, "fixAvailable": fix,
              "via": [{"source": 1, "name": pkg, "title": "t", "url": f"https://github.com/advisories/{ghsa}", "severity": severity}]},
        "wrapper": {"name": "wrapper", "severity": severity, "fixAvailable": fix, "via": [pkg]},
    }}


def entry(**kw):
    e = {"id": GHSA, "ecosystem": "npm", "package": "somepkg", "reason": "build-time only", "expires": "2027-02-01"}
    e.update(kw)
    return e


def test_a_high_advisory_with_no_allowance_fails():
    r = g.evaluate_npm(npm_report(), [], TODAY, "")
    assert len(r.failures) == 1 and GHSA in r.failures[0]


def test_moderate_is_reported_not_failing():
    r = g.evaluate_npm(npm_report(severity="moderate"), [], TODAY, "")
    assert r.failures == [] and len(r.notes) == 1


def test_allowance_needs_every_condition():
    sec = f"build-time only: {GHSA}"
    ok = g.evaluate_npm(npm_report(), [entry()], TODAY, sec)
    assert ok.failures == [] and any("allowed" in n for n in ok.notes)
    # a fix exists: the allowance stops applying
    assert g.evaluate_npm(npm_report(fix=True), [entry()], TODAY, sec).failures
    # expired on 2026-11-18, today is 2026-11-19
    assert g.evaluate_npm(npm_report(), [entry(expires="2026-11-18")], TODAY, sec).failures
    # the same day is still valid (expires is inclusive)
    assert g.evaluate_npm(npm_report(), [entry(expires="2026-11-19")], TODAY, sec).failures == []
    # SECURITY.md does not record the id
    assert g.evaluate_npm(npm_report(), [entry()], TODAY, "nothing here").failures
    # another id is not covered
    assert g.evaluate_npm(npm_report(), [entry(id="GHSA-zzzz-zzzz-zzzz")], TODAY, sec).failures


def test_fix_available_object_counts_as_a_fix():
    rep = npm_report(fix={"name": "somepkg", "version": "2.0.0"})
    assert g.evaluate_npm(rep, [entry()], TODAY, GHSA).failures


def test_pip_any_vulnerability_fails_unless_allowed():
    rep = {"dependencies": [
        {"name": "ok", "version": "1", "vulns": []},
        {"name": "bad", "version": "1", "vulns": [{"id": "PYSEC-1", "aliases": [GHSA], "fix_versions": []}]},
    ]}
    assert len(g.evaluate_pip(rep, [], TODAY, "").failures) == 1
    e = entry(ecosystem="pip", package="bad")
    assert g.evaluate_pip(rep, [e], TODAY, GHSA).failures == []      # matched through the alias
    rep["dependencies"][1]["vulns"][0]["fix_versions"] = ["2"]
    assert g.evaluate_pip(rep, [e], TODAY, GHSA).failures            # a fix exists


def test_an_entry_of_the_other_ecosystem_does_not_apply():
    assert g.evaluate_npm(npm_report(), [entry(ecosystem="pip")], TODAY, GHSA).failures


def test_every_github_action_is_pinned_by_commit_sha_with_a_version_comment():
    import re
    lines = [ln for ln in (REPO / ".github" / "workflows" / "ci.yml").read_text().splitlines() if "uses:" in ln]
    assert lines
    for ln in lines:
        assert re.search(r"uses: [\w./-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$", ln.strip().lstrip("- ")), ln


def test_the_ml_image_installs_from_the_lock_file_and_ci_audits_every_tier_inside_existing_jobs():
    docker = (REPO / "ml-service" / "Dockerfile").read_text()
    assert "requirements.lock" in docker and "requirements.txt" not in docker.replace("requirements.txt is only", "")
    ci = (REPO / ".github" / "workflows" / "ci.yml").read_text()
    for needle in ("audit_gate.py npm backend", "audit_gate.py npm frontend", "audit_gate.py npm mcp-server",
                   "audit_gate.py pip requirements.lock"):
        assert needle in ci
    import yaml
    assert list(yaml.safe_load(ci)["jobs"]) == ["secrets", "backend", "frontend", "mcp", "ml-service", "eval", "e2e"]


def test_the_committed_allowlist_is_valid_and_every_entry_is_recorded_in_security_md():
    data = json.loads((REPO / "security" / "audit-allowlist.json").read_text())
    sec = (REPO / "SECURITY.md").read_text()
    assert isinstance(data["allow"], list)
    for e in data["allow"]:
        assert {"id", "ecosystem", "package", "reason", "expires"} <= set(e)
        assert e["ecosystem"] in ("npm", "pip")
        dt.date.fromisoformat(e["expires"])
        assert e["id"] in sec, f"{e['id']} must be recorded in SECURITY.md as build-time only"
