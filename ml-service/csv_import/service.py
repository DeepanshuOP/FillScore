"""One CSV in, one result out (M6 §1): each fill compared with the public price at its second (csv_import.check).

Limits: 200,000 characters and 200 fills (a bigger file is refused, never cut), and 60 seconds for the market data (a fill whose data
did not arrive in time is listed as unmeasured, never as zero). Nothing is stored and no row of the file is logged or echoed in an error.
"""
from __future__ import annotations

import time
from dataclasses import asdict
from typing import Callable

from csv_import import gate
from csv_import.check import ASSUMPTIONS, check_fills
from csv_import.kraken import parse_trades
from csv_import.mapped import parse_mapped

MAX_SOURCE_CALLS = 150           # market-data requests of one check (a busy window can page and then be split fill by fill)
MAX_FILLS = 200
MAX_CHARS = 200_000
DEADLINE_S = 60.0

PROVENANCE = {
    "kraken": "Read with the column layout of Kraken's documented Trades export. That reading is built from Kraken's documentation and is "
              "not yet checked against a real file.",
    "mapped": "Read with your column mapping. FillScore has not checked this mapping against the broker's documentation.",
}
MAPPED_ASSUMPTIONS = [
    "A time with no time zone is read as UTC; a time with a zone is converted to UTC.",
    "The fee is read in the quote currency. A row whose fee-currency column names another currency is skipped, not converted.",
]
NO_FEE = "The file has no fee column, so fees were not part of this check."


class CsvCheckError(Exception):
    def __init__(self, code: str, message: str, extra: dict | None = None):
        super().__init__(message)
        self.code, self.message, self.extra = code, message, extra or {}


def run_check(fmt: str, text: str, mapping: dict | None, source, deadline_s: float = DEADLINE_S, clock: Callable[[], float] = time.monotonic) -> dict:
    if fmt not in PROVENANCE:
        raise CsvCheckError("unknown_format", "The format must be 'kraken' or 'mapped'.")
    if len(text) > MAX_CHARS:
        raise CsvCheckError("file_too_large", f"The file has more than {MAX_CHARS:,} characters. Split it by date and check each part.")
    try:
        parsed = parse_trades(text) if fmt == "kraken" else parse_mapped(text, mapping or {})
    except ValueError as e:                       # parser messages name columns, never row contents
        raise CsvCheckError("not_readable", str(e)) from None
    skipped = [{"row": n, "reason": why} for n, why in parsed.skipped]
    if not parsed.fills:
        raise CsvCheckError("no_fills", f"No fill in the file could be read ({len(skipped)} rows were skipped, see the reasons).", {"skipped": skipped})
    if len(parsed.fills) > MAX_FILLS:
        raise CsvCheckError("too_many_fills", f"This file has {len(parsed.fills)} fills. At most {MAX_FILLS} can be checked at once. Split the file by date and check each part.")

    t0 = clock()
    state = {"calls": 0, "retry_after": None, "limited": False}

    def limited(symbol, start, end):
        if state["limited"]:
            raise TimeoutError("the market data source asked for a pause")     # no request after a 418 or 429
        if clock() - t0 > deadline_s or state["calls"] >= MAX_SOURCE_CALLS:
            raise TimeoutError("market data budget used")
        state["calls"] += 1
        try:
            return source(symbol, start, end)
        except Exception as e:
            code = getattr(getattr(e, "response", None), "status_code", None)
            if code in (418, 429):
                ra = str(getattr(getattr(e, "response", None), "headers", {}).get("Retry-After", ""))
                state["limited"], state["retry_after"] = True, gate.set_cooldown(int(ra) if ra.isdigit() else None)
            raise

    result = check_fills(parsed.fills, limited)
    if state["limited"]:
        raise CsvCheckError("market_data_busy", "The public market-data source asked for a pause, so nothing was checked. Try again in a few minutes.",
                            {"retry_after": state["retry_after"]})
    fills = [asdict(f) for f in result.fills]
    summary = dict(result.summary)
    assumptions = list(ASSUMPTIONS) + (MAPPED_ASSUMPTIONS if fmt == "mapped" else [])
    if not parsed.fee_known:
        for f in fills:
            f["fee_bps"] = f["fee_usd"] = f["total_bps"] = None
        summary["total_fee_usd"] = summary["weighted_fee_bps"] = None
        assumptions.append(NO_FEE)
    return {"format": fmt, "provenance": PROVENANCE[fmt], "fee_known": parsed.fee_known, "summary": summary, "fills": fills,
            "skipped": skipped, "assumptions": assumptions, "stored": False,
            "limits": {"max_fills": MAX_FILLS, "max_chars": MAX_CHARS, "market_data_deadline_s": deadline_s}}
