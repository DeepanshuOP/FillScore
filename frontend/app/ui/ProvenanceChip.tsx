import { cn } from '../../lib/utils'

/**
 * Where the data came from, read from the stored `dataSource` (set once, never changed). A demo can never be mistaken
 * for a real account: a dashed outline, a hollow dot and the words "synthetic trader, real prices" against a solid
 * outline, a filled dot and "your exchange data". The two differ in line style and words; neither means good or bad.
 */
export function ProvenanceChip({ dataSource, className }: { dataSource: 'synthetic-demo' | 'real-user'; className?: string }) {
  const demo = dataSource === 'synthetic-demo'
  return (
    <span data-source={dataSource} title={demo ? 'Prices are real public prints. The trader behaviour is synthetic.' : 'Fills read from your exchange account with a read-only key.'}
      className={cn('inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-xs font-medium text-ui-ink', demo ? 'border-dashed border-ui-edge' : 'border-solid border-ui-edge', className)}>
      <span aria-hidden="true" className={cn('size-1.5 rounded-full', demo ? 'border-[1.5px] border-ui-graphite' : 'bg-ui-ink')} />
      {demo ? 'Synthetic trader, real prices' : 'Your exchange data'}
    </span>
  )
}
