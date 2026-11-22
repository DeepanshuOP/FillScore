import { describe, expect, it } from 'vitest';
import { CouncilStreamError, SseParser, STREAM_LOST_MESSAGE, readCouncilStream } from './councilStream';

const frame = (id: number, event: string, data: object) => `id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

function sseResponse(text: string, opts: { runId?: string | null; breakAfter?: boolean; status?: number } = {}): Response {
    const enc = new TextEncoder();
    // The chunk is delivered first; the error comes on the next read (an error() right after enqueue() would drop the chunk).
    let pulled = false;
    const body = new ReadableStream<Uint8Array>({
        pull(c) {
            if (!pulled) {
                pulled = true;
                c.enqueue(enc.encode(text));
            } else if (opts.breakAfter) c.error(new TypeError('network error'));
            else c.close();
        },
    });
    const headers: Record<string, string> = {};
    if (opts.runId !== null) headers['X-Council-Run'] = opts.runId ?? 'run-1';
    return new Response(body, { status: opts.status ?? 200, headers });
}

const noWait = async () => {};

function scripted(responses: Array<Response | Error>) {
    const calls: Array<{ url: string; method: string; headers: Record<string, string> }> = [];
    const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(url), method: init?.method ?? 'GET', headers: (init?.headers ?? {}) as Record<string, string> });
        const next = responses.shift();
        if (!next) throw new Error('no more scripted responses');
        if (next instanceof Error) throw next;
        return next;
    }) as typeof fetch;
    return { fetchImpl, calls };
}

describe('SseParser', () => {
    it('reads id, event and data, ignores comment heartbeats, and handles a frame split across chunks', () => {
        const p = new SseParser();
        expect(p.push(': keepalive\n\nid: 7\nevent: sco')).toEqual([]);
        expect(p.push('pe\ndata: {"a":1}\n\n')).toEqual([{ id: 7, event: 'scope', data: '{"a":1}' }]);
    });
    it('gives a null id to an event without one (the old server) and tolerates CRLF', () => {
        const p = new SseParser();
        expect(p.push('event: x\r\ndata: {}\r\n\r\n')).toEqual([{ id: null, event: 'x', data: '{}' }]);
    });
});

describe('readCouncilStream', () => {
    const base = { url: 'http://ml/ml/agents/council/stream', body: { symbol: 'BTCUSDT' }, headers: { Authorization: 'Bearer t' }, wait: noWait };

    it('delivers every event once and makes one request when the stream ends normally', async () => {
        const { fetchImpl, calls } = scripted([sseResponse(frame(1, 'scope', { n: 1 }) + frame(2, 'complete', { ok: true }))]);
        const seen: Array<[string, unknown]> = [];
        await readCouncilStream({ ...base, fetchImpl, onEvent: (e, d) => seen.push([e, d]) });
        expect(seen).toEqual([['scope', { n: 1 }], ['complete', { ok: true }]]);
        expect(calls.map((c) => c.method)).toEqual(['POST']);
    });

    it('resumes with Last-Event-ID after a drop and shows no event twice, even if the server repeats one', async () => {
        const { fetchImpl, calls } = scripted([
            sseResponse(frame(1, 'scope', { n: 1 }) + frame(2, 'agent_done', { agent: 'fee' }), { breakAfter: true }),
            sseResponse(frame(2, 'agent_done', { agent: 'fee' }) + frame(3, 'agent_done', { agent: 'risk' }) + frame(4, 'complete', { ok: true })),
        ]);
        const seen: string[] = [];
        await readCouncilStream({ ...base, fetchImpl, userId: 'demo-moderate', onEvent: (e, d) => seen.push(`${e}:${JSON.stringify(d)}`) });
        expect(seen).toEqual(['scope:{"n":1}', 'agent_done:{"agent":"fee"}', 'agent_done:{"agent":"risk"}', 'complete:{"ok":true}']);
        expect(calls.map((c) => c.method)).toEqual(['POST', 'GET']);                 // the run was not started again
        expect(calls[1].url).toBe('http://ml/ml/agents/council/stream/run-1?userId=demo-moderate');
        expect(calls[1].headers['Last-Event-ID']).toBe('2');
        expect(calls[1].headers.Authorization).toBe('Bearer t');
    });

    it('resumes after a stream that closes cleanly without a final event', async () => {
        const { fetchImpl, calls } = scripted([
            sseResponse(frame(1, 'scope', {})),
            sseResponse(frame(2, 'complete', {})),
        ]);
        const seen: string[] = [];
        await readCouncilStream({ ...base, fetchImpl, onEvent: (e) => seen.push(e) });
        expect(seen).toEqual(['scope', 'complete']);
        expect(calls[1].headers['Last-Event-ID']).toBe('1');
    });

    it('a run the server no longer holds ends in a clear error and never a second POST', async () => {
        const gone = new Response(JSON.stringify({ code: 'stream_expired', message: 'This audit\'s stream is no longer available. The audit was not started again.' }), { status: 404 });
        const { fetchImpl, calls } = scripted([sseResponse(frame(1, 'scope', {}), { breakAfter: true }), gone]);
        await expect(readCouncilStream({ ...base, fetchImpl, onEvent: () => {} })).rejects.toMatchObject({
            kind: 'gone',
            status: 404,
            message: "This audit's stream is no longer available. The audit was not started again.",
        });
        expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
    });

    it('gives up after the resume attempts with a message that says nothing was restarted', async () => {
        const down = () => new TypeError('network down');
        const { fetchImpl, calls } = scripted([sseResponse(frame(1, 'scope', {}), { breakAfter: true }), down(), down(), down()]);
        const err = await readCouncilStream({ ...base, fetchImpl, maxResumes: 3, onEvent: () => {} }).catch((e) => e);
        expect(err).toBeInstanceOf(CouncilStreamError);
        expect(err.kind).toBe('resume_failed');
        expect(err.message).toBe(STREAM_LOST_MESSAGE);
        expect(calls.map((c) => c.method)).toEqual(['POST', 'GET', 'GET', 'GET']);
    });

    it('a stream with no run id cannot be resumed: the original network error surfaces, nothing is requested again', async () => {
        const { fetchImpl, calls } = scripted([sseResponse(frame(1, 'scope', {}), { runId: null, breakAfter: true })]);
        await expect(readCouncilStream({ ...base, fetchImpl, onEvent: () => {} })).rejects.toThrow('network error');
        expect(calls).toHaveLength(1);
    });

    it('a refused POST throws an http error carrying the status and body (the 503 maintenance notice)', async () => {
        const { fetchImpl } = scripted([new Response(JSON.stringify({ status: 'unavailable' }), { status: 503 })]);
        await expect(readCouncilStream({ ...base, fetchImpl, onEvent: () => {} })).rejects.toMatchObject({ kind: 'http', status: 503, body: { status: 'unavailable' } });
    });

    it('an error event ends the stream without a resume', async () => {
        const { fetchImpl, calls } = scripted([sseResponse(frame(1, 'error', { code: 'NO_DATA' }))]);
        const seen: string[] = [];
        await readCouncilStream({ ...base, fetchImpl, onEvent: (e) => seen.push(e) });
        expect(seen).toEqual(['error']);
        expect(calls).toHaveLength(1);
    });
});
