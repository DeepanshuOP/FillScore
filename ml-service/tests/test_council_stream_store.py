"""The resumable Council stream, store level: ids, replay after an id, unknown ids, expiry, heartbeat.

Hand cases. A run publishes 5 events; ids are 1..5 in order of publication.
  after_id 2 -> ids 3, 4, 5.    after_id 0 -> ids 1..5.    after_id 5 (the last) on a finished run -> nothing, then the stream ends.
  after_id 99 (never issued) -> unknown_event_id.
Bound: cap 4 and 10 published -> ids 7..10 kept (10 - 4 + 1 = 7); after_id 6 is fine (next is 7);
  after_id 3 asks for 4..6, which were dropped -> unknown_event_id.
TTL 600 s on a fake clock: a run finished at t=100 is kept at t=699 and gone at t=701 (100 + 600 < 701).
A run that has not finished is never expired by the TTL.
"""
import asyncio

import pytest

from agents.stream_store import RunStream, StreamGone, StreamStore, sse_frame


def run(coro):
    return asyncio.run(coro)


async def _publish(rs: RunStream, n: int):
    for i in range(1, n + 1):
        await rs.publish(f"ev{i}", {"n": i})


async def _collect(rs, after_id, heartbeat_s=5.0):
    return [x async for x in rs.follow(after_id, heartbeat_s)]


def test_ids_increase_by_one_per_event_from_one():
    async def go():
        rs = RunStream("r", "acct", now=0.0)
        await _publish(rs, 5)
        return [e.id for e in rs.events]
    assert run(go()) == [1, 2, 3, 4, 5]


def test_follow_replays_only_the_events_after_the_given_id():
    async def go():
        rs = RunStream("r", "acct", now=0.0)
        await _publish(rs, 5)
        await rs.finish(now=1.0)
        return ([e.id for e in await _collect(rs, 2) if e is not None],
                [e.id for e in await _collect(rs, 0) if e is not None],
                [e.id for e in await _collect(rs, 5) if e is not None])
    assert run(go()) == ([3, 4, 5], [1, 2, 3, 4, 5], [])


def test_an_id_that_was_never_issued_is_refused_not_ignored():
    async def go():
        rs = RunStream("r", "acct", now=0.0)
        await _publish(rs, 5)
        await _collect(rs, 99)
    with pytest.raises(StreamGone) as e:
        run(go())
    assert e.value.code == "unknown_event_id"


def test_the_event_list_is_bounded_and_an_id_in_the_dropped_part_is_refused():
    async def go():
        rs = RunStream("r", "acct", now=0.0, max_events=4)
        await _publish(rs, 10)
        await rs.finish(now=1.0)
        ok = [e.id for e in await _collect(rs, 6) if e is not None]
        kept = [e.id for e in rs.events]
        try:
            await _collect(rs, 3)
            gap = None
        except StreamGone as exc:
            gap = exc.code
        return kept, ok, gap
    assert run(go()) == ([7, 8, 9, 10], [7, 8, 9, 10], "unknown_event_id")


def test_a_run_that_is_unknown_expired_or_another_accounts_reads_as_gone():
    store = StreamStore(ttl_s=600.0, max_runs=8)
    rs = store.create("acct-a", now=0.0)
    run(rs.finish(now=100.0))
    assert store.get(rs.run_id, "acct-a", now=699.0) is rs                  # 100 + 600 = 700 > 699
    with pytest.raises(StreamGone) as e1:
        store.get(rs.run_id, "acct-a", now=701.0)                            # 700 < 701
    assert e1.value.code == "stream_expired"
    rs2 = store.create("acct-a", now=0.0)
    with pytest.raises(StreamGone) as e2:
        store.get(rs2.run_id, "acct-b", now=1.0)                             # same text as unknown: no leak of existence
    assert e2.value.code == "stream_expired"
    with pytest.raises(StreamGone) as e3:
        store.get("no-such-run", "acct-a", now=1.0)
    assert e3.value.code == "stream_expired"
    assert store.get(rs2.run_id, "acct-a", now=100_000.0) is rs2           # unfinished: the TTL does not apply


def test_the_store_keeps_at_most_max_runs_by_dropping_the_oldest_finished():
    store = StreamStore(ttl_s=600.0, max_runs=2)
    a = store.create("x", now=0.0); run(a.finish(now=1.0))
    b = store.create("x", now=2.0); run(b.finish(now=3.0))
    c = store.create("x", now=4.0)                                           # a third: the oldest finished (a) goes
    assert len(store) == 2
    with pytest.raises(StreamGone):
        store.get(a.run_id, "x", now=5.0)
    assert store.get(b.run_id, "x", now=5.0) is b and store.get(c.run_id, "x", now=5.0) is c


def test_a_comment_heartbeat_is_yielded_while_nothing_is_published_and_events_follow():
    async def go():
        rs = RunStream("r", "acct", now=0.0)
        out = []

        async def producer():
            await asyncio.sleep(0.25)
            await rs.publish("late", {"n": 1})
            await rs.finish(now=1.0)

        task = asyncio.create_task(producer())
        async for item in rs.follow(0, heartbeat_s=0.05):
            out.append(item)
        await task
        return out
    out = run(go())
    assert out.count(None) >= 2                                  # None is a heartbeat tick
    assert [e.id for e in out if e is not None] == [1]


def test_sse_frame_carries_the_id_the_event_name_and_one_json_line():
    rs = RunStream("r", "acct", now=0.0)
    run(rs.publish("scope", {"a": 1}))
    assert sse_frame(rs.events[0]) == 'id: 1\nevent: scope\ndata: {"a": 1}\n\n'
