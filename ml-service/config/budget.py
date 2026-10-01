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
        self._account_hits: dict[str, deque[float]] = {}
        self._day_key = 0
        self._day_count = 0

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

    def try_acquire(self, account_id: str) -> BudgetDecision:
        per_account, daily = self._limits()
        now = self._clock()
        day_key = int(now // SECONDS_PER_DAY)

        with self._lock:
            if day_key != self._day_key:
                self._day_key = day_key
                self._day_count = 0

            hits = self._account_hits.setdefault(account_id, deque())
            while hits and hits[0] <= now - self._window_s:
                hits.popleft()

            if per_account > 0 and len(hits) >= per_account:
                retry = int(hits[0] + self._window_s - now) + 1
                return BudgetDecision(False, "account", max(retry, 1))

            if daily > 0 and self._day_count >= daily:
                retry = int((day_key + 1) * SECONDS_PER_DAY - now) + 1
                return BudgetDecision(False, "daily", max(retry, 1))

            hits.append(now)
            self._day_count += 1
            return BudgetDecision(True)


council_budget = RunBudget()
