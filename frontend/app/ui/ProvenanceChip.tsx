import { cn } from '../../lib/utils'

/**
 * Where the data came from, read from the stored `dataSource` (set once, never changed). A demo can never be mistaken
 * for a real account: a dashed outline and the word "demo" against a solid outline and "your exchange data". The two
 * differ in line style and words, and neither means good or bad.
 */
export function ProvenanceChip({ dataSource, className }: { dataSource: 'synthetic-demo' | 'real-user'; className?: string }) {
  const demo = dataSource === 'synthetic-demo'
  return (
    <span data-source={dataSource} title={demo ? 'Prices are real public prints. The trader behaviour is synthetic.' : 'Fills read from your exchange account with a read-only key.'}
      className={cn('inline-flex items-center rounded-ui border px-2 py-0.5 text-xs text-ui-ink', demo ? 'border-dashed border-ui-edge' : 'border-solid border-ui-edge', className)}>
      {demo ? 'Synthetic demo account' : 'Your exchange data'}
    </span>
  )
}
