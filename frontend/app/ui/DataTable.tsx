'use client'

import { useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '../../lib/utils'
import { ValueState } from './ValueState'

export interface Column<T> {
  key: string
  header: string
  /** Numbers: right-aligned, tabular figures, header aligned the same way. */
  numeric?: boolean
  /** `low` columns leave the table on a phone and move into the row's details. The first column and `high` stay. */
  priority?: 'high' | 'low'
  /** Compare two rows for sorting; a column with no `sort` is not sortable. A null value sorts last in both directions. */
  sortValue?: (row: T) => number | string | null
  /** The cell. Return null for a value that was not computed: the cell then reads "not computed", never blank or zero. */
  cell: (row: T) => ReactNode | null
}

type Dir = 'asc' | 'desc'

/**
 * Sticky header, right-aligned tabular figures, sortable columns (aria-sort on the header), an optional text filter on
 * the first column, and a phone layout. Sorting, filtering and opening a row's details move the rows with Flip
 * (position and opacity, 0.3 s, ease out; reduced motion: no movement). A cell that returns null is rendered by
 * ValueState as "not computed", so a missing value can never read as a zero.
 */
export function DataTable<T>({ caption, columns, rows, rowId, defaultSort, maxHeight = '28rem', filterLabel }: {
  caption: string
  columns: Column<T>[]
  rows: T[]
  rowId: (row: T) => string
  defaultSort?: { key: string; dir: Dir }
  maxHeight?: string
  filterLabel?: string
}) {
  const [sort, setSort] = useState<{ key: string; dir: Dir } | null>(defaultSort ?? null)
  const [filter, setFilter] = useState('')
  const [open, setOpen] = useState<Set<string>>(new Set())
  const body = useRef<HTMLTableSectionElement>(null)
  const filterId = useId()

  const view = useMemo(() => {
    const first = columns[0]
    const q = filter.trim().toLowerCase()
    let out = q ? rows.filter((r) => String(first.sortValue?.(r) ?? '').toLowerCase().includes(q)) : rows.slice()
    const col = sort ? columns.find((c) => c.key === sort.key) : undefined
    if (col?.sortValue) {
      const get = col.sortValue
      const sign = sort!.dir === 'asc' ? 1 : -1
      out = out.sort((a, b) => {
        const x = get(a); const y = get(b)
        if (x === null && y === null) return 0
        if (x === null) return 1
        if (y === null) return -1
        return (x < y ? -1 : x > y ? 1 : 0) * sign
      })
    }
    return out
  }, [rows, columns, sort, filter])

  // Design v2: GSAP is loaded by the landing page only, so rows no longer Flip; the change applies at once.
  const flip = (change: () => void) => change()
  const low = columns.filter((c) => c.priority === 'low')

  function toggleSort(key: string) {
    flip(() => setSort((s) => (s?.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' })))
  }
  function toggleRow(id: string) {
    flip(() => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n }))
  }

  const cell = (c: Column<T>, r: T) => {
    const v = c.cell(r)
    return v === null ? <ValueState state="not-computed" label={c.header} size="cell" /> : v
  }

  return (
    <div>
      {filterLabel ? (
        <div className="mb-3 flex items-center gap-2">
          <label htmlFor={filterId} className="text-sm text-ui-graphite">{filterLabel}</label>
          <input id={filterId} value={filter} onChange={(e) => flip(() => setFilter(e.target.value))}
            className="h-8 w-44 rounded-[4px] border border-ui-edge bg-ui-raised px-2 text-sm text-ui-ink" />
          <span aria-live="polite" className="text-sm text-ui-graphite tabular-nums">{view.length} of {rows.length} rows</span>
        </div>
      ) : null}
      <div role="region" aria-label={caption} tabIndex={0} style={{ maxHeight }} className="relative overflow-auto border-t border-ui-ink">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {columns.map((c, i) => {
                const active = sort?.key === c.key
                return (
                  <th key={c.key} scope="col" aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : c.sortValue ? 'none' : undefined}
                    className={cn('sticky top-0 z-10 border-b border-ui-ink bg-ui-surface px-3 py-2 font-mono text-[11px] font-normal tracking-[0.06em] text-ui-graphite uppercase',
                      c.numeric ? 'text-right' : 'text-left', c.priority === 'low' && i > 0 && 'hidden md:table-cell')}>
                    {c.sortValue ? (
                      <button type="button" onClick={() => toggleSort(c.key)} className={cn('inline-flex items-center gap-1 uppercase hover:text-ui-ink', c.numeric && 'flex-row-reverse', active && 'text-ui-ink')}>
                        {c.header}
                        {active ? (sort!.dir === 'asc' ? <ArrowUp aria-hidden="true" className="size-3.5" /> : <ArrowDown aria-hidden="true" className="size-3.5" />) : <span aria-hidden="true" className="inline-block size-3.5" />}
                      </button>
                    ) : c.header}
                  </th>
                )
              })}
              {low.length > 0 ? <th scope="col" className="sticky top-0 z-10 w-10 border-b border-ui-ink bg-ui-surface px-2 py-2 md:hidden"><span className="sr-only">Details</span></th> : null}
            </tr>
          </thead>
          <tbody ref={body}>
            {view.map((r) => {
              const id = rowId(r)
              const isOpen = open.has(id)
              return [
                <tr key={id} data-flip data-flip-id={id} className="border-b border-dashed border-ui-rule align-top last:border-b-0 hover:bg-ui-raised">
                  {columns.map((c, i) => (
                    <td key={c.key} className={cn('px-3 py-2 text-ui-ink', c.numeric ? 'text-right font-mono text-[13px] tabular-nums' : 'text-left', c.priority === 'low' && i > 0 && 'hidden md:table-cell')}>{cell(c, r)}</td>
                  ))}
                  {low.length > 0 ? (
                    <td className="px-2 py-1 md:hidden">
                      <button type="button" aria-expanded={isOpen} aria-label={`Details of ${id}`} onClick={() => toggleRow(id)} className="rounded-ui p-1 text-ui-graphite hover:text-ui-ink">
                        {isOpen ? <ChevronUp aria-hidden="true" className="size-4" /> : <ChevronDown aria-hidden="true" className="size-4" />}
                      </button>
                    </td>
                  ) : null}
                </tr>,
                isOpen && low.length > 0 ? (
                  <tr key={`${id}-details`} data-flip data-flip-id={`${id}-details`} className="border-b border-ui-rule md:hidden">
                    <td colSpan={columns.length + 1} className="px-3 pb-3">
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                        {low.map((c) => (
                          <div key={c.key}>
                            <dt className="text-xs text-ui-graphite">{c.header}</dt>
                            <dd className="font-mono text-[13px] tabular-nums text-ui-ink">{cell(c, r)}</dd>
                          </div>
                        ))}
                      </dl>
                    </td>
                  </tr>
                ) : null,
              ]
            })}
          </tbody>
        </table>
        {view.length === 0 ? <p className="px-3 py-6 text-sm text-ui-graphite">No row matches this filter.</p> : null}
      </div>
    </div>
  )
}
