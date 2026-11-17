"""Run budget for the Agent Council.

One council run costs roughly 11.6K tokens, and the free Groq tier allows about 100K tokens a
day on the 70B model. Running past that does not fail loudly: a 429 mid-run makes the council
fall back to default verdicts that look plausible. Refusing the run up front is the honest
alternative, so two limits apply: a global cap per UTC day and a sliding per-account window.

Limits are read from the environment on every call (0 disables a limit):
  COUNCIL_DAILY_RUN_CAP            default 8
  COUNCIL_ACCOUNT_RUNS_PER_HOUR    default 3

State is in memory, which is correct for the single-instance deployment this runs in today.
Moving to several instances needs a shared store (see ROADMAP R5-C8).
"""
from __future__ import annotations

import os
import threading
import time
from collections import deque
from dataclasses import dataclass
from typing import Callable

DEFAULT_DAILY_CAP = 8
DEFAULT_ACCOUNT_RUNS_PER_HOUR = 3
# M3 §4: both limits stay in Deep runs. A Deep audit (the 9-call Council) costs 9 units, a Quick audit (one call) 1 unit.
DEEP_UNITS = 9
QUICK_UNITS = 1
ACCOUNT_WINDOW_S = 3600
SECONDS_PER_DAY = 86400


@dataclass(frozen=True)
class BudgetDecision:
    allowed: bool
    reason: str = ""          # "account" | "daily" when refused
    retry_after_s: int = 0


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name, "").strip()
    if raw == "":
        return default
    try:
        return max(0, int(raw))
    except ValueError:
        return default


class RunBudget:
    def __init__(
        self,
        per_account_limit: int | None = None,
        per_account_window_s: int = ACCOUNT_WINDOW_S,
        daily_limit: int | None = None,
        clock: Callable[[], float] = time.time,
    ):
        self._per_account_limit = per_account_limit
        self._window_s = per_account_window_s
        self._daily_limit = daily_limit
        self._clock = clock
        self._lock = threading.Lock()
        self._account_hits: dict[str, deque[tuple[float, int]]] = {}   # (time, units)
        self._day_key = 0
        self._day_count = 0                                            # units

    def reset(self) -> None:
        with self._lock:
            self._account_hits.clear()
            self._day_key = 0
            self._day_count = 0

    def _limits(self) -> tuple[int, int]:
        per_account = (
            self._per_account_limit
            if self._per_account_limit is not None
            else _env_int("COUNCIL_ACCOUNT_RUNS_PER_HOUR", DEFAULT_ACCOUNT_RUNS_PER_HOUR)
        )
        daily = (
            self._daily_limit
            if self._daily_limit is not None
            else _env_int("COUNCIL_DAILY_RUN_CAP", DEFAULT_DAILY_CAP)
        )
        return per_account, daily

    def _roll(self, account_id: str, now: float) -> deque:
        """Start a new day when the UTC day changed; drop the account's hits older than the window. Lock held."""
        day_key = int(now // SECONDS_PER_DAY)
        if day_key != self._day_key:
            self._day_key = day_key
            self._day_count = 0
        hits = self._account_hits.setdefault(account_id, deque())
        while hits and hits[0][0] <= now - self._window_s:
            hits.popleft()
        return hits

    def try_acquire(self, account_id: str, units: int = DEEP_UNITS) -> BudgetDecision:
        """Take `units` from the account's hourly allowance and the day's cap, or refuse and say which. The limits are
        in Deep runs (units of DEEP_UNITS): a Quick audit is QUICK_UNITS. A refusal uses nothing."""
        per_account, daily = self._limits()
        now = self._clock()

        with self._lock:
            hits = self._roll(account_id, now)
            used = sum(u for _, u in hits)
            cap = per_account * DEEP_UNITS
            if per_account > 0 and used + units > cap:
                freed, retry = 0, self._window_s
                for t, u in hits:                      # oldest first: wait until enough units leave the window
                    freed += u
                    if used - freed + units <= cap:
                        retry = int(t + self._window_s - now) + 1
                        break
                return BudgetDecision(False, "account", max(retry, 1))

            if daily > 0 and self._day_count + units > daily * DEEP_UNITS:
                retry = int((self._day_key + 1) * SECONDS_PER_DAY - now) + 1
                return BudgetDecision(False, "daily", max(retry, 1))

            hits.append((now, units))
            self._day_count += units
            return BudgetDecision(True)

    def status(self, account_id: str) -> dict:
        """What is left, for the UI: units, and how many Deep and Quick audits fit. None for a limit that is off.
        `deepAvailable` / `quickAvailable` say whether one more audit of that kind would be allowed now."""
        per_account, daily = self._limits()
        now = self._clock()
        with self._lock:
            hits = self._roll(account_id, now)
            acc_left = None if per_account <= 0 else max(0, per_account * DEEP_UNITS - sum(u for _, u in hits))
            day_left = None if daily <= 0 else max(0, daily * DEEP_UNITS - self._day_count)
            retry = 0
            if acc_left == 0 and hits:
                retry = max(1, int(hits[0][0] + self._window_s - now) + 1)

        def block(left, extra=None):
            if left is None:
                return None
            return {"unitsLeft": left, "deepLeft": left // DEEP_UNITS, "quickLeft": left // QUICK_UNITS, **(extra or {})}

        lefts = [x for x in (acc_left, day_left) if x is not None]
        room = min(lefts) if lefts else None
        return {"account": block(acc_left, {"retryAfterS": retry}), "day": block(day_left),
                "deepAvailable": room is None or room >= DEEP_UNITS, "quickAvailable": room is None or room >= QUICK_UNITS,
                "units": {"deep": DEEP_UNITS, "quick": QUICK_UNITS}}


council_budget = RunBudget()
