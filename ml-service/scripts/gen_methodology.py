"""Write the measurement methodology page generated from the metric registry.

    cd ml-service && .venv/bin/python scripts/gen_methodology.py           # write
    cd ml-service && .venv/bin/python scripts/gen_methodology.py --check   # exit 1 if the file is stale

The page is generated so the published method cannot drift from the code. tests/measure/test_methodology_doc.py
fails when the committed file differs from the current output.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from config.versions import MEASURE_VERSION  # noqa: E402


def doc_path() -> Path:
    return ROOT.parent / "docs" / "methodology" / f"measurement-v{MEASURE_VERSION}.md"


def render() -> str:
    import measure.benchmarks as benchmarks
    import measure.enrich_fill as enrich_fill
    import measure.metrics  # noqa: F401  every module that registers a metric is imported here,
    import measure.orders  # noqa: F401   so the output does not depend on what was imported before
    import measure.fees  # noqa: F401
    from measure.registry import methodology_markdown

    head, _, metrics = methodology_markdown().partition("\n\n")
    return "\n".join([
        head, "",
        "Generated from the code by `ml-service/scripts/gen_methodology.py`. Do not edit by hand.", "",
        "## Benchmarks", "",
        "```text", benchmarks.__doc__.strip(), "```", "",
        f"Horizons for realized spread and price impact: {', '.join(f'{h} s' for h in enrich_fill.HORIZONS_S)}.", "",
        "## Metrics", "",
        metrics,
    ])


def json_path() -> Path:
    return ROOT.parent / "frontend" / "app" / "methodology" / "methodology.json"


def render_json() -> str:
    """The data behind the /methodology page: metric registry + benchmark rules + the current scoring version."""
    import json

    import measure.benchmarks as benchmarks
    import measure.enrich_fill as enrich_fill
    import measure.fees  # noqa: F401
    import measure.metrics  # noqa: F401
    import measure.orders  # noqa: F401
    from config.versions import SCORING_V2_VERSION
    from measure.registry import REGISTRY
    from scoring_v2.components import ANCHOR_RULE, COMPONENT_DOCS
    from scoring_v2.version import load_version, version_file_sha256

    v = load_version(SCORING_V2_VERSION)
    data = {
        "generatedBy": "ml-service/scripts/gen_methodology.py",
        "measureVersion": MEASURE_VERSION,
        "benchmarks": {"maxQuoteAgeMs": benchmarks.MAX_QUOTE_AGE_MS, "horizonsS": list(enrich_fill.HORIZONS_S)},
        "metrics": [{"id": s.id, "unit": s.unit, "inputs": s.inputs, "doc": s.doc} for s in (REGISTRY[k] for k in sorted(REGISTRY))],
        "scoring": {
            "version": v["id"], "versionFileSha256": version_file_sha256(v["id"]), "weights": v["weights"],
            "bands": v["bands"], "minFills": v["minFills"], "calibrationWindow": v["calibrationWindow"],
            "symbols": sorted(v["anchors"]), "calibrationFiles": len(v["calibrationRefs"]), "feeTable": v["feeTable"],
            "components": COMPONENT_DOCS, "anchorRule": ANCHOR_RULE,
        },
    }
    return json.dumps(data, indent=2, sort_keys=True) + "\n"


def main(argv: list[str]) -> int:
    targets = [(doc_path(), render()), (json_path(), render_json())]
    if "--check" in argv:
        stale = [p for p, t in targets if not p.exists() or p.read_text(encoding="utf-8") != t]
        print("methodology files up to date" if not stale else f"STALE: regenerate {', '.join(map(str, stale))}")
        return 0 if not stale else 1
    for p, t in targets:
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(t, encoding="utf-8")
        print(f"wrote {p}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
