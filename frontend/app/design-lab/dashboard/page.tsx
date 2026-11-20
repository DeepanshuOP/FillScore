import fx from '../../../e2e-shots/fixtures/demo-moderate.json'
import { Overview } from '../../dashboard/Overview'
import { describeHeadline, gradeView, scopeFacts } from '../../dashboard/headline'
import type { CostVsExpected } from '../../dashboard/scoreV2'

/**
 * The chosen overview composition (variant A "bento") over the screenshot fixture (production summariseOrders output
 * over the offline demo-moderate build; no database). Variant B "strip" lost and was deleted (DESIGN.md section 12).
 */
export default function DashboardLab() {
  const v2 = fx.v2Body as unknown as { costVsExpected?: CostVsExpected }
  return (
    <main className="mx-auto max-w-[1320px] px-8 py-10">
      <Overview
        grade={gradeView(200, fx.v2Body)}
        headline={describeHeadline(fx.ordersBody, true)}
        costVs={v2.costVsExpected}
        ordersBody={fx.ordersBody}
        isDemo
        facts={scopeFacts({ totalTrades: 0, totalNotional: 0, breakdown: { makerRatio: 0 }, period: { start: '2024-01-01', end: '2024-01-31' }, exchange: 'binance' }, fx.current)}
        v1={fx.v1}
        v1Note={null}
      />
    </main>
  )
}
