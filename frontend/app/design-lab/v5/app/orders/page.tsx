import { Download } from 'lucide-react'
import { loadAccount, loadPrintWindow } from '../../lib/data'
import { pageValues } from '../../lib/view'
import { OrdersClient, type ReceiptData } from '../../components/OrdersClient'
import { PageHeader, PeriodPicker } from '../../components/PageHeader'

export default async function V5Orders({ searchParams }: { searchParams: Promise<{ userId?: string; order?: string }> }) {
  const sp = await searchParams
  const a = loadAccount(sp.userId)
  const v = pageValues(a)
  // the fixtures' receipts (keyed "<symbol>:<orderId>") with the stored public trades of each order, passed through as points
  const receipts: Record<string, ReceiptData> = {}
  for (const [key, replay] of Object.entries(a.replays)) {
    const id = key.slice(key.indexOf(':') + 1)
    const w = loadPrintWindow(a.id, id)
    const file = w?.files?.[0]
    receipts[id] = {
      replay, arrivalMs: w?.arrivalMs ?? null, quote: replay.order.symbol.replace(/^(BTC|ETH|SOL|BNB)/, ''),
      trades: (w?.prints ?? []).map(([, t, price, qty, maker]) => ({ t, price, qty, side: maker === 0 ? 'buyer' as const : 'seller' as const })),
      fills: replay.fills.map((f) => ({ t: Date.parse(f.time), price: f.price, qty: f.quantity })),
      source: file ? `Binance daily trades file ${file.symbol} ${file.date} (data.binance.vision), SHA-256 ${file.sha256.slice(0, 12)}…` : null,
    }
  }
  return (
    <main id="main">
      <PageHeader title="Orders" description={`Every order, what it cost, and its receipt. ${a.ordersBody.counts.orders} orders, ${a.ordersBody.counts.withFills} with fills.`}
        controls={<PeriodPicker period={v.period} />}
        primary={<button type="button" className="v-btn"><Download size={16} aria-hidden="true" />Export CSV</button>} />
      <div className="pb-10"><OrdersClient orders={a.ledger.orders} receipts={receipts} demo={v.demo} initialOrder={sp.order} /></div>
    </main>
  )
}
