/**
 * A3 (orders of 2026-11-23): provenance prints once per page. On the landing's hero it is the tape's label (the page's line) and
 * the hero's phone receipt (a printed object that can be screenshotted alone, so it keeps its own). The line that sat under the
 * hero's buttons repeated the label and is gone.
 */
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { TapeHero } from './TapeHero'

const LINE = /synthetic trader, real prices/gi

describe('hero provenance', () => {
  it('the hero prints it twice: the tape label and the phone receipt, nothing under the buttons', () => {
    const html = renderToStaticMarkup(<TapeHero />)
    expect(html.match(LINE)?.length).toBe(2)
    expect(html).toContain('data-testid="tape-label"')
    const afterButtons = html.slice(html.indexOf('How it works</a>'))
    expect(afterButtons).not.toMatch(LINE)
  })
})
