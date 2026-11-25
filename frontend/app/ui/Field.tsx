'use client'

import { useId, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

type Common = { label: string; hint?: string; error?: string; className?: string }
type InputProps = Common & { multiline?: false } & Omit<InputHTMLAttributes<HTMLInputElement>, 'className'>
type AreaProps = Common & { multiline: true } & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'>

/**
 * A labelled control. The label is visible and tied to the control; the hint and the error are tied with
 * aria-describedby; an error names the problem and the way out, and sets aria-invalid. The border is --ui-edge
 * (3:1 against both surfaces), because the separator colour is too faint to find a control by.
 */
export function Field(props: InputProps | AreaProps) {
  const generated = useId()
  const { label, hint, error, className, multiline, id: given, ...rest } = props as Common & { multiline?: boolean; id?: string } & Record<string, unknown>
  const id = given ?? generated   // a caller-chosen id (tests and links use them) is the one the label points at
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined
  const control = cn(
    'w-full rounded-[4px] bg-ui-raised px-3 text-[15px] text-ui-ink ring-1 ring-inset placeholder:text-ui-graphite outline-none transition-shadow duration-150 focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] disabled:cursor-not-allowed disabled:opacity-60',
    error ? 'ring-ui-danger' : 'ring-ui-edge',
    multiline ? 'min-h-24 py-2' : 'h-10 pointer-coarse:h-11',
  )
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="text-sm font-medium text-ui-ink">{label}</label>
      {hint ? <p id={`${id}-hint`} className="text-sm text-ui-graphite">{hint}</p> : null}
      {multiline
        ? <textarea id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy} className={control} {...(rest as TextareaHTMLAttributes<HTMLTextAreaElement>)} />
        : <input id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy} className={control} {...(rest as InputHTMLAttributes<HTMLInputElement>)} />}
      {error ? <p id={`${id}-error`} className="text-sm font-medium text-ui-danger">{error}</p> : null}
    </div>
  )
}
