/**
 * The Council's server-sent-event reader with resume (ml-service agents/stream_store.py).
 *
 * The browser's EventSource cannot send a POST body or an Authorization header, so the stream is read with fetch;
 * the protocol is the same: every event carries an `id:`, and a dropped connection continues with
 * `GET <stream>/<run>` and a `Last-Event-ID` header, which delivers only the events after that id. The run is never
 * started again: if the server no longer holds it, the reader throws `gone` and the page says so.
 * An event whose id was already handled is skipped, so a replay can never show a note twice.
 */

export interface SseEvent {
    id: number | null;
    event: string;
    data: string;
}

/** Incremental parser for text/event-stream: comment lines (heartbeats) are ignored; an event ends at a blank line. */
export class SseParser {
    private buffer = '';
    private id: number | null = null;
    private event = '';
    private data: string[] = [];

    push(chunk: string): SseEvent[] {
        this.buffer += chunk;
        const lines = this.buffer.split('\n');
        this.buffer = lines.pop() ?? '';
        const out: SseEvent[] = [];
        for (const raw of lines) {
            const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
            if (line === '') {
                if (this.event && this.data.length > 0) out.push({ id: this.id, event: this.event, data: this.data.join('\n') });
                this.id = null;
                this.event = '';
                this.data = [];
            } else if (line.startsWith(':')) {
                continue;
            } else {
                const i = line.indexOf(':');
                const field = i < 0 ? line : line.slice(0, i);
                let value = i < 0 ? '' : line.slice(i + 1);
                if (value.startsWith(' ')) value = value.slice(1);
                if (field === 'id') this.id = /^\d+$/.test(value) ? Number(value) : null;
                else if (field === 'event') this.event = value;
                else if (field === 'data') this.data.push(value);
            }
        }
        return out;
    }
}

export class CouncilStreamError extends Error {
    constructor(
        public kind: 'http' | 'gone' | 'resume_failed',
        message: string,
        public status?: number,
        public body?: unknown,
    ) {
        super(message);
    }
}

export const STREAM_LOST_MESSAGE = 'The connection to the audit was lost and could not be resumed. The audit was not started again.';

const BACKOFF_MS = [500, 1000, 2000, 4000, 4000];

export interface ReadOptions {
    url: string;
    body: unknown;
    headers: Record<string, string>;
    userId?: string;
    onEvent: (event: string, data: unknown) => void;
    fetchImpl?: typeof fetch;
    maxResumes?: number;
    /** Aborts the read and any resume (the page unmounted): nothing is requested after it. */
    signal?: AbortSignal;
    wait?: (ms: number) => Promise<void>;
}

const TERMINAL = new Set(['complete', 'error']);

export async function readCouncilStream(o: ReadOptions): Promise<void> {
    const doFetch = o.fetchImpl ?? fetch;
    const wait = o.wait ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    const maxResumes = o.maxResumes ?? BACKOFF_MS.length;
    let lastId = 0;
    let terminal = false;
    let progressed = false;

    const pump = async (res: Response): Promise<void> => {
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        const parser = new SseParser();
        for (;;) {
            const { done, value } = await reader.read();
            if (done) return;
            for (const ev of parser.push(decoder.decode(value, { stream: true }))) {
                if (ev.id !== null) {
                    if (ev.id <= lastId) continue;          // already shown: a replay never repeats a note
                    lastId = ev.id;
                    progressed = true;
                }
                if (TERMINAL.has(ev.event)) terminal = true;
                let data: unknown;
                try {
                    data = JSON.parse(ev.data);
                } catch {
                    continue;
                }
                o.onEvent(ev.event, data);
            }
        }
    };

    const first = await doFetch(o.url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...o.headers }, body: JSON.stringify(o.body), signal: o.signal });
    if (!first.ok || !first.body) {
        const body = await first.json().catch(() => null);
        throw new CouncilStreamError('http', `HTTP ${first.status}`, first.status, body);
    }
    const runId = first.headers.get('X-Council-Run');
    let res: Response | null = first;
    let dropped: unknown = null;

    let attempt = 0;
    for (;;) {
        if (o.signal?.aborted) return;
        if (res) {
            try {
                await pump(res);
                dropped = null;
            } catch (e) {
                dropped = e;
            }
            if (terminal) return;
        }
        if (!runId) {
            if (dropped) throw dropped;                     // nothing to resume: the caller's usual network message
            return;
        }
        // a resume that delivered events was a success: only consecutive failures count toward giving up
        if (progressed) { attempt = 0; progressed = false; }
        if (attempt >= maxResumes) throw new CouncilStreamError('resume_failed', STREAM_LOST_MESSAGE);
        await wait(BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]);
        attempt++;
        if (o.signal?.aborted) return;
        try {
            const q = o.userId ? `?userId=${encodeURIComponent(o.userId)}` : '';
            const next = await doFetch(`${o.url}/${encodeURIComponent(runId)}${q}`, {
                method: 'GET',
                headers: { ...o.headers, 'Last-Event-ID': String(lastId) },
                signal: o.signal,
            });
            if (next.status === 404 || next.status === 409) {
                const body = (await next.json().catch(() => null)) as { message?: unknown } | null;
                throw new CouncilStreamError('gone', typeof body?.message === 'string' ? body.message : STREAM_LOST_MESSAGE, next.status, body);
            }
            res = next.ok && next.body ? next : null;
        } catch (e) {
            if (e instanceof CouncilStreamError) throw e;
            res = null;                                     // the network is still down: try again after the next wait
        }
    }
}
