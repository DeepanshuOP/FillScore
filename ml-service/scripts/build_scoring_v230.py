"""Write ml-service/scoring_v2/versions/v2.3.0.json (ADR-0014): the implementation-shortfall decomposition.

v2.3.0 recalibrates nothing. It takes the calibration of v2.2.0 unchanged (same 90 days, same spread and impact anchors,
same hour profiles and floors; a test pins that) and changes how a score is read: three components named after the
shortfall terms (execution, fees, unfilled), equal weights, timing reported but not scored.

    cd ml-service && .venv/bin/python scripts/build_scoring_v230.py

Refuses to overwrite an existing v2.3.0.json: a committed version is never edited (ADR-0010).
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scoring_v2.version import VERSIONS_DIR, code_hash, dumps_version, load_version  # noqa: E402

NEW_ID = "v2.3.0"
WEIGHTS = {"execution": 1 / 3, "fees": 1 / 3, "unfilled": 1 / 3}


def build() -> dict:
    v = load_version("v2.2.0")
    v.update({
        "id": NEW_ID,
        "weights": WEIGHTS,
        "decomposition": "implementation_shortfall",
        "timingScored": False,
        "components": {
            "execution": "order unit: mean of the spread score and the impact score (duration anchors)",
            "fees": "fill unit: fee paid against the account's best available rate",
            "unfilled": "order unit: fill_ratio x 100 + (1 - fill_ratio) x S(drift per unit unfilled, duration anchors)",
        },
        "codeHash": code_hash(),
    })
    return v


def main() -> int:
    path = VERSIONS_DIR / f"{NEW_ID}.json"
    if path.exists():
        print(f"refusing: {path} exists (a committed version is never edited)")
        return 1
    path.write_text(dumps_version(build()), encoding="utf-8")
    print(f"wrote {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
