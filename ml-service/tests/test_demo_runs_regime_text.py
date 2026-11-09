"""4R-0d B4: the cached demo Council runs must not replay the removed regime text to users.
demo_runs/*.json were recorded at prompt v1.5.0 (regime in the prompt). The re-record (generate_demo_runs.py, live
LLM) was BLOCKED in 4R-0d (RouterExhausted, synthesis fell back to a default), so this is a strict xfail: it
fails today by design and flips to an error (XPASS strict) the moment the fixtures are re-recorded, which is the
cue to delete the marker."""
import glob
import json
import os

import pytest

DEMO_RUNS = os.path.join(os.path.dirname(__file__), "..", "demo_runs")


def _violations():
    out = []
    for p in sorted(glob.glob(os.path.join(DEMO_RUNS, "*.json"))):
        text = open(p).read()
        json.loads(text)
        if "regime" in text.lower():
            out.append((os.path.basename(p), "regime"))
        if "STABLE" in text:
            out.append((os.path.basename(p), "STABLE"))
    return out


def test_scanner_sees_the_files_and_finds_text(tmp_path):
    assert glob.glob(os.path.join(DEMO_RUNS, "*.json")), "no demo_runs fixtures to scan"


@pytest.mark.xfail(strict=True, reason="4R-0d B blocked: demo_runs not yet re-recorded without regime text")
def test_demo_runs_have_no_regime_text():
    assert _violations() == []
