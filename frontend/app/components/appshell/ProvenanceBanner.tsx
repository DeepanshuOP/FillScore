import { cn } from '../../../lib/utils'

/**
 * The provenance banner (design v5, PROPOSAL §3.6; invariant I5): a full-width 14 px line at the top of every app page that does
 * not show the user's own exchange data. A demo reads "Demo account · synthetic trader, real Binance prices · read-only"; a page
 * with no stored data source (the exchange-export check) says where its figures come from. Anything that is not stated to be the
 * user's own data is shown as such: an unknown source never hides the banner and never reads as "your data".
 * `real-user` data shows no banner (its source is the small "Your exchange data" label in the page header).
 */
export function ProvenanceBanner({ dataSource, sourceText, className }: { dataSource: 'synthetic-demo' | 'real-user' | null; sourceText: string | null; className?: string }) {
  if (dataSource === 'real-user') return null
  const demo = dataSource === 'synthetic-demo'
  if (!demo && !sourceText) return null
  return (
    <div data-testid="provenance-banner" data-source={demo ? 'synthetic-demo' : 'file'}
      className={cn('border-b border-ui-banner-border bg-ui-banner px-[var(--ui-gutter)] py-2 text-[14px] leading-snug text-ui-banner-text', className)}>
      {demo ? (<><strong className="font-semibold">Demo account</strong> · synthetic trader, real Binance prices · read-only</>) : sourceText}
    </div>
  )
}
