"""The expectedCost field of one order: what taker events of the same size cost in the same market hour on the calibration
days (a past-tense benchmark, never a forecast). Pure: the calibration file and the hour context are inputs.

Applies to MARKET orders only: the model is calibrated on taker events, so a resting (maker) order is outside it and says so.
A value that cannot be given honestly is None with a reason: no context, a symbol that was not calibrated, a size outside the
calibrated range (no extrapolation), or a size bucket with too few calibration events for an interval.
"""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

from expected_cost.calibrate import predict
from expected_cost.impact import in_range, participation_term
from scoring_v2.components import notional_bucket

VERSIONS = Path(__file__).resolve().parent / "versions"
CURRENT_VERSION = "ec1.0.0"


class Calibration:
    def __init__(self, data: dict, sha256: str):
        self.data, self.sha256 = data, sha256

    @property
    def id(self) -> str:
        return self.data["id"]


def load_calibration(version: str = CURRENT_VERSION) -> Calibration:
    raw = (VERSIONS / f"{version}.json").read_bytes()
    return Calibration(json.loads(raw), hashlib.sha256(raw).hexdigest())


def _none(cal: Calibration, applies: bool, reason: str, **extra) -> dict:
    return {"version": cal.id, "calibrationSha256": cal.sha256, "applies": applies, "expectedBps": None, "lowBps": None,
            "highBps": None, "level": 1 - cal.data["alpha"], "bucket": None, "context": None, "reason": reason, **extra}


def applies_to(cal: Calibration, symbol: str, order_type: str | None) -> bool:
    """True when the model can give a number for this order before any market context is read: a MARKET order of a
    calibrated symbol. Used to avoid a market-data request for an order that cannot get a value anyway."""
    return order_type == "MARKET" and symbol in cal.data["symbols"]


def unavailable(cal: Calibration, reason: str) -> dict:
    """The field when the market context could not be read at measurement time (a source failure, not a property of the order)."""
    return _none(cal, True, reason)


def expected_for_order(cal: Calibration, *, symbol: str, order_type: str | None, notional: float, quantity: float,
                       context: tuple[float, float] | None) -> dict:
    """`context` = (hour volatility in bps, hour volume in base units) from expected_cost.features.hour_context."""
    if order_type is None:
        return _none(cal, False, "order type unknown: the order record is missing, so it cannot be said whether the model applies")
    if order_type != "MARKET":
        return _none(cal, False, "not a market order: the model is calibrated on taker events, so resting orders are outside it")
    sym = cal.data["symbols"].get(symbol)
    if sym is None:
        return _none(cal, True, f"{symbol} was not calibrated")
    if context is None:
        return _none(cal, True, "no market context for the hour before the order (too few minutes with trades, or no data)")
    sigma, volume = context
    if not (math.isfinite(notional) and notional > 0 and math.isfinite(quantity) and quantity > 0 and volume > 0 and sigma >= 0):
        return _none(cal, True, "the order size or the hour context is not usable")
    x = participation_term(sigma, quantity, volume)
    lo, hi = sym["featureRange"]
    if not in_range(x, lo, hi):
        return _none(cal, True, "order size against the hour's volume is outside the calibrated range")
    expected = float(predict(sym["halfSpreadBps"], sym["y"], x))
    bucket = notional_bucket(notional)
    q = sym["buckets"][bucket]["q"]
    out = {"version": cal.id, "calibrationSha256": cal.sha256, "applies": True, "expectedBps": expected,
           "lowBps": None if q is None else expected - q, "highBps": None if q is None else expected + q,
           "level": 1 - cal.data["alpha"], "bucket": bucket, "context": {"sigmaBps": sigma, "volume": volume},
           "reason": None if q is not None else "no interval for this size: too few calibration events in its bucket"}
    return out
