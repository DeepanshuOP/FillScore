import type { Metadata } from 'next'
import TradesLedger from '../../trades/TradesLedger'
import Patterns from '../../analytics/Patterns'

export const metadata: Metadata = { title: 'Fills' }

// Interim (IA v4 step 1): the two old pages, chosen by ?tab=; step 4 merges them under tabs Ledger | Patterns.
export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams
  return tab === 'patterns' ? <Patterns /> : <TradesLedger />
}
