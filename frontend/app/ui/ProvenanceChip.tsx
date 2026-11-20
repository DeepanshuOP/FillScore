import { cn } from '../../lib/utils'

/**
 * Where the data came from, read from the stored `dataSource` (set once, never changed). A demo can never be mistaken
 * for a real account: a dashed outline and the words "synthetic demo" against a solid outline and "your exchange data".
 * The two differ in line style and words, and neither means good or bad.
 */
export function ProvenanceChip({ dataSource, className }: { dataSource: 'synthetic-demo' | 'real-user'; className?: string }) {
  const demo = dataSource === 'synthetic-demo'
  return (
    <span data-source={dataSource} title={demo ? 'Prices are real public prints. The trader behaviour is synthetic.' : 'Fills read from your exchange account with a read-only key.'}
      className={cn('inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium text-ui-ink', demo ? 'border-dashed border-ui-edge' : 'border-solid border-ui-edge', className)}>
      <span aria-hidden="true" className={cn('size-1.5 rounded-full', demo ? 'border border-ui-graphite' : 'bg-ui-measured')} />
      {demo ? 'Synthetic demo account' : 'Your exchange data'}
    </span>
  )
}
