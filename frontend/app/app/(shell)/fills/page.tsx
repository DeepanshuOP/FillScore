import type { Metadata } from 'next'
import TradesLedger from '@/app/trades/TradesLedger'

export const metadata: Metadata = { title: 'Fills' }

/** Fills (design v5): one page. The Patterns tab is gone (not-computed policy, PROPOSAL §4 row 3); its old address opens this page.
 *  Reading `searchParams` makes the page render per request, so the demo banner is in the server's HTML (no layout shift, step 8). */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await searchParams
  return <TradesLedger />
}
