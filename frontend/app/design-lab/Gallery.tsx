'use client'

import { useState } from 'react'
import { Banner } from '../ui/Banner'
import { Button } from '../ui/Button'
import { type Column, DataTable } from '../ui/DataTable'
import { Disclosure } from '../ui/Disclosure'
import { EmptyState } from '../ui/EmptyState'
import { Field } from '../ui/Field'
import { GradeBadge } from '../ui/GradeBadge'
import { Panel } from '../ui/Panel'
import { ProvenanceChip } from '../ui/ProvenanceChip'
import { StatBlock, StatList } from '../ui/StatBlock'
import { Tabs } from '../ui/Tabs'
import { useToast } from '../ui/Toast'
import { ValueState } from '../ui/ValueState'
import { formatMoney } from '../ui/format'
import { formatBps } from '../utils/formatBps'

interface SymbolRow { symbol: string; orders: number; medianTotalBps: number | null; totalUsd: number | null; notionalUsd: number }

export function Gallery({ symbols }: { symbols: SymbolRow[] }) {
  const toast = useToast()
  const [deleted, setDeleted] = useState(false)
  const columns: Column<SymbolRow>[] = [
    { key: 'symbol', header: 'Symbol', sortValue: (r) => r.symbol, cell: (r) => r.symbol },
    { key: 'orders', header: 'Orders', numeric: true, sortValue: (r) => r.orders, cell: (r) => r.orders.toLocaleString('en-US') },
    { key: 'bps', header: 'Median total cost', numeric: true, sortValue: (r) => r.medianTotalBps, cell: (r) => (r.medianTotalBps === null ? null : formatBps(r.medianTotalBps)) },
    { key: 'usd', header: 'Total cost', numeric: true, priority: 'low', sortValue: (r) => r.totalUsd, cell: (r) => (r.totalUsd === null ? null : formatMoney(r.totalUsd)) },
    { key: 'notional', header: 'Value ordered', numeric: true, priority: 'low', sortValue: (r) => r.notionalUsd, cell: (r) => formatMoney(r.notionalUsd) },
  ]
  // One row is deliberately without a value, to show how the table renders a value that was not computed.
  const rows: SymbolRow[] = [...symbols, { symbol: 'XRPUSDT', orders: 0, medianTotalBps: null, totalUsd: null, notionalUsd: 0 }]

  return (
    <>
      <Panel title="Measured, insufficient data, not computed" description="Three different facts from one component. They differ in the marker, the line under the value and the words, so no state rests on colour. The values in this section are examples of the component, not data.">
        <StatList>
          <StatBlock label="Measured"><ValueState state="measured" label="Example figure" value="12.4 bps" n={24} nLabel="orders" interval="90% interval 9.8 to 15.1" /></StatBlock>
          <StatBlock label="Insufficient data"><ValueState state="insufficient" label="Example figure" have={7} need={20} what="market orders had a usable expected cost" /></StatBlock>
          <StatBlock label="Not computed"><ValueState state="not-computed" label="Example figure" reason="The rebuilt demo trades carry no per-trade v1 fields." /></StatBlock>
          <StatBlock label="In a table cell"><span className="flex flex-col gap-1"><ValueState state="measured" label="Cell" value="3.1 bps" size="cell" /><ValueState state="insufficient" label="Cell" size="cell" /><ValueState state="not-computed" label="Cell" size="cell" /></span></StatBlock>
        </StatList>
      </Panel>

      <Panel title="Grades and provenance" description="Real grades of the demo accounts: demo-moderate under scoring v2.3.0, demo-moderate and demo-aggressive under the frozen v1. The chip colour is the grade's own; the letter and the words carry the meaning.">
        <div className="flex flex-wrap items-center gap-x-10 gap-y-5">
          <GradeBadge grade="A" score={93.40556873724222} version="v2" scoringVersion="v2.3.0" />
          <GradeBadge grade="B" score={84.80888516669383} version="v1" />
          <GradeBadge grade="C" score={60.67469266790485} version="v1" />
          <ProvenanceChip dataSource="synthetic-demo" />
          <ProvenanceChip dataSource="real-user" />
        </div>
      </Panel>

      <Panel title="Banners">
        <div className="flex flex-col gap-3">
          <Banner kind="info" title="Scoring version 2.3.0">Grades are computed from measured orders. The method page lists every metric.</Banner>
          <Banner kind="stale" title="Data last synced 3 days ago" action={<Button variant="secondary">Sync now</Button>}>Fills made since then are not in these numbers.</Banner>
          <Banner kind="refused" title="This key was refused">It can place trades. FillScore accepts read-only keys only. Create a key with only &ldquo;Enable Reading&rdquo; and connect it again.</Banner>
          <Banner kind="demo" title="Demo accounts are read-only">The demo trader is synthetic; the prices are real public prints.</Banner>
        </div>
      </Panel>

      <Panel title="Buttons">
        <div className="flex flex-wrap items-start gap-4">
          <Button>Download scorecard pack</Button>
          <Button variant="secondary">Export fills</Button>
          <Button variant="quiet">Cancel</Button>
          <Button disabled>Disabled</Button>
          <Button loading>Syncing</Button>
          {deleted ? <p role="status" className="py-2 text-sm text-ui-ink">Lab only: nothing was deleted.</p> : (
            <Button variant="destructive" confirm={{ label: 'Delete the account now' }} onClick={() => { setDeleted(true); toast.show({ title: 'Lab only', detail: 'Nothing was deleted.' }) }}>Delete account</Button>
          )}
        </div>
        <p className="mt-3 max-w-[68ch] text-sm text-ui-graphite">The ink button is the primary action. The measured colour never paints a control: it is kept for measured values. The destructive button asks once more, in place: press it, then press the red one or Cancel (Escape also cancels).</p>
      </Panel>

      <Panel title="Fields">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Key label" hint="Only you see this name." placeholder="Main account" />
          <Field label="API key" defaultValue="abc" error="The key is too short. Copy the whole key from the exchange and paste it again." />
          <Field label="Note" multiline hint="Notes stay on your account." className="sm:col-span-2" />
        </div>
      </Panel>

      <Panel title="Tabs, disclosure and toast">
        <Tabs label="Example views" tabs={[
          { id: 'one', label: 'Orders', content: <p className="max-w-[68ch] text-ui-graphite">Arrow keys move between the tabs; Home and End jump to the first and last.</p> },
          { id: 'two', label: 'Fills', content: <p className="max-w-[68ch] text-ui-graphite">Only the selected panel is visible, and only it is in the tab order.</p> },
          { id: 'three', label: 'Fees', content: <p className="max-w-[68ch] text-ui-graphite">The selected tab carries a 2 px ink underline and heavier weight.</p> },
        ]} />
        <div className="mt-6 flex flex-wrap items-start gap-6">
          <div className="w-full max-w-xl"><Disclosure summary="How this was measured">Each fill is compared with the public mid-price just before it, built from the last buyer-initiated and seller-initiated prints of the exchange&rsquo;s public trade file. Both prints must be at most 5 seconds old; otherwise the fill reads &ldquo;not computed&rdquo;.</Disclosure></div>
          <Button variant="secondary" onClick={() => toast.show({ title: 'Settings saved', detail: 'The notice closes by itself after six seconds.' })}>Show a confirmation</Button>
        </div>
      </Panel>

      <Panel title="Table" description="Sticky header, right-aligned tabular figures, sortable columns, a filter. On a phone the two last columns move into each row's details. The XRPUSDT row has no value, on purpose.">
        <DataTable caption="Total cost by symbol, demo-moderate" columns={columns} rows={rows} rowId={(r) => r.symbol} defaultSort={{ key: 'orders', dir: 'desc' }} filterLabel="Filter by symbol" />
      </Panel>

      <Panel title="Empty state">
        <EmptyState title="No orders have been measured yet" action={<Button variant="secondary">Connect an exchange</Button>}>Connect a read-only key and sync. The first orders appear here once their market data has been fetched.</EmptyState>
      </Panel>
    </>
  )
}
