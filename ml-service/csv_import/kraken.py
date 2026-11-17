"""Read a Kraken Trades export (M6 §1).

Built from Kraken's official field definitions, https://support.kraken.com/articles/360001184886-how-to-interpret-trades-history-fields
(last updated 2026-10-06, read 2026-11-17; LOG §S), and NOT yet checked against a real export file. Facts used: `time` is UTC in the form
"YYYY-MM-DD HH:MM:SS.0000"; `price`, `cost` and `fee` are in the quote currency and `vol` in the base currency; "cost = price x volume" and
"Cost does NOT include fees"; `fee` is the commission Kraken charged for the trade; `margin` 0 means a non-margin trade; `misc` "initiated"
marks a taker order; one `txid` is one partial execution and an `ordertxid` can have several.
What is NOT on an official page and is therefore handled by name and by refusal: the CSV header spelling ("order-type" on the help page,
`ordertype` in the API: both are accepted), the column order (columns are matched by name) and the pair form (`XBT/USD`, `XBTUSD`,
`XXBTZUSD` are all read; anything else is skipped with a reason). A row that cannot be grounded is skipped and listed; nothing is guessed.
"""
from __future__ import annotations

import calendar
import csv
import io
import re
from dataclasses import dataclass, field

REQUIRED = ["txid", "ordertxid", "pair", "time", "type", "price", "cost", "fee", "vol"]
_TIME = re.compile(r"^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?$")
_QUOTES = ("USDT", "USDC", "USD", "EUR", "GBP", "CAD", "CHF", "AUD", "JPY")
COST_TOLERANCE = 0.001       # cost must equal price x volume to within 0.1% (the help page defines cost that way; the rest is rounding)
_BASE_ALIAS = {"XBT": "BTC", "XDG": "DOGE"}
_DOLLAR_QUOTES = {"USD", "USDT", "USDC"}


@dataclass(frozen=True)
class KrakenFill:
    txid: str
    order_id: str
    base: str
    quote: str
    side: int                 # +1 buy, -1 sell
    ts_ms: int                # epoch milliseconds, UTC, floored
    price: float
    qty: float
    cost: float               # price x volume, quote currency, fee not included
    fee: float                # quote currency
    fee_bps: float            # fee / cost x 10,000
    taker: bool | None        # True when misc says "initiated"; None when the file does not say (not "maker")
    order_type: str | None


@dataclass
class ParseResult:
    fills: list[KrakenFill] = field(default_factory=list)
    skipped: list[tuple[int, str]] = field(default_factory=list)      # (row number in the file, header = row 1; reason)


def _norm_asset(a: str) -> str:
    a = a.upper()
    return a[1:] if len(a) == 4 and a[0] in "XZ" else a


def split_pair(pair: str) -> tuple[str, str] | None:
    """(base, quote) with Kraken's X and Z prefixes removed, or None when the form is not recognised."""
    p = (pair or "").strip()
    if "/" in p:
        b, q = p.split("/", 1)
        return (_norm_asset(b), _norm_asset(q)) if b.isalnum() and q.isalnum() else None
    s = re.sub(r"[^A-Za-z0-9]", "", p).upper()
    if len(s) == 8 and s[0] in "XZ" and s[4] == "Z":                  # XXBTZUSD, XETHZEUR
        return _norm_asset(s[:4]), _norm_asset(s[4:])
    for q in _QUOTES:
        if s.endswith(q) and len(s) > len(q):
            return _norm_asset(s[:-len(q)]), q
    return None


def reference_symbol(base: str, quote: str) -> tuple[str | None, str | None]:
    """(Binance symbol, None) or (None, reason). The reference market is Binance's USDT market for a USD, USDT or USDC fill: an ASSUMPTION
    (no official page links USD and USDT prices; the USDT/USD basis moves), stated in every result."""
    if quote not in _DOLLAR_QUOTES:
        return None, f"no USD-quoted reference market for the quote currency {quote}"
    b = _BASE_ALIAS.get(base, base)
    if not re.fullmatch(r"[A-Z0-9]{2,8}", b):
        return None, f"the base asset {base} is not a plausible symbol"
    return f"{b}USDT", None


def _to_ms(s: str) -> int | None:
    m = _TIME.match(s.strip())
    if not m:
        return None
    y, mo, d, h, mi, sec = (int(x) for x in m.groups()[:6])
    try:
        base = calendar.timegm((y, mo, d, h, mi, sec, 0, 0, 0))
    except (ValueError, OverflowError):
        return None
    frac = (m.group(7) or "0")[:3].ljust(3, "0")
    return base * 1000 + int(frac)


def parse_trades(text: str) -> ParseResult:
    reader = csv.reader(io.StringIO(text.lstrip("﻿"), newline=""))
    rows = list(reader)
    if not rows:
        raise ValueError("the file is empty")
    header = [h.strip().lower().replace("order-type", "ordertype") for h in rows[0]]
    missing = [c for c in REQUIRED if c not in header]
    if missing:
        raise ValueError("this is not a Kraken Trades export: missing columns: " + ", ".join(missing))
    ix = {name: header.index(name) for name in header}
    out = ParseResult()
    for n, row in enumerate(rows[1:], start=2):
        if not any(c.strip() for c in row):
            continue
        get = lambda k: row[ix[k]].strip() if k in ix and ix[k] < len(row) else ""
        try:
            price, cost, fee, vol = float(get("price")), float(get("cost")), float(get("fee")), float(get("vol"))
            margin = float(get("margin") or 0)
        except ValueError:
            out.skipped.append((n, "a number could not be read"))
            continue
        side = {"buy": 1, "sell": -1}.get(get("type").lower())
        if side is None:
            out.skipped.append((n, "unknown side"))
            continue
        ts = _to_ms(get("time"))
        if ts is None:
            out.skipped.append((n, "time is not YYYY-MM-DD HH:MM:SS"))
            continue
        if not (price > 0 and vol > 0 and fee >= 0 and cost >= 0):
            out.skipped.append((n, "price and volume must be positive"))
            continue
        sp = split_pair(get("pair"))
        if sp is None:
            out.skipped.append((n, "pair not recognised"))
            continue
        if margin != 0:
            out.skipped.append((n, "margin trade"))
            continue
        if abs(cost - price * vol) > COST_TOLERANCE * price * vol:
            out.skipped.append((n, "cost is not price x volume"))
            continue
        misc = [x.strip().lower() for x in get("misc").split(",")]
        out.fills.append(KrakenFill(
            txid=get("txid"), order_id=get("ordertxid"), base=sp[0], quote=sp[1], side=side, ts_ms=ts, price=price, qty=vol, cost=cost, fee=fee,
            fee_bps=fee / cost * 1e4 if cost > 0 else 0.0, taker=True if "initiated" in misc else None, order_type=get("ordertype").lower() or None))
    return out
