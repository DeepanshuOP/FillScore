/**
 * The pen margin note (design v3.1): a named button next to a value; a click opens the note, Escape closes it. Runs with
 * a fine pointer (Radix Popover); the touch sheet (Vaul) is checked in the browser QA.
 */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MarginNote } from './MarginNote'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('MarginNote', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('pointer: fine'), media: q, addEventListener() {}, removeEventListener() {} }))
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  })
  afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = '' })

  it('renders only the mark on the server: the note text is not printed until it is opened', () => {
    const html = renderToStaticMarkup(<MarginNote label="the total in bps">The total is 11.7 bps of the value ordered.</MarginNote>)
    expect(html).toContain('aria-label="Note: the total in bps"')
    expect(html).not.toContain('11.7 bps')
  })

  it('opens on click and closes on Escape', async () => {
    const host = document.createElement('div'); document.body.append(host)
    const root = createRoot(host)
    await act(async () => root.render(<MarginNote label="the band">Band 92.5 to 94.1.</MarginNote>))
    const btn = host.querySelector('button')!
    await act(async () => { btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); btn.click() })
    expect(document.body.textContent).toContain('Band 92.5 to 94.1.')
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
    expect(btn.getAttribute('aria-expanded')).toBe('false')
    await act(async () => root.unmount())
  })
})
