import { describe, it, expect, vi } from 'vitest';
import { fetchAndSave, downloadReport } from './downloads';

function deps(resp: () => Promise<Response>) {
  const clicks: string[] = [];
  const anchor: any = { href: '', download: '', click: vi.fn(() => clicks.push(anchor.download)), remove: vi.fn() };
  const doc: any = { createElement: vi.fn(() => anchor), body: { appendChild: vi.fn() } };
  const revoked: string[] = [];
  return {
    d: {
      fetch: vi.fn(resp) as any, document: doc,
      createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn((u: string) => revoked.push(u)),
      setTimeout: ((fn: () => void) => { fn(); return 0 as any; }) as any,
    },
    anchor, doc, clicks, revoked,
  };
}
const pdf = () => new Response('%PDF-1.3', { status: 200, headers: { 'content-type': 'application/pdf', 'content-disposition': 'attachment; filename="fillscore-audit-demo-okx-2026-11-05.pdf"' } });

describe('fetchAndSave', () => {
  it('PDF response -> anchor appended before click, named from Content-Disposition, object URL revoked', async () => {
    const t = deps(async () => pdf());
    const r = await fetchAndSave('http://x/api/audit/report?userId=demo-okx', { expectType: 'application/pdf', fallbackName: 'r.pdf' }, t.d);
    expect(r).toEqual({ ok: true });
    expect(t.doc.body.appendChild).toHaveBeenCalledWith(t.anchor);
    expect(t.anchor.click).toHaveBeenCalledTimes(1);
    expect(t.clicks).toEqual(['fillscore-audit-demo-okx-2026-11-05.pdf']);
    expect(t.anchor.remove).toHaveBeenCalled();
    expect(t.revoked).toEqual(['blob:x']);
  });
  it('JSON 404 -> inline message with the server text and HTTP status, nothing downloaded', async () => {
    const t = deps(async () => new Response(JSON.stringify({ error: 'No audit found for this user.' }), { status: 404, headers: { 'content-type': 'application/json' } }));
    const r = await fetchAndSave('http://x', { expectType: 'application/pdf', fallbackName: 'r.pdf' }, t.d);
    expect(r).toEqual({ ok: false, status: 404, message: 'No audit found for this user. (HTTP 404)' });
    expect(t.anchor.click).not.toHaveBeenCalled();
  });
  it('200 with a JSON body is not saved as a PDF', async () => {
    const t = deps(async () => new Response('{"a":1}', { status: 200, headers: { 'content-type': 'application/json' } }));
    const r = await fetchAndSave('http://x', { expectType: 'application/pdf', fallbackName: 'r.pdf' }, t.d);
    expect(r.ok).toBe(false);
    expect(r.message).toContain('application/json');
    expect(r.message).toContain('HTTP 200');
    expect(t.anchor.click).not.toHaveBeenCalled();
  });
  it('network error -> inline message, no throw', async () => {
    const t = deps(async () => { throw new TypeError('Failed to fetch'); });
    const r = await fetchAndSave('http://x', { expectType: 'application/pdf', fallbackName: 'r.pdf' }, t.d);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/could not reach the server/i);
  });
});

describe('downloadReport', () => {
  it('sample/demo mode requests the report for the demo id, no token', async () => {
    const t = deps(async () => pdf());
    const r = await downloadReport({ mode: 'demo', userId: 'demo-okx' }, { accessToken: null, refreshAccessToken: async () => null }, t.d, 'http://api/api');
    expect(r.ok).toBe(true);
    expect(t.d.fetch.mock.calls[0][0]).toBe('http://api/api/audit/report?userId=demo-okx');
  });
  it('demo mode without a resolved id reports an error instead of doing nothing', async () => {
    const t = deps(async () => pdf());
    const r = await downloadReport({ mode: 'demo', userId: null }, { accessToken: null, refreshAccessToken: async () => null }, t.d, 'http://api/api');
    expect(r.ok).toBe(false);
    expect(r.message).toBeTruthy();
    expect(t.d.fetch).not.toHaveBeenCalled();
  });
  it('real mode: asks for a one-minute token, then fetches the report with dl=token', async () => {
    const calls: string[] = [];
    const t = deps(async () => pdf());
    t.d.fetch = vi.fn(async (url: string) => {
      calls.push(url);
      return url.endsWith('/audit/download-token') ? new Response(JSON.stringify({ token: 'tok' }), { status: 200, headers: { 'content-type': 'application/json' } }) : pdf();
    }) as any;
    const r = await downloadReport({ mode: 'real', userId: null }, { accessToken: 'a', refreshAccessToken: async () => 'a' }, t.d, 'http://api/api');
    expect(r.ok).toBe(true);
    expect(calls).toEqual(['http://api/api/audit/download-token', 'http://api/api/audit/report?dl=tok']);
  });
  it('real mode: no stored audit -> inline message (HTTP 404), not a JSON tab', async () => {
    const t = deps(async () => pdf());
    t.d.fetch = vi.fn(async (url: string) => url.endsWith('/audit/download-token')
      ? new Response(JSON.stringify({ token: 'tok' }), { status: 200, headers: { 'content-type': 'application/json' } })
      : new Response(JSON.stringify({ error: 'No audit found for this user.' }), { status: 404, headers: { 'content-type': 'application/json' } })) as any;
    const r = await downloadReport({ mode: 'real', userId: null }, { accessToken: 'a', refreshAccessToken: async () => 'a' }, t.d, 'http://api/api');
    expect(r).toMatchObject({ ok: false, status: 404, message: 'No audit found for this user. (HTTP 404)' });
  });
});

import { filenameFrom } from './downloads';

describe('filenameFrom', () => {
  it('prefers filename* and decodes it', () => {
    expect(filenameFrom(`attachment; filename="a.pdf"; filename*=UTF-8''fill%20score.pdf`, 'x.pdf')).toBe('fill score.pdf');
  });
  it('strips path separators and odd characters', () => {
    expect(filenameFrom('attachment; filename="../../etc/pa<ss>.pdf"', 'x.pdf')).toBe('.._.._etc_pa_ss_.pdf'.replace(/^\.+/, ''));
  });
  it('falls back when absent', () => {
    expect(filenameFrom(null, 'x.pdf')).toBe('x.pdf');
  });
});
