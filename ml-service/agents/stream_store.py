"""A resumable Council stream: every event of a run gets an id, the run's events are kept for a while, and a client
that lost its connection asks for the events after the last id it saw. The run is never started again.

In memory, in this process, per run. Limits (single instance): a restart or a redeploy loses unfinished runs and every
kept event; a second instance does not see the first one's runs. A client that asks for a run the store does not hold
(expired, unknown, another account's, lost in a restart) gets `stream_expired`, never a new run.

Bounds: `max_runs` runs (the oldest finished run is dropped first), `max_events` events per run (the oldest are
dropped), a finished run lives `ttl_s` seconds. An unfinished run is not expired by the TTL: the Council budget bounds
how many run at once and a run ends by itself.
"""
from __future__ import annotations

import asyncio
import json
import time
import secrets
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any

HEARTBEAT_S = 20.0        # a comment line every 20 s on an idle stream keeps proxies from closing it
RUN_TTL_S = 600.0         # a finished run's events are kept 10 minutes (the Council result itself is cached by content hash)
MAX_RUNS = 32
MAX_EVENTS = 300          # a run holds about 30 events
RUN_TIMEOUT_S = 900.0     # a run that has not finished by then is stopped with an error event (a Deep run takes about 100 s)
UNFINISHED_PER_ACCOUNT = 3   # unfinished runs one account may hold at once

HEARTBEAT_FRAME = ": keepalive\n\n"


class TooManyRuns(Exception):
    """The account already holds the most unfinished runs it may."""


class StreamGone(Exception):
    """The stream a client asked for cannot be continued. `code` is stream_expired or unknown_event_id."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


@dataclass
class Event:
    id: int
    name: str
    data: dict


def sse_frame(e: Event) -> str:
    return f"id: {e.id}\nevent: {e.name}\ndata: {json.dumps(e.data)}\n\n"


@dataclass
class RunStream:
    run_id: str
    account_id: str
    now: float = 0.0                         # creation time (the store's clock)
    max_events: int = MAX_EVENTS
    events: list[Event] = field(default_factory=list)
    finished_at: float | None = None
    task: Any = None                         # the pipeline task, held so it is not garbage collected
    _next_id: int = 1
    _cond: asyncio.Condition | None = None

    def _condition(self) -> asyncio.Condition:
        if self._cond is None:
            self._cond = asyncio.Condition()
        return self._cond

    @property
    def finished(self) -> bool:
        return self.finished_at is not None

    async def publish(self, name: str, data: dict) -> Event:
        async with self._condition():
            e = Event(self._next_id, name, data)
            self._next_id += 1
            self.events.append(e)
            if len(self.events) > self.max_events:
                del self.events[: len(self.events) - self.max_events]
            self._condition().notify_all()
            return e

    async def finish(self, now: float | None = None) -> None:
        async with self._condition():
            self.finished_at = time.monotonic() if now is None else now
            self._condition().notify_all()

    def check_after(self, after_id: int) -> None:
        last = self._next_id - 1
        first = self.events[0].id if self.events else self._next_id
        if after_id < 0 or after_id > last or after_id < first - 1:
            raise StreamGone("unknown_event_id")

    async def follow(self, after_id: int, heartbeat_s: float = HEARTBEAT_S) -> AsyncIterator[Event | None]:
        """The events after `after_id`, then each new one as it is published, until the run finishes. Yields None
        for a heartbeat tick when nothing arrived for `heartbeat_s` seconds. Raises StreamGone for an id that was
        never issued or has been dropped."""
        self.check_after(after_id)
        cond = self._condition()
        while True:
            async with cond:
                pending = [e for e in self.events if e.id > after_id]
                if not pending and not self.finished:
                    try:
                        await asyncio.wait_for(cond.wait(), heartbeat_s)
                    except asyncio.TimeoutError:
                        pass
                    pending = [e for e in self.events if e.id > after_id]
                    tick = not pending and not self.finished
                else:
                    tick = False
                done = self.finished and not pending
            if tick:
                yield None
                continue
            for e in pending:
                after_id = e.id
                yield e
            if done:
                return


class StreamStore:
    def __init__(self, ttl_s: float = RUN_TTL_S, max_runs: int = MAX_RUNS, max_events: int = MAX_EVENTS):
        self.ttl_s = ttl_s
        self.max_runs = max_runs
        self.max_events = max_events
        self._runs: dict[str, RunStream] = {}

    def __len__(self) -> int:
        return len(self._runs)

    def _purge(self, now: float) -> None:
        for rid in [r for r, s in self._runs.items() if s.finished_at is not None and s.finished_at + self.ttl_s < now]:
            del self._runs[rid]

    def create(self, account_id: str, now: float | None = None) -> RunStream:
        now = time.monotonic() if now is None else now
        self._purge(now)
        if sum(1 for r in self._runs.values() if r.account_id == account_id and not r.finished) >= UNFINISHED_PER_ACCOUNT:
            raise TooManyRuns()
        while len(self._runs) >= self.max_runs:
            finished = [s for s in self._runs.values() if s.finished]
            if not finished:
                break                                    # every kept run is still running: bounded by the Council budget
            del self._runs[min(finished, key=lambda s: s.finished_at).run_id]
        rs = RunStream(secrets.token_hex(16), account_id, now=now, max_events=self.max_events)
        self._runs[rs.run_id] = rs
        return rs

    def get(self, run_id: str, account_id: str, now: float | None = None) -> RunStream:
        now = time.monotonic() if now is None else now
        self._purge(now)
        rs = self._runs.get(run_id)
        if rs is None or rs.account_id != account_id:     # another account's run reads exactly like a missing one
            raise StreamGone("stream_expired")
        return rs


store = StreamStore()
