"""4R-0d B4 / 4R-0e C: the cached demo Council runs must not replay the removed regime text to users.
demo_runs/*.json were re-recorded in 4R-0e at prompt v1.6.0 (no regime in the prompt).

`tradeContext.regime` is a legacy schema field (agents/schemas.py) kept so persisted runs still load; it serialises
as `"regime": null`. So the scan checks every JSON *value* (and requires that legacy key to be null) instead of
substring-matching the raw text, which would always trip on the key name."""
import glob
import json
import os

DEMO_RUNS = os.path.join(os.path.dirname(__file__), "..", "demo_runs")


def _walk(node, path=""):
    if isinstance(node, dict):
        for k, v in node.items():
            if k == "regime" and v is not None:
                yield path + "/regime", "non-null regime key"
            yield from _walk(v, f"{path}/{k}")
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from _walk(v, f"{path}[{i}]")
    elif isinstance(node, str):
        if "regime" in node.lower():
            yield path, "regime"
        if "STABLE" in node:
            yield path, "STABLE"


def _violations():
    out = []
    for p in sorted(glob.glob(os.path.join(DEMO_RUNS, "*.json"))):
        data = json.loads(open(p).read())
        out.extend((os.path.basename(p), *v) for v in _walk(data))
    return out


def test_scanner_sees_the_files_and_finds_text(tmp_path):
    assert glob.glob(os.path.join(DEMO_RUNS, "*.json")), "no demo_runs fixtures to scan"


def test_scanner_flags_regime_text_and_non_null_key():
    assert list(_walk({"a": {"regime": None}, "b": ["ok"]})) == []
    assert list(_walk({"a": {"regime": "STABLE"}})) == [("/a/regime", "non-null regime key"),
                                                        ("/a/regime", "STABLE")]
    assert list(_walk({"n": "a Regime shift"})) == [("/n", "regime")]


def test_demo_runs_have_no_regime_text():
    assert _violations() == []
