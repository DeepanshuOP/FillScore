import type { Metadata } from 'next'
import TradesLedger from '@/app/trades/TradesLedger'

export const metadata: Metadata = { title: 'Fills' }

/** Fills (design v5): one page. The Patterns tab is gone (not-computed policy, PROPOSAL §4 row 3); its old address opens this page. */
export default function Page() {
  return <TradesLedger />
}
