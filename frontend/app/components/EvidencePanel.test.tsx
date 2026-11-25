// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ToastProvider } from '../ui/Toast'
import { EvidencePanel } from './EvidencePanel'
import { findAdviceTerms } from '../../../backend/src/constants/adviceTerms'

const auth = { accessToken: 't', refreshAccessToken: async () => null }
const render = (mode: 'demo' | 'real' | null) => renderToStaticMarkup(<ToastProvider><EvidencePanel mode={mode} auth={auth} /></ToastProvider>)

describe('Reports card (design v5, PROPOSAL §5)', () => {
  it('a demo account gets one line and no stamp, no Download button and no NOT ISSUED', () => {
    const html = render('demo')
    expect(html).toContain('Demo accounts have no signed report')
    expect(html).not.toContain('NOT ISSUED')
    expect(html).not.toContain('Download')
    expect(html).not.toContain('data-testid="reports-list"')
    expect(html).toContain('Check a signed report')
  })

  it('a real account gets both signed reports, each with a Download button and a Verify link to /verify', () => {
    const html = render('real')
    expect(html).toContain('data-testid="reports-list"')
    expect(html).toContain('Scorecard report')
    expect(html).toContain('Best-execution report')
    expect((html.match(/>Download</g) ?? []).length).toBe(2)           // two reports, two buttons
    expect((html.match(/href="\/verify"[^>]*>Verify</g) ?? []).length).toBe(2)
    expect(html).not.toContain('NOT ISSUED')
  })

  it('names the signing key and says the file is checked in the browser; the words pass the advice check and never say "comply"', () => {
    const html = render('real')
    expect(html).toContain('key fingerprint')
    expect(html).toContain('A report is checked in your browser; the file never leaves it.')
    const text = html.replace(/<[^>]+>/g, ' ')
    expect(findAdviceTerms(text)).toEqual([])
    expect(text).toContain('It does not state that you comply with any rule.')
  })

  it('renders nothing before the account mode is known', () => {
    expect(render(null)).toBe('')
  })
})
