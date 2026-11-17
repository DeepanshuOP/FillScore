"""Budget of the CSV check route: each check fetches public market data, so an account may run 6 an hour and 20 a day (rolling windows)
and one at a time. The slot is RESERVED before the work starts (review 2026-11-18: counting afterwards let parallel requests all pass, and a
check that failed after its fetches was never counted) and given back only for a file that was refused before any market data was fetched.
In memory, one service instance."""
from __future__ import annotations

import time
from collections import defaultdict, deque

PER_HOUR, PER_DAY = 6, 20
_HOUR, _DAY = 3600.0, 86400.0
_runs: dict[str, deque] = defaultdict(deque)
_inflight: set[str] = set()


def reset() -> None:
    _runs.clear()
    _inflight.clear()


def _trim(account: str, now: float) -> deque:
    q = _runs.get(account)
    if q is None:
        return deque()
    while q and now - q[0] >= _DAY:
        q.popleft()
    if not q:
        del _runs[account]               # no empty entry is kept for an idle account
        return deque()
    return q


def retry_after(account: str, now: float | None = None) -> int | None:
    """Seconds until another check is allowed, or None when one is allowed now."""
    t = time.time() if now is None else now
    q = _trim(account, t)
    waits = []
    in_hour = [x for x in q if t - x < _HOUR]
    if len(in_hour) >= PER_HOUR:
        waits.append(in_hour[-PER_HOUR] + _HOUR - t)
    if len(q) >= PER_DAY:
        waits.append(q[-PER_DAY] + _DAY - t)
    return max(1, int(max(waits)) + 1) if waits else None


def reserve(account: str, now: float | None = None) -> tuple[str, int | None]:
    """("ok", None): a check is reserved and counted. ("busy", None): this account has a check running. ("limit", seconds): over the budget."""
    t = time.time() if now is None else now
    if account in _inflight:
        return "busy", None
    wait = retry_after(account, t)
    if wait is not None:
        return "limit", wait
    _runs[account].append(t)
    _inflight.add(account)
    return "ok", None


def release(account: str, refund: bool) -> None:
    _inflight.discard(account)
    if refund and _runs.get(account):
        _runs[account].pop()
