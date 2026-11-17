"""Read a broker CSV with a column mapping the user supplies (M6 §1). Used for Coinbase and any other file: FillScore has no official
format for them (Coinbase's help pages could not be read, LOG §S), so it reads only what the user maps and refuses what it cannot ground.

mapping = {"time", "side", "price", "quantity", and either "pair" or both "base" and "quote"; optional "fee", "fee_currency", "id";
           "time_format": "iso" (default), "epoch_s" or "epoch_ms"}. Each value is a column name of the file (exact, after trimming spaces).
Rules, all stated to the user in the result: an ISO time with a zone is converted to UTC and one without a zone is read as UTC; the fee
is read in the quote currency, and a row whose fee-currency column names another currency is skipped (it is not converted); cost is
price x quantity; whether a fill was a taker is not known from such a file. A file without a fee column is checked without fees.
"""
from __future__ import annotations

import csv
import io
import math
from datetime import datetime, timedelta, timezone

from csv_import.kraken import KrakenFill, ParseResult, split_pair

COLUMN_KEYS = ("time", "side", "price", "quantity", "pair", "base", "quote", "fee", "fee_currency", "id")
TIME_FORMATS = ("iso", "epoch_s", "epoch_ms")
_EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)
_MIN_MS, _MAX_MS = 1_200_000_000_000, 4_000_000_000_000        # 2008 to 2096: a time outside it was read in the wrong unit


def _validate(mapping: dict, header: list[str]) -> None:
    if not isinstance(mapping, dict) or not mapping:
        raise ValueError("the column mapping is missing")
    unknown = [k for k in mapping if k not in COLUMN_KEYS and k != "time_format"]
    if unknown:
        raise ValueError("the mapping has unknown keys: " + ", ".join(sorted(map(str, unknown))))
    if mapping.get("time_format", "iso") not in TIME_FORMATS:
        raise ValueError("time_format must be one of: " + ", ".join(TIME_FORMATS))
    need = [k for k in ("time", "side", "price", "quantity") if not mapping.get(k)]
    if not mapping.get("pair") and not (mapping.get("base") and mapping.get("quote")):
        need.append("pair (or base and quote)")
    if need:
        raise ValueError("the mapping lacks: " + ", ".join(need))
    for k, col in mapping.items():
        if k != "time_format" and (not isinstance(col, str) or col.strip() not in header):
            raise ValueError(f"the column {col!r} (for {k}) is not in the file")


def _time_ms(s: str, fmt: str) -> int | None:
    s = s.strip()
    try:
        if fmt == "iso":
            dt = datetime.fromisoformat(s)
            dt = dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)
            ms = (dt - _EPOCH) // timedelta(milliseconds=1)
        elif fmt == "epoch_s":
            ms = int(round(float(s) * 1000))
        else:
            ms = int(float(s))
    except (ValueError, OverflowError):
        return None
    return ms if _MIN_MS <= ms < _MAX_MS else None


def parse_mapped(text: str, mapping: dict) -> ParseResult:
    try:
        rows = list(csv.reader(io.StringIO(text.lstrip("﻿"), newline="")))
    except csv.Error:                    # for example a single field over the CSV module's limit of 131,072 characters
        raise ValueError("the file could not be read as CSV") from None
    if not rows:
        raise ValueError("the file is empty")
    header = [h.strip() for h in rows[0]]
    _validate(mapping, header)
    ix = {name: header.index(col.strip()) for k, col in mapping.items() if k != "time_format" for name in [k]}
    fmt = mapping.get("time_format", "iso")
    out = ParseResult(fee_known="fee" in mapping)
    for n, row in enumerate(rows[1:], start=2):
        if not any(c.strip() for c in row):
            continue
        get = lambda k: row[ix[k]].strip() if k in ix and ix[k] < len(row) else ""
        try:
            price, qty = float(get("price")), float(get("quantity"))
            fee = float(get("fee")) if "fee" in ix else 0.0
        except ValueError:
            out.skipped.append((n, "a number could not be read"))
            continue
        if not all(math.isfinite(x) for x in (price, qty, fee)):          # inf and nan read as numbers but are not measurements
            out.skipped.append((n, "a number could not be read"))
            continue
        side = {"buy": 1, "sell": -1}.get(get("side").lower())
        if side is None:
            out.skipped.append((n, "unknown side"))
            continue
        ts = _time_ms(get("time"), fmt)
        if ts is None:
            out.skipped.append((n, "time is not in the format you gave"))
            continue
        if not (price > 0 and qty > 0):
            out.skipped.append((n, "price and quantity must be positive"))
            continue
        if not (price * qty > 0 and math.isfinite(price * qty)):          # an underflow would make the cost 0 and the fee rate undefined
            out.skipped.append((n, "price x quantity is too small or too large to measure"))
            continue
        if fee < 0:
            out.skipped.append((n, "the fee is negative"))
            continue
        sp = split_pair(get("pair")) if "pair" in ix else ((get("base").upper(), get("quote").upper()) if get("base") and get("quote") else None)
        if sp is None or not (sp[0].isalnum() and sp[1].isalnum()):
            out.skipped.append((n, "pair not recognised"))
            continue
        if "fee_currency" in ix and get("fee_currency") and get("fee_currency").upper() != sp[1]:
            out.skipped.append((n, "the fee is in another currency than the quote currency (not converted)"))
            continue
        cost = price * qty
        ident = get("id") or f"row {n}"
        out.fills.append(KrakenFill(txid=ident, order_id=ident, base=sp[0], quote=sp[1], side=side, ts_ms=ts, price=price, qty=qty, cost=cost,
                                    fee=fee, fee_bps=fee / cost * 1e4, taker=None, order_type=None))
    return out
