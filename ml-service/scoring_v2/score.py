"""Score one account under a ScoringVersion, and verify a stored score.

Inputs, all read-only: `trades.measurement` (current MEASURE_VERSION, real-user only), `order_measurements`, and the
latest `fee_snapshots` per symbol. Unit scores come from scoring_v2.components; aggregation from aggregate.py.

Integrity: every input is hashed under a key — "fill:<symbol>:<tradeId>" (the stored measurement),
"order:<symbol>:<orderId>" (the stored order measurement) and "fee:<symbol>:<fetchedAt>" (the fee snapshot) — together
with the version id, the version file's SHA-256 and the market-data checksums. The keys are stored with the score, so
verification recomputes the hash over exactly the inputs that were scored, even after newer trades arrive.
"""
from __future__ import annotations

from datetime import datetime, timezone

from config.versions import MEASURE_VERSION
from measure.fees import effective_rate
from measure.service import check_data_source

from .aggregate import score_account
from .components import duration_bucket, fee_score, notional_bucket, slippage_score, spread_score, timing_cost_score, timing_score
from .integrity import canonical_json, integrity_hash

USD_PEGGED_QUOTES = ("USDT", "USDC", "FDUSD")
SNAPSHOT_MAX_GAP_MS = 30 * 86_400_000


def _plain(v):
    """Mongo values -> JSON values (datetimes as UTC ISO strings, ObjectIds dropped by the caller)."""
    if isinstance(v, datetime):
        return (v if v.tzinfo else v.replace(tzinfo=timezone.utc)).isoformat()
    if isinstance(v, dict):
        return {k: _plain(x) for k, x in v.items() if k != "_id"}
    if isinstance(v, (list, tuple)):
        return [_plain(x) for x in v]
    return v


def _ms(dt) -> int:
    dt = dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    return int(round(dt.timestamp() * 1000))


def _fee_unit(t: dict, snap: dict | None, version: dict) -> float | None:
    if snap is None or not t["symbol"].endswith(USD_PEGGED_QUOTES):
        return None
    fee, notional = t.get("feeUsd"), t.get("notional")
    if not isinstance(fee, (int, float)) or isinstance(fee, bool) or not notional or notional <= 0:
        return None
    side, maker = t["side"], bool(t.get("isMaker"))
    try:
        best = min(effective_rate(snap, side, maker, False), effective_rate(snap, side, maker, True)) * 1e4
    except ValueError:
        return None
    published = (version.get("feeTable") or {}).get("publishedTakerBps", {}).get(t.get("exchange", "binance"))
    return fee_score(fee / notional * 1e4, best, published)


def _collect(db, account_id: str, version: dict, keys: set[str] | None = None, data_source: str = "real-user"):
    check_data_source(account_id, data_source)
    if account_id.startswith("demo-") and data_source == "real-user":
        raise ValueError("demo accounts are not scored under v2 at runtime (the offline demo build passes synthetic-demo)")
    q = {"accountId": account_id, "dataSource": data_source, "measurement.version": MEASURE_VERSION}
    trades = [t for t in db.trades.find(q) if keys is None or f"fill:{t['symbol']}:{t['tradeId']}" in keys]
    symbols = sorted({t["symbol"] for t in trades})

    snaps_by_symbol: dict[str, list[dict]] = {}
    for s in symbols:
        cands = list(db.fee_snapshots.find({"accountId": account_id, "symbol": s}))
        if keys is not None:
            cands = [c for c in cands if f"fee:{s}:{_plain(c['fetchedAt'])}" in keys]
        snaps_by_symbol[s] = cands
    used_snaps: dict[str, dict] = {}

    def snap_for(t: dict) -> dict | None:
        """The snapshot nearest in time to the fill, if one is within SNAPSHOT_MAX_GAP_MS. A snapshot is the rate
        when it was fetched; a VIP tier or a discount can change, so a far snapshot is not applied (review M1-3)."""
        ts = _ms(t["executedAt"])
        cands = [c for c in snaps_by_symbol.get(t["symbol"], []) if abs(_ms(c["fetchedAt"]) - ts) <= SNAPSHOT_MAX_GAP_MS]
        if not cands:
            return None
        best = min(cands, key=lambda c: (abs(_ms(c["fetchedAt"]) - ts), _ms(c["fetchedAt"])))
        used_snaps[f"fee:{t['symbol']}:{_plain(best['fetchedAt'])}"] = best
        return best

    oms = {}
    for om in db.order_measurements.find({"accountId": account_id, "version": MEASURE_VERSION}):
        k = f"order:{om['symbol']}:{om['orderId']}"
        if keys is None or k in keys:
            oms[(om["symbol"], str(om["orderId"]))] = om

    anchors, profiles = version.get("anchors", {}), version.get("hourProfiles", {})
    by_event = version.get("spreadUnit") == "taker_event"
    by_cost = version.get("timingUnit") == "excess_event_cost"
    orders: dict[tuple, dict] = {}
    events: dict[tuple, list[tuple[dict, float, float, float, float]]] = {}
    for t in sorted(trades, key=lambda x: (x["symbol"], str(x["orderId"]), _ms(x["executedAt"]), str(x["tradeId"]))):
        m, sym = t["measurement"], t["symbol"]
        key = (sym, str(t["orderId"]))
        o = orders.setdefault(key, {"orderId": key[1], "symbol": sym, "notional": 0.0, "fills": [], "_t": []})
        notional = float(t.get("notional") or t["executionPrice"] * t["quantity"])
        o["notional"] += notional
        o["_t"].append((_ms(t["executedAt"]), float(t["quantity"])))
        eff, mid, tick = m.get("effHalfBps"), m.get("mid"), m.get("tickSize")
        spread = None
        sym_anchors = anchors.get(sym)
        prof = profiles.get(sym)
        if by_cost:
            # v2.2.0: the hour's excess cost over the cheapest hours, less a floor, on the spread ladder of the
            # fill's size class (ADR-0013). No profile or no floor stored for the symbol: not measured.
            floor = (version.get("timingFloorBps") or {}).get(sym)
            timing = (timing_cost_score(t["executedAt"].hour, prof, floor,
                                        ((sym_anchors or {}).get("spread") or {}).get(notional_bucket(notional)),
                                        int(version.get("timingReferenceHours", 3)))
                      if prof and floor is not None else None)
        else:
            timing = timing_score(t["executedAt"].hour, prof) if prof else None
        fill ={"notional": notional, "spread": None, "timing": timing, "fees": _fee_unit(t, snap_for(t), version)}
        o["fills"].append(fill)
        if eff is None or not mid or not tick or sym_anchors is None:
            continue
        if by_event:
            # v2.1.0+: the fills of one order in one millisecond, on one side and with one mid, are one taker event,
            # the unit the public baseline is measured in (ADR-0012). Grouped here, scored below.
            ek = (sym, str(t["orderId"]), _ms(t["executedAt"]), t.get("side"), bool(t.get("isMaker")), float(mid))
            events.setdefault(ek, []).append((fill, float(eff), float(t["quantity"]), notional, float(tick)))
        else:
            spread = spread_score(eff, tick / 2 / mid * 1e4, (sym_anchors.get("spread") or {}).get(notional_bucket(notional)))
            fill["spread"] = spread

    for (sym, _oid, _ms_, _side, _maker, mid), members in events.items():
        qty = sum(q for _, _, q, _, _ in members)
        if qty <= 0:
            continue
        # qty-weighted mean of the fills' effective half-spreads == the event VWAP against the shared mid.
        eff = sum(e * q for _, e, q, _, _ in members) / qty
        notional = sum(n for _, _, _, n, _ in members)
        tick = members[0][4]
        s = spread_score(eff, tick / 2 / mid * 1e4, (anchors[sym].get("spread") or {}).get(notional_bucket(notional)))
        for fill, *_ in members:
            fill["spread"] = s

    for key, o in orders.items():
        om = oms.get(key)
        o["slippage"] = None
        it = ((om or {}).get("shortfall") or {}).get("impactTimingBps")
        sym_anchors = anchors.get(o["symbol"])
        if it is not None and sym_anchors is not None:
            qty = sum(q for _, q in o["_t"])
            delay = sum((ts - om["arrivalMs"]) * q for ts, q in o["_t"]) / qty if qty > 0 else 0.0
            o["slippage"] = slippage_score(it, (sym_anchors.get("slippage") or {}).get(duration_bucket(max(delay, 0.0))))
        del o["_t"]

    entries, shas = [], set()
    for t in trades:
        entries.append((f"fill:{t['symbol']}:{t['tradeId']}", _plain(t["measurement"])))
        shas.update(r["sha256"] for r in t["measurement"].get("marketDataRefs", []) if r.get("sha256"))
    for (sym, oid), om in oms.items():
        if (sym, oid) in orders:
            entries.append((f"order:{sym}:{oid}", _plain(om)))
            shas.update(r["sha256"] for r in om.get("marketDataRefs", []) if r.get("sha256"))
    for k, snap in sorted(used_snaps.items()):
        entries.append((k, _plain(snap)))
    return list(orders.values()), entries, shas


def score_account_v2(db, account_id: str, version: dict, version_sha256: str, now_ms: int,
                     data_source: str = "real-user") -> dict:
    """`data_source="synthetic-demo"` is for the offline demo build only (demo_v2.build); the runtime never passes it."""
    orders, entries, shas = _collect(db, account_id, version, data_source=data_source)
    return {
        "accountId": account_id,
        "scoringVersion": version["id"],
        "versionFileSha256": version_sha256,
        "measureVersion": MEASURE_VERSION,
        "integrityHash": integrity_hash(version["id"], version_sha256, entries, shas),
        "inputKeys": sorted(k for k, _ in entries),
        "computedAt": datetime.fromtimestamp(now_ms / 1000, tz=timezone.utc),
        "result": score_account(orders),
    }


def verify_account_v2(db, account_id: str, version: dict, version_sha256: str) -> dict | None:
    stored = db.scores_v2.find_one({"accountId": account_id, "scoringVersion": version["id"]}, sort=[("computedAt", -1)])
    if stored is None:
        return None
    orders, entries, shas = _collect(db, account_id, version, keys=set(stored.get("inputKeys", [])))
    recomputed = integrity_hash(version["id"], version_sha256, entries, shas)
    # The hash covers the inputs; the stored result is checked by recomputing it from those inputs (deterministic:
    # fixed bootstrap seed), so an edited grade or composite is caught too (review M1-1).
    result_match = canonical_json(_plain(stored.get("result"))) == canonical_json(score_account(orders))
    hash_match = recomputed == stored["integrityHash"]
    return {"match": hash_match and result_match, "storedHash": stored["integrityHash"],
            "recomputedHash": recomputed, "resultMatch": result_match, "scoringVersion": version["id"]}
