import type { Metadata } from 'next'
import { Suspense } from 'react'
import TradesLedger from '@/app/trades/TradesLedger'
import Patterns from '@/app/analytics/Patterns'
import { FillsTabs } from './FillsTabs'

export const metadata: Metadata = { title: 'Fills' }

/** Fills (IA v4): today's Trades and Analytics as two tabs, Ledger and Patterns. */
export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams
  const active = tab === 'patterns' ? 'patterns' : 'ledger'
  return (
    <>
      <Suspense fallback={<div className="mb-6 h-11 border-b border-ui-rule" aria-hidden="true" />}><FillsTabs active={active} /></Suspense>
      {active === 'patterns' ? <Patterns /> : <TradesLedger />}
    </>
  )
}
