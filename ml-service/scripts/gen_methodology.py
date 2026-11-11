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
    import measure.enrich_fill as enrich_fill  # imports every module that registers metrics
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


def main(argv: list[str]) -> int:
    path, text = doc_path(), render()
    if "--check" in argv:
        ok = path.exists() and path.read_text(encoding="utf-8") == text
        print("methodology doc up to date" if ok else f"STALE: regenerate {path}")
        return 0 if ok else 1
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    print(f"wrote {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
