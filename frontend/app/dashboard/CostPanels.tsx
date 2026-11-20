'use client';
import React from 'react';
import { BarList, ChartFrame } from '../ui/ChartFrame';
import { Disclosure } from '../ui/Disclosure';
import { Panel } from '../ui/Panel';
import { StatBlock } from '../ui/StatBlock';
import { ValueState } from '../ui/ValueState';
import { formatSignedBps } from '../ui/format';
import { barRows } from './headline';
import type { CostVsExpected } from './scoreV2';

/** Where the money went: the terms of the cost in dollars, as bars with the same numbers in a table. */
export function WhereMoneyWent({ ordersBody, isDemo }: { ordersBody: unknown; isDemo: boolean }) {
  const bars = barRows(ordersBody, isDemo);
  if (!bars) {
    return (
      <Panel id="where-money-went" title="Where the money went">
        <ValueState state="not-computed" label="Cost by term" reason="The orders were not measured, so there is no cost by term." />
      </Panel>
    );
  }
  return (
    <ChartFrame
      title={bars.title}
      summary={bars.summary}
      chart={<BarList rows={bars.rows} />}
      table={
        <table className="w-full max-w-lg text-sm">
          <caption className="sr-only">Total cost by term, in US dollars</caption>
          <thead>
            <tr>
              <th scope="col" className="border-b border-ui-edge py-2 text-left font-medium text-ui-graphite">Term</th>
              <th scope="col" className="border-b border-ui-edge py-2 text-right font-medium text-ui-graphite">Total</th>
            </tr>
          </thead>
          <tbody>
            {bars.table.map((r) => (
              <tr key={r.label} className="border-b border-ui-rule">
                <th scope="row" className={r.label === 'Total' ? 'py-2 text-left font-semibold text-ui-ink' : 'py-2 text-left font-normal text-ui-ink'}>
                  {r.label}{r.note ? `, ${r.note}` : ''}
                </th>
                <td className={r.label === 'Total' ? 'py-2 text-right font-semibold tabular-nums text-ui-ink' : 'py-2 text-right tabular-nums text-ui-ink'}>{r.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
      source="Each term is its basis points times the intended value of the order, summed over the orders. The fee term of a demo account is not independently measured."
    />
  );
}

const EXCLUDED_WORDS: Array<[string, string]> = [
  ['outsideModel', "outside the model's range"], ['partlyFilled', 'partly filled'], ['noExpectedCost', 'with no usable expected cost'],
];

/** Cost against what was expected: the numbers and the method. The headline holds one sentence; the detail lives here. */
export function CostAgainstExpected({ c }: { c: CostVsExpected | undefined }) {
  const left = c && !c.insufficient && c.excluded
    ? EXCLUDED_WORDS.filter(([k]) => (c.excluded![k] ?? 0) > 0).map(([k, w]) => `${c.excluded![k]} ${w}`)
    : [];
  return (
    <Panel id="cost-vs-expected" title="Cost against what was expected" description="The market orders only. The interval comes from a bootstrap over orders.">
      {!c ? (
        <ValueState state="insufficient" label="Cost against expected" reason="no market context was stored for these orders" />
      ) : c.insufficient ? (
        <ValueState state="insufficient" label="Cost against expected" reason={c.reason} />
      ) : (
        <div className="flex flex-col gap-6">
          <dl className="grid gap-x-10 gap-y-5 sm:grid-cols-3">
            <StatBlock label="Paid"><ValueState state="measured" label="Paid" value={formatSignedBps(c.paidBps)} n={c.n} nLabel="orders" /></StatBlock>
            <StatBlock label="Expected"><ValueState state="measured" label="Expected" value={formatSignedBps(c.expectedBps)} /></StatBlock>
            <StatBlock label="Difference">
              <ValueState state="measured" label="Difference" value={formatSignedBps(c.excessBps)}
                interval={c.lowBps !== null && c.highBps !== null ? `${Math.round(c.level * 100)}% interval ${formatSignedBps(c.lowBps)} to ${formatSignedBps(c.highBps)}` : undefined} />
            </StatBlock>
          </dl>
          {left.length > 0 ? <p className="text-sm text-ui-graphite">Left out of this comparison: {left.join(', ')}.</p> : null}
          <Disclosure summary="How the expected cost was computed">
            <div className="flex max-w-[68ch] flex-col gap-2 text-sm text-ui-graphite">
              <p>The expected cost is a fitted model, not an observed cost: the modelled cost of a taker event of the same size in the hour before the order, fitted on public data of January 2024 (version {c.version}).</p>
              <p>The interval is a bootstrap over the account&apos;s orders. It leaves out the model&apos;s own error, which is wider.</p>
            </div>
          </Disclosure>
        </div>
      )}
    </Panel>
  );
}
