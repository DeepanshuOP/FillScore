"""Write backend/src/data/demoV2Grades.ts from ml-service/demo_v2/out/grades_v2.json, so the backend's copy of the
rebuilt demos' v2 grades is generated, never typed. routes/__tests__/auditV2.test.ts fails when the copy differs.

    cd ml-service && .venv/bin/python scripts/gen_demo_grades_ts.py
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "demo_v2" / "out" / "grades_v2.json"
DST = ROOT.parent / "backend" / "src" / "data" / "demoV2Grades.ts"

HEADER = """/**
 * Scoring v2 grades of the three Binance demos rebuilt from real January 2024 prints (M2), copied from
 * ml-service/demo_v2/out/grades_v2.json (built by ml-service/scripts/build_demo_v2.py through the production
 * measurement job and scorer, offline) by ml-service/scripts/gen_demo_grades_ts.py. GET /api/audit/v2 serves them for
 * a demo account only once its rebuilt orders are in the database. A test (routes/__tests__/auditV2.test.ts) fails
 * when this copy differs from the build output. Every number here comes from deterministic code; nothing is typed
 * by hand.
 */
"""


def ts(v, indent: int = 0) -> str:
    pad = "    " * indent
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return repr(v)
    if isinstance(v, str):
        return "'" + v.replace("\\", "\\\\").replace("'", "\\'") + "'"
    if isinstance(v, list):
        return "[" + ", ".join(ts(x, indent) for x in v) + "]"
    if isinstance(v, dict):
        if not v:
            return "{}"
        items = [f"{pad}    {k if k.isidentifier() else repr(k)}: {ts(x, indent + 1)}," for k, x in sorted(v.items())]
        return "{\n" + "\n".join(items) + f"\n{pad}}}"
    raise TypeError(type(v))


def render() -> str:
    data = json.loads(SRC.read_text(encoding="utf-8"))
    return HEADER + "export const DEMO_V2_GRADES = " + ts(data) + " as const;\n\nexport type RebuiltDemoId = keyof typeof DEMO_V2_GRADES;\n"


def main() -> int:
    DST.write_text(render(), encoding="utf-8")
    print(f"wrote {DST}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
