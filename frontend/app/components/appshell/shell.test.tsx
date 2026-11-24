/**
 * Design v5 step 3: the shell's guards. The provenance banner is the invariant-I5 surface (a demo is never mistaken for the
 * user's data; an unknown source is never shown as "your data"); the period label is disabled and says why.
 */
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ProvenanceBanner } from './ProvenanceBanner'
import { PERIOD_TOOLTIP, PeriodLabel } from './PeriodLabel'
import { GROUP_TITLE, PHONE_BAR, SECTIONS } from '../shell/nav'
import { SECTION_ICON } from '../shell/navIcons'

describe('ProvenanceBanner', () => {
  it('a demo account reads the invariant sentence, in the banner', () => {
    const html = renderToStaticMarkup(<ProvenanceBanner dataSource="synthetic-demo" sourceText={null} />)
    expect(html).toContain('Demo account')
    expect(html).toContain('synthetic trader, real Binance prices')
    expect(html).toContain('read-only')
    expect(html).toContain('data-testid="provenance-banner"')
  })
  it("the user's own data draws no banner", () => {
    expect(renderToStaticMarkup(<ProvenanceBanner dataSource="real-user" sourceText="ignored" />)).toBe('')
  })
  it('a page with no stored source says where its figures come from, and with nothing to say draws nothing', () => {
    expect(renderToStaticMarkup(<ProvenanceBanner dataSource={null} sourceText="Your file, measured against Binance public trades" />)).toContain('Your file, measured against Binance public trades')
    expect(renderToStaticMarkup(<ProvenanceBanner dataSource={null} sourceText={null} />)).toBe('')
  })
  it('is 14 px text on the banner token', () => {
    const html = renderToStaticMarkup(<ProvenanceBanner dataSource="synthetic-demo" sourceText={null} />)
    expect(html).toContain('text-[14px]')
    expect(html).toContain('bg-ui-banner')
  })
})

describe('PeriodLabel', () => {
  const html = renderToStaticMarkup(<TooltipProvider><PeriodLabel period="January 2024" /></TooltipProvider>)
  it('is a disabled control that prints the period in words', () => {
    expect(html).toContain('aria-disabled="true"')
    expect(html).toContain('January 2024')
    expect(html).toContain('Period: ')
  })
  it('its tooltip says the choice comes next', () => {
    expect(PERIOD_TOOLTIP).toBe('Period choice comes next')
  })
})

describe('sidebar model', () => {
  it('every section has a lucide icon and a group; the review group is titled Review, the tools group Tools, the first untitled', () => {
    for (const s of SECTIONS) expect(SECTION_ICON[s.id], s.id).toBeTruthy()
    expect(GROUP_TITLE).toEqual({ main: null, review: 'Review', tools: 'Tools' })
  })
  it('the phone bar holds Home, Costs and Orders; More holds the rest', () => {
    expect(PHONE_BAR.map((id) => SECTIONS.find((s) => s.id === id)!.label)).toEqual(['Home', 'Costs', 'Orders'])
  })
})
