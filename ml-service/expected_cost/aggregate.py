"""Cost against expectation for an account: the notional-weighted execution cost of its market orders, beside what taker
events of the same size cost in the same hour (expected_cost.model). A past-tense comparison, never advice.

Rows are order measurements (the stored documents) that carry an `expectedCost` field. Only orders with a number for both
sides are used; the others are counted by reason. The interval is a seeded bootstrap over orders (2,000 resamples, fixed
seed, 5th and 95th percentile of the notional-weighted mean excess), so it is the same every time. With fewer than
`min_orders` usable orders the answer is "insufficient data" (min_orders = 20 as scoring v2's minimum sample of fills).
"""
from __future__ import annotations

import numpy as np

MIN_ORDERS = 20
SEED = 20240101
RESAMPLES = 2000
LEVEL = 0.9


def cost_vs_expected(rows: list[dict], min_orders: int = MIN_ORDERS) -> dict:
    paid, exp, notional, version, sha = [], [], [], None, None
    excluded = {"outsideModel": 0, "noExpectedCost": 0, "partlyFilled": 0}
    for r in rows:
        ec, sf = r.get("expectedCost"), r.get("shortfall") or {}
        if ec is None:
            excluded["noExpectedCost"] += 1
            continue
        if ec.get("applies") is False:
            excluded["outsideModel"] += 1
            continue
        fr = sf.get("fillRatio")
        if isinstance(fr, (int, float)) and not isinstance(fr, bool) and fr < 1:
            excluded["partlyFilled"] += 1      # executionBps is over the intended notional, which includes the unfilled part
            continue
        p, e, n = sf.get("executionBps"), ec.get("expectedBps"), sf.get("intendedNotional")
        if not all(isinstance(v, (int, float)) and not isinstance(v, bool) and np.isfinite(v) for v in (p, e, n)) or n <= 0:
            excluded["noExpectedCost"] += 1
            continue
        paid.append(float(p)), exp.append(float(e)), notional.append(float(n))
        version, sha = ec.get("version"), ec.get("calibrationSha256")
    n_used = len(paid)
    if n_used < min_orders:
        return {"insufficient": True, "n": n_used, "excluded": excluded,
                "reason": f"fewer than {min_orders} market orders have an expected cost (found {n_used})"}
    p, e, w = np.array(paid), np.array(exp), np.array(notional)
    excess = p - e
    tot = float(w.sum())
    rng = np.random.default_rng(SEED)
    idx = rng.integers(0, n_used, size=(RESAMPLES, n_used))
    boot = (w[idx] * excess[idx]).sum(axis=1) / w[idx].sum(axis=1)
    lo, hi = np.percentile(boot, [100 * (1 - LEVEL) / 2, 100 * (1 + LEVEL) / 2])
    return {"insufficient": False, "n": n_used, "excluded": excluded, "level": LEVEL, "version": version, "calibrationSha256": sha,
            "paidBps": float((w * p).sum() / tot), "expectedBps": float((w * e).sum() / tot),
            "excessBps": float((w * excess).sum() / tot), "lowBps": float(lo), "highBps": float(hi),
            "paidUsd": float((p * w).sum() / 1e4), "expectedUsd": float((e * w).sum() / 1e4),
            "method": f"seeded bootstrap over orders ({RESAMPLES} resamples, seed {SEED}), notional-weighted mean excess"}
