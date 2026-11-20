/**
 * Behaviour of the design-system components (M8 phase 2a). Static markup for structure; real clicks (jsdom) for the
 * destructive-confirm flow. Hand values: grade 93.40556873724222 prints "93.4 of 100"; 84.80888516669383 prints "84.8 of 100".
 */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { Banner } from './Banner'
import { Button } from './Button'
import { BarList } from './ChartFrame'
import { DataTable, type Column } from './DataTable'
import { Field } from './Field'
import { GradeBadge } from './GradeBadge'
import { ProvenanceChip } from './ProvenanceChip'
import { Tabs } from './Tabs'
import { NOT_COMPUTED } from '../utils/notComputed'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

interface Row { symbol: string; orders: number; bps: number | null; note: string }
const ROWS: Row[] = [
  { symbol: 'BTCUSDT', orders: 109, bps: 9.9989, note: 'a' },
  { symbol: 'ETHUSDT', orders: 94, bps: null, note: 'b' },
]
const COLS: Column<Row>[] = [
  { key: 'symbol', header: 'Symbol', sortValue: (r) => r.symbol, cell: (r) => r.symbol },
  { key: 'orders', header: 'Orders', numeric: true, sortValue: (r) => r.orders, cell: (r) => r.orders },
  { key: 'bps', header: 'Median cost', numeric: true, priority: 'low', sortValue: (r) => r.bps, cell: (r) => (r.bps === null ? null : `${r.bps.toFixed(1)} bps`) },
]
const table = renderToStaticMarkup(<DataTable caption="Cost by symbol" columns={COLS} rows={ROWS} rowId={(r) => r.symbol} defaultSort={{ key: 'orders', dir: 'desc' }} />)

describe('DataTable', () => {
  it('has a sticky header, a caption and aria-sort on the sorted column', () => {
    expect(table).toContain('sticky top-0')
    expect(table).toContain('<caption class="sr-only">Cost by symbol</caption>')
    expect(table).toMatch(/aria-sort="descending"/)
    expect(table).toMatch(/aria-sort="none"/)
  })
  it('aligns numbers right with tabular figures, header and cells alike', () => {
    expect(table.match(/text-right/g)!.length).toBeGreaterThanOrEqual(4)
    expect(table).toContain('tabular-nums')
  })
  it('the phone layout drops the low-priority column and offers a details button per row', () => {
    expect(table).toMatch(/hidden md:table-cell/)
    expect(table).toMatch(/aria-label="Details of BTCUSDT"/)
  })
  it('sorts by the default key: 109 orders before 94', () => {
    expect(table.indexOf('BTCUSDT')).toBeLessThan(table.indexOf('ETHUSDT'))
  })
  it('a null cell reads "not computed for this data", not blank and not zero', () => {
    expect(table).toContain(NOT_COMPUTED)
    expect(table).toContain('data-state="not-computed"')
  })
})

describe('BarList', () => {
  it('a stated (not measured) value is an outline in the neutral colour, so the measured colour keeps its meaning', () => {
    const h = renderToStaticMarkup(<BarList rows={[{ label: 'Fees', value: 41.98, valueLabel: '$41.98', unmeasured: true, note: 'published rate' }, { label: 'Unfilled', value: 10.63, valueLabel: '$10.63' }]} />)
    const bars = h.split('<li').slice(1)
    expect(bars[0]).toContain('border-dashed')
    expect(bars[0]).toContain('background:transparent')
    expect(bars[0]).toContain('published rate')
    expect(bars[1]).not.toContain('border-dashed')
    expect(bars[1]).toContain('color-mix(in srgb, var(--ui-measured)')
  })
  it('a negative value extends to the left of the shared zero line', () => {
    const h = renderToStaticMarkup(<BarList rows={[{ label: 'a', value: 10, valueLabel: '$10' }, { label: 'b', value: -2, valueLabel: '−$2' }]} />)
    // range = 12: zero at 2/12 = 16.67% of the track; the negative bar starts at 0% and is 2/12 = 16.67% wide
    expect(h).toContain('left:16.666666666666664%')
    expect(h).toMatch(/left:0%;width:16\.666666666666664%/)
  })
})

describe('GradeBadge', () => {
  it('v2 says measured and prints the score to one decimal', () => {
    const h = renderToStaticMarkup(<GradeBadge grade="A" score={93.40556873724222} version="v2" scoringVersion="v2.3.0" />)
    expect(h).toContain('Measured score, grade A')
    expect(h).toContain('93.4 of 100, scoring v2.3.0')
  })
  it('v1 says rule-based and published', () => {
    const h = renderToStaticMarkup(<GradeBadge grade="B" score={84.80888516669383} version="v1" />)
    expect(h).toContain('Rule-based score, grade B')
    expect(h).toContain('84.8 of 100')
    expect(h).toContain('published grade of the earlier demo data')
  })
})

describe('ProvenanceChip', () => {
  it('a demo and a real account differ in words and line style', () => {
    const d = renderToStaticMarkup(<ProvenanceChip dataSource="synthetic-demo" />)
    const r = renderToStaticMarkup(<ProvenanceChip dataSource="real-user" />)
    // design v3 wording (the top bar's "synthetic trader, real prices"); it still names the demo as synthetic
    expect(d).toContain('Synthetic trader, real prices')
    expect(d).toContain('border-dashed')
    expect(r).toContain('Your exchange data')
    expect(r).toContain('border-solid')
  })
})

describe('Banner', () => {
  it('a refusal is announced at once, the other kinds politely', () => {
    expect(renderToStaticMarkup(<Banner kind="refused" title="x" />)).toContain('role="alert"')
    for (const k of ['info', 'stale', 'demo'] as const) expect(renderToStaticMarkup(<Banner kind={k} title="x" />)).toContain('role="status"')
  })
})

describe('Field', () => {
  it('ties label, hint and error to the control', () => {
    const h = renderToStaticMarkup(<Field label="Label" hint="A hint" error="A problem and the way out" />)
    const id = /<input id="([^"]+)"/.exec(h)![1]
    expect(h).toContain(`for="${id}"`)
    expect(h).toContain('aria-invalid="true"')
    expect(h).toContain(`aria-describedby="${id}-hint ${id}-error"`)
  })
})

describe('Field with a chosen id', () => {
  it('keeps that id on the control and points the label, hint and error at it (axe "label" violation found 2026-11-20)', () => {
    const h = renderToStaticMarkup(<Field id="login-password" label="Password" hint="A hint" error="A problem" />)
    expect(h).toContain('<input id="login-password"')
    expect(h).toContain('for="login-password"')
    expect(h).toContain('aria-describedby="login-password-hint login-password-error"')
  })
})

describe('Tabs', () => {
  it('marks one tab selected and only it is in the tab order', () => {
    const h = renderToStaticMarkup(<Tabs label="Views" tabs={[{ id: 'a', label: 'A', content: 'one' }, { id: 'b', label: 'B', content: 'two' }]} />)
    expect(h.match(/aria-selected="true"/g)).toHaveLength(1)
    expect(h.match(/tabindex="-1"/g)).toHaveLength(1)
  })
})

describe('Button', () => {
  function mount(node: React.ReactElement) {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    act(() => root.render(node))
    return { host, unmount: () => act(() => root.unmount()) }
  }
  const click = (el: Element) => act(() => { (el as HTMLElement).click() })

  it('a destructive button acts only on the second click, and Cancel disarms it', () => {
    const onClick = vi.fn()
    const { host, unmount } = mount(<Button variant="destructive" confirm={{ label: 'Delete the account now' }} onClick={onClick}>Delete account</Button>)
    const first = host.querySelector('button')!
    click(first)
    expect(onClick).not.toHaveBeenCalled()
    expect(host.textContent).toContain('Delete the account now')
    expect(host.textContent).toContain('Cancel')
    click(host.querySelectorAll('button')[1])   // Cancel
    expect(host.textContent).toContain('Delete account')
    expect(host.textContent).not.toContain('Delete the account now')
    click(host.querySelector('button')!)        // arm again
    click(host.querySelector('button')!)        // confirm
    expect(onClick).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('Escape disarms', () => {
    const onClick = vi.fn()
    const { host, unmount } = mount(<Button variant="destructive" confirm={{ label: 'Confirm delete' }} onClick={onClick}>Delete</Button>)
    click(host.querySelector('button')!)
    expect(host.textContent).toContain('Confirm delete')
    act(() => { host.querySelector('span')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    expect(host.textContent).not.toContain('Confirm delete')
    expect(onClick).not.toHaveBeenCalled()
    unmount()
  })

  it('loading disables the button and says it is busy', () => {
    const h = renderToStaticMarkup(<Button loading>Save</Button>)
    expect(h).toContain('disabled')
    expect(h).toContain('aria-busy="true"')
  })
})
