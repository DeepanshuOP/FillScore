import { costVsExpectedLine, DEMO_NOTE, type CostVsExpected } from '../../dashboard/scoreV2'
import { BarList, ChartFrame } from '../../ui/ChartFrame'
import { Banner } from '../../ui/Banner'
import { GradeBadge } from '../../ui/GradeBadge'
import { Panel } from '../../ui/Panel'
import { ProvenanceChip } from '../../ui/ProvenanceChip'
import { ValueState } from '../../ui/ValueState'
import { formatUsd, formatSignedBps } from '../../ui/format'
import { EvidencePanel } from '../EvidencePanel'
import { LabShell } from '../LabShell'
import { parseLab } from '../params'
import mock from '../fixtures/dashboard-mock.json'

export default async function DashboardMock({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = parseLab(await searchParams)
  const t = mock.totals
  const terms = [
    { label: 'Fees', value: mock.termsUsd.fees },
    { label: 'Unfilled orders', value: mock.termsUsd.unfilled },
    { label: 'Spread paid', value: mock.termsUsd.spread },
    { label: 'Impact and timing', value: mock.termsUsd.impactTiming },
  ]
  const signed = (v: number) => formatUsd(v).replace('-', '−')
  // the part measured against market prices: everything except the fees of a demo account (stated at the published rate)
  const measuredUsd = mock.termsUsd.spread + mock.termsUsd.impactTiming + mock.termsUsd.unfilled
  const c = mock.costVsExpected as unknown as CostVsExpected

  return (
    <LabShell params={params} page="/design-lab/dashboard" title="Dashboard headline and evidence panel"
      intro="A mock on demo-moderate, built from the offline demo data (real public prices, synthetic trader behaviour). The headline is the measured grade, the total cost in dollars and the cost against what was expected. The rule-based grade of the earlier demo data is a labelled second line. Nothing here is a production screen.">
      <section aria-labelledby="headline" className="rounded-ui border border-ui-rule bg-ui-raised p-5 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <GradeBadge grade={mock.v2.grade} score={mock.v2.composite} version="v2" scoringVersion={mock.v2.scoringVersion} size="lg" />
          <ProvenanceChip dataSource="synthetic-demo" />
        </div>
        {/* The total is a sum of measured terms and of fees stated at the published rate (a demo account's fees are not
            independently measured), so the total carries no "measured" marker: the marker sits on the measured part below. */}
        <h2 id="headline" className="mt-6 max-w-[34ch] text-[1.5rem] leading-[1.3] font-semibold text-balance text-ui-ink sm:text-[1.75rem] sm:leading-[1.3]">
          The {t.orders} orders paid {formatUsd(t.usd)} in total.
        </h2>
        <dl className="mt-4 grid gap-x-10 gap-y-3 sm:grid-cols-2">
          <div><dt className="mb-1 text-sm text-ui-graphite">Measured against market prices</dt>
            <dd><ValueState state="measured" label="Measured part of the total" value={formatUsd(measuredUsd)} size="md" n={t.orders} nLabel="orders" /></dd></div>
          <div><dt className="mb-1 text-sm text-ui-graphite">Fees at the published rate, not independently measured</dt>
            <dd className="text-[1.25rem] leading-7 font-semibold tabular-nums text-ui-ink">{formatUsd(mock.termsUsd.fees)}</dd></div>
        </dl>
        <p className="mt-3 text-sm text-ui-graphite">The total is {t.bps.toFixed(1)} bps of the value ordered.</p>
        <p className="mt-4 max-w-[68ch] text-ui-graphite">{costVsExpectedLine(c).replace(/(^|[\s(])-(?=\d)/g, '$1−')}</p>
        <div className="mt-6 border-t border-ui-rule pt-4">
          <GradeBadge grade={mock.v1.grade} score={mock.v1.score} version="v1" />
        </div>
      </section>

      <Banner kind="demo" title="Real prices, synthetic trader">{DEMO_NOTE}</Banner>

      <ChartFrame
        title={`Where the ${formatUsd(t.usd)} went`}
        summary={`Fees, at the published rate, were ${formatUsd(mock.termsUsd.fees)}; unfilled orders were ${formatUsd(mock.termsUsd.unfilled)}. Spread paid and impact and timing, the terms measured against prices, were each below zero in this period.`}
        chart={<BarList rows={terms.map((r) => ({ label: r.label, value: r.value, valueLabel: signed(r.value),
          ...(r.label === 'Fees' ? { unmeasured: true, note: 'published rate' } : {}) }))} />}
        table={
          <table className="w-full max-w-lg text-sm">
            <caption className="sr-only">Total cost by term, in US dollars</caption>
            <thead><tr><th scope="col" className="border-b border-ui-edge py-2 text-left font-medium text-ui-graphite">Term</th><th scope="col" className="border-b border-ui-edge py-2 text-right font-medium text-ui-graphite">Total</th></tr></thead>
            <tbody>
              {terms.map((r) => <tr key={r.label} className="border-b border-ui-rule"><th scope="row" className="py-2 text-left font-normal text-ui-ink">{r.label}{r.label === 'Fees' ? ', at the published rate (not independently measured)' : ''}</th><td className="py-2 text-right tabular-nums text-ui-ink">{signed(r.value)}</td></tr>)}
              <tr><th scope="row" className="py-2 text-left font-semibold text-ui-ink">Total</th><td className="py-2 text-right font-semibold tabular-nums text-ui-ink">{signed(t.usd)}</td></tr>
            </tbody>
          </table>
        }
        source="USD is each term in basis points times the order's intended value, summed over the orders (the rule of the order replay). The fee term of a demo account is not independently measured."
      />

      <Panel title="Cost against what was expected" description="The market orders only; the interval comes from a bootstrap over orders.">
        {c.insufficient ? (
          <ValueState state="insufficient" label="Cost against expected" have={c.n} need={20} what="market orders had a usable expected cost" />
        ) : (
          <dl className="grid gap-x-10 gap-y-5 sm:grid-cols-3">
            <div><dt className="mb-1 text-sm text-ui-graphite">Paid</dt><dd><ValueState state="measured" label="Paid" value={formatSignedBps(c.paidBps)} n={c.n} nLabel="orders" /></dd></div>
            <div><dt className="mb-1 text-sm text-ui-graphite">Expected</dt><dd><ValueState state="measured" label="Expected" value={formatSignedBps(c.expectedBps)} /></dd></div>
            <div>
              <dt className="mb-1 text-sm text-ui-graphite">Difference</dt>
              <dd><ValueState state="measured" label="Difference" value={formatSignedBps(c.excessBps)}
                interval={c.lowBps !== null && c.highBps !== null ? `${Math.round(c.level * 100)}% interval ${formatSignedBps(c.lowBps)} to ${formatSignedBps(c.highBps)}` : undefined} /></dd>
            </div>
          </dl>
        )}
      </Panel>

      <EvidencePanel fingerprint={mock.evidenceKeyFingerprint} />
    </LabShell>
  )
}
