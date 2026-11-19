'use client'

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '../../lib/utils'

export interface TabItem { id: string; label: string; content: ReactNode }

/**
 * Tabs with the keyboard pattern of the WAI-ARIA tabs practice: roving tabindex, arrow keys, Home and End move and
 * select. The selected tab is marked by a 2 px ink underline and weight (ink, not the measured colour, which belongs
 * to measured values). Only the selected panel is rendered visible.
 */
export function Tabs({ tabs, label, initial }: { tabs: TabItem[]; label: string; initial?: string }) {
  const [current, setCurrent] = useState(initial ?? tabs[0].id)
  const base = useId()
  const refs = useRef<Array<HTMLButtonElement | null>>([])

  function onKey(e: KeyboardEvent, i: number) {
    const last = tabs.length - 1
    const next = e.key === 'ArrowRight' ? (i + 1) % tabs.length : e.key === 'ArrowLeft' ? (i - 1 + tabs.length) % tabs.length : e.key === 'Home' ? 0 : e.key === 'End' ? last : null
    if (next === null) return
    e.preventDefault()
    setCurrent(tabs[next].id)
    refs.current[next]?.focus()
  }

  return (
    <div>
      <div role="tablist" aria-label={label} className="flex gap-6 border-b border-ui-rule">
        {tabs.map((t, i) => {
          const on = t.id === current
          return (
            <button key={t.id} ref={(el) => { refs.current[i] = el }} role="tab" type="button" id={`${base}-tab-${t.id}`} aria-selected={on}
              aria-controls={`${base}-panel-${t.id}`} tabIndex={on ? 0 : -1} onClick={() => setCurrent(t.id)} onKeyDown={(e) => onKey(e, i)}
              className={cn('-mb-px border-b-2 px-0 py-3 text-sm', on ? 'border-ui-ink font-semibold text-ui-ink' : 'border-transparent text-ui-graphite hover:text-ui-ink')}>
              {t.label}
            </button>
          )
        })}
      </div>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" id={`${base}-panel-${t.id}`} aria-labelledby={`${base}-tab-${t.id}`} hidden={t.id !== current} tabIndex={0} className="pt-5">
          {t.id === current ? t.content : null}
        </div>
      ))}
    </div>
  )
}
