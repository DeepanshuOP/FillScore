/**
 * The evidence-pack download (M8 part 1). A pack is the JSON text the API sent, saved byte for byte (the signature covers
 * the files it lists, so the text is never re-serialised). Hand values: the body below is 42 characters, so 42 bytes.
 */
import { describe, expect, it, vi } from 'vitest'
import { downloadEvidencePack, packFileName } from './evidencePack'

// 42 characters, all ASCII, counted by parts: {"pack": is 8, {"manifest":{}} is 15, the comma 1, "files": 8, {"a":"b"} 9, the closing } 1.
const BODY = '{"pack":{"manifest":{}},"files":{"a":"b"}}'

function deps(res: Response | Error) {
  const saved: Array<{ name: string; text: string }> = []
  return {
    saved,
    d: {
      fetch: vi.fn(async () => { if (res instanceof Error) throw res; return res }) as unknown as typeof fetch,
      save: (name: string, text: string) => { saved.push({ name, text }) },
      onSaved: vi.fn(),
      onPhase: vi.fn(),
    },
  }
}
const auth = { accessToken: 't', refreshAccessToken: async () => null }
const json = (status: number, text: string) => new Response(text, { status, headers: { 'content-type': 'application/json' } })

describe('packFileName', () => {
  it('names the file by kind', () => {
    expect(packFileName('scorecard')).toBe('fillscore-scorecard-pack.json')
    expect(packFileName('best-execution')).toBe('fillscore-best-execution-pack.json')
  })
})

describe('downloadEvidencePack', () => {
  it('saves the body byte for byte, reports the size, and counts the download once', async () => {
    const { d, saved } = deps(json(200, BODY))
    const r = await downloadEvidencePack('scorecard', auth, d)
    expect(r).toEqual({ ok: true, fileName: 'fillscore-scorecard-pack.json', bytes: 42 })
    expect(saved).toEqual([{ name: 'fillscore-scorecard-pack.json', text: BODY }])
    expect(d.onSaved).toHaveBeenCalledTimes(1)
    expect(d.onPhase.mock.calls.map((c) => c[0])).toEqual(['preparing', 'saving'])
  })
  it('asks for the kind it was given, with the access token', async () => {
    const { d } = deps(json(200, BODY))
    await downloadEvidencePack('best-execution', auth, d)
    const [url, init] = (d.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/\/evidence\/pack\?kind=best-execution$/)
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer t')
  })
  it('503: the signing key is not configured, said plainly, nothing saved, nothing counted', async () => {
    const { d, saved } = deps(json(503, '{"error":"signing_not_configured"}'))
    const r = await downloadEvidencePack('scorecard', auth, d)
    expect(r).toMatchObject({ ok: false, reason: 'not-configured' })
    expect(r.ok === false && r.message).toMatch(/not available.*signing key/i)
    expect(saved).toEqual([])
    expect(d.onSaved).not.toHaveBeenCalled()
  })
  it('429 and a network failure each have their own message', async () => {
    expect(await downloadEvidencePack('scorecard', auth, deps(json(429, '{}')).d)).toMatchObject({ ok: false, reason: 'rate-limited' })
    expect(await downloadEvidencePack('scorecard', auth, deps(new TypeError('offline')).d)).toMatchObject({ ok: false, reason: 'network' })
  })
  it('401 after a refresh is a sign-in problem; any other status is a plain error with the status', async () => {
    expect(await downloadEvidencePack('scorecard', auth, deps(json(401, '{}')).d)).toMatchObject({ ok: false, reason: 'signed-out' })
    const r = await downloadEvidencePack('scorecard', auth, deps(json(500, '{}')).d)
    expect(r).toMatchObject({ ok: false, reason: 'error' })
    expect(r.ok === false && r.message).toContain('HTTP 500')
  })
  it('a 200 whose body is not a pack is refused, not saved', async () => {
    const { d, saved } = deps(json(200, '<html>'))
    expect(await downloadEvidencePack('scorecard', auth, d)).toMatchObject({ ok: false, reason: 'error' })
    expect(saved).toEqual([])
    expect(d.onSaved).not.toHaveBeenCalled()
  })
})
