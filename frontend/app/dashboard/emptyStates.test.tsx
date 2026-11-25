// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import ConnectPrompt from '../components/ConnectPrompt'
import { CostsView } from './CostsView'

// Design v5, PROPOSAL §4 rows 7 and 12: a real account with nothing measured yet gets a designed empty state whose one primary action is
// "Connect an exchange" (the onboarding checklist is the next order). A demo account has nothing to connect, so its empty states have no action.
const base = {
  headline: null, ordersBody: null, grade: null, band: null, costVs: undefined, v1: { grade: null, score: null }, facts: [] as Array<[string, string]>,
  periodLabel: 'Jan 2024', query: '', request: async () => ({ status: 200, body: null }), onOpenOrder: () => {},
}
const costs = (isDemo: boolean) => renderToStaticMarkup(<CostsView {...base} isDemo={isDemo} />)
const connectLinks = (html: string) => (html.match(/href="\/app\/connect"[^>]*>Connect an exchange</g) ?? []).length

describe('empty states with the Connect action', () => {
  it('No trades yet: title, the read-only sentence, the primary action and the two quiet links', () => {
    const html = renderToStaticMarkup(<ConnectPrompt />)
    expect(html).toContain('No trades yet')
    expect(connectLinks(html)).toBe(1)
    expect(html).toContain('Exchange keys are read-only')
    expect(html).toContain('Check an exchange export')
    expect(html).toContain('View the sample audit')
  })

  it('Costs of a real account with nothing measured: "Where the cost came from" and the grade card each carry the action', () => {
    const html = costs(false)
    expect(html).toContain('Not measured yet')
    expect(html).toContain('No grade yet')
    expect(connectLinks(html)).toBe(2)
  })

  it('Costs of a demo account in the same state names the missing step and offers no action', () => {
    const html = costs(true)
    expect(html).toContain('Not measured yet')
    expect(html).toContain('No grade yet')
    expect(connectLinks(html)).toBe(0)
  })

  it('no empty state prints a zero in place of a missing figure', () => {
    const text = costs(false).replace(/<[^>]+>/g, ' ')
    expect(text).toContain('not computed')
    expect(text).not.toMatch(/\$0\.00|\b0 orders\b/)
  })
})
