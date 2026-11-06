"""Re-run the current deterministic claim check on demo fixtures. No LLM calls, no network, no DB.

    .venv/bin/python scripts/reapply_claim_check.py            # dry run: print before/after sentences
    .venv/bin/python scripts/reapply_claim_check.py --write    # save, only if the result passes check_council_run

Every displayed text field (synthesis, findings, observations, debate, specialist prose) goes through
`redact_claims` (strict for debate text). A claim or list item left empty is dropped when the side/list keeps
another; a required scalar left empty makes the script REFUSE (nothing written). The script also REFUSES if any
numeric leaf of the document would change.
"""
from __future__ import annotations

import argparse
import copy
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from agents.acceptance import accept_run  # noqa: E402
from agents.claims import KEY_DISPUTE_FALLBACK, redact_claims  # noqa: E402

SCALARS = [("liquidity", "slippageRoot"), ("alpha", "bestAlternative"), ("fee", "recommendedAction")]
LISTS = [("risk", "flags")]


class Refuse(Exception):
    pass


def numeric_leaves(x, path=""):
    if isinstance(x, bool):
        return
    if isinstance(x, (int, float)):
        yield path, x
    elif isinstance(x, dict):
        for k, v in x.items():
            yield from numeric_leaves(v, f"{path}.{k}")
    elif isinstance(x, list):
        for i, v in enumerate(x):
            yield from numeric_leaves(v, f"{path}.{i}")


def reapply(doc: dict) -> tuple[dict, list[tuple[str, str, str]]]:
    """Return (new doc, [(field, before, after)]). Raises Refuse."""
    new = copy.deepcopy(doc)
    r = new["council_result"]
    passed = {f["action_type"] for f in r["synthesis"].get("findings", [])}
    changes: list[tuple[str, str, str]] = []

    # same whale rule as claims.enforce_debate: whale wording is allowed only beside the stored whale count
    whale_n = float(r.get("risk", {}).get("whale_adverse_count") or 0)
    whale_ok = whale_n > 0
    whale_token = f"{int(round(whale_n)):,}" if whale_ok else None

    ledger = r.setdefault("claims", {})

    def scrub(text: str, field: str, strict: bool = False) -> str:
        out, flags = redact_claims(text, passed, field, strict=strict, whale_ok=whale_ok, whale_token=whale_token)
        # Keep the stored claims ledger in step with what was just redacted: strict (debate) sentences count into
        # debate_flagged / debate_redactions, synthesis sentences are appended to redactions. flagged_first_pass is
        # the historical first-pass count and is not rewritten.
        if flags and strict:
            ledger["debate_flagged"] = int(ledger.get("debate_flagged", 0)) + len(flags)
            ledger.setdefault("debate_redactions", []).extend(f.to_dict() for f in flags)
        elif flags:
            ledger.setdefault("redactions", []).extend(f.to_dict() for f in flags)
        out = re.sub(r"(?<![\d.])-(0\.0)(?= bps|%)", r"\1", out)   # negative zero, as in render._no_neg_zero
        if out != text:
            changes.append((field, text, out))
        return out

    for sec, key in SCALARS:
        if isinstance(r.get(sec, {}).get(key), str):
            r[sec][key] = scrub(r[sec][key], f"{sec}.{key}")
            if not r[sec][key].strip():
                raise Refuse(f"{sec}.{key} would be empty")
    for sec, key in LISTS:
        items = r.get(sec, {}).get(key)
        if isinstance(items, list):
            r[sec][key] = [t for i, s in enumerate(items) if (t := scrub(s, f"{sec}.{key}.{i}")).strip()]
    s = r["synthesis"]
    for key in ("headline", "narrative"):
        s[key] = scrub(s[key], key)
        if not s[key].strip():
            raise Refuse(f"{key} would be empty")
    kept = []
    for i, o in enumerate(s.get("observations", [])):
        o["text"] = scrub(o["text"], f"observations.{i}")
        if o["text"].strip():
            kept.append(o)
    s["observations"] = kept
    for i, f in enumerate(s.get("findings", [])):
        f["text"] = scrub(f["text"], f"findings.{i}")
        if not f["text"].strip():
            raise Refuse(f"findings.{i} would be empty")
    for j, e in enumerate(s.get("conflictLedger", [])):
        for k in ("rule_applied", "reason", "resolution"):
            if isinstance(e.get(k), str):
                e[k] = scrub(e[k], f"conflictLedger.{j}.{k}")
                if not e[k].strip():
                    raise Refuse(f"conflictLedger.{j}.{k} would be empty")
    d = r.get("debate_transcript") or {}
    for side in ("prosecution", "defense"):
        k = f"{side}_summary"
        if d.get(k):
            d[k] = scrub(d[k], k, strict=True)
            if not d[k].strip():
                raise Refuse(f"{k} would be empty")
    claims = []
    for i, c in enumerate(d.get("claims", [])):
        c["claim_text"] = scrub(c["claim_text"], f"debate.claims.{i}", strict=True)
        if c["claim_text"].strip():
            claims.append(c)
    for side in ("prosecution", "defense"):
        if d.get("claims") and not any(c["side"] == side for c in claims):
            raise Refuse(f"debate side {side} would have no claim")
    if "claims" in d:
        d["claims"] = claims
    if d.get("key_dispute"):
        kd = scrub(d["key_dispute"], "key_dispute", strict=True)
        d["key_dispute"] = kd if kd.strip() else KEY_DISPUTE_FALLBACK
    # The claims ledger is bookkeeping about the redactions themselves, not a displayed value: its counts are
    # expected to move, so it is excluded from the "no number changes" guard.
    shown = lambda d: {p: v for p, v in numeric_leaves(d) if not p.startswith(".council_result.claims.")}
    if shown(doc) != shown(new):
        raise Refuse("a numeric field would change")
    return new, changes


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--dir", default=str(ROOT / "demo_runs"))
    args = ap.parse_args(argv)
    rc = 0
    for p in sorted(pathlib.Path(args.dir).glob("*.json")):
        doc = json.loads(p.read_text(encoding="utf-8"))
        try:
            new, changes = reapply(doc)
        except Refuse as e:
            print(f"{p.name}: REFUSED ({e})")
            rc = 1
            continue
        print(f"{p.name}: {len(changes)} change(s)")
        for field, before, after in changes:
            print(f"  [{field}]\n    before: {before}\n    after:  {after or '(removed)'}")
        if not changes:
            continue
        acc = accept_run(new["council_result"])
        if not acc.accepted:
            print(f"  REFUSED: result fails check_council_run: {acc.failures}")
            rc = 1
            continue
        if args.write:
            p.write_text(json.dumps(new, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            print("  written")
        else:
            print("  (dry run, not written)")
    return rc


if __name__ == "__main__":
    sys.exit(main())
