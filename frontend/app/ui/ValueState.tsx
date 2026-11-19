import { cn } from '../../lib/utils'
import { NOT_COMPUTED } from '../utils/notComputed'

/**
 * The one component that renders a value, or the reason there is none. Three states, three different facts:
 *
 *  measured       a deterministic number from stored measurements. Solid square marker, solid underline, the figure in
 *                 tabular numerals, its sample size beside it. The measured colour is reserved for this state.
 *  insufficient   it could be computed in principle; the sample was too small or market data was missing. Diamond
 *                 marker, dashed underline, the words "insufficient data" and what is missing. No figure, no estimate.
 *  not-computed   the view does not exist for this account's data (for example the v1 views of a rebuilt demo). Dash
 *                 marker, dotted box, the stored phrase "not computed for this data" and one line of why. Never a zero.
 *
 * The state is carried by shape, line style and words; colour only repeats it (a test enforces this).
 */
type Size = 'lg' | 'md' | 'cell' | 'inline'

type Props =
  | { state: 'measured'; label: string; value: string; unit?: string; interval?: string; n?: number; nLabel?: string; size?: Size; className?: string }
  | { state: 'insufficient'; label: string; have?: number; need?: number; what?: string; reason?: string; size?: Size; className?: string }
  | { state: 'not-computed'; label: string; reason?: string; size?: Size; className?: string }

const VALUE_SIZE: Record<Size, string> = { lg: 'text-[1.75rem] leading-9 font-semibold', md: 'text-[1.25rem] leading-7 font-semibold', cell: 'text-sm leading-6', inline: '' }

function Marker({ shape }: { shape: 'square' | 'diamond' | 'dash' }) {
  const base = 'inline-block shrink-0 align-middle'
  if (shape === 'square') return <span aria-hidden="true" data-marker="square" className={cn(base, 'size-2 bg-ui-measured')} />
  if (shape === 'diamond') return <span aria-hidden="true" data-marker="diamond" className={cn(base, 'size-2 rotate-45 border-2 border-ui-insufficient')} />
  return <span aria-hidden="true" data-marker="dash" className={cn(base, 'h-0.5 w-3 bg-ui-graphite')} />
}

export function ValueState(props: Props) {
  const size = props.size ?? 'md'
  const inline = size === 'inline'   // inside a sentence: the figure takes the sentence's type, no note under it
  const cell = size === 'cell' || inline

  if (props.state === 'measured') {
    const spoken = `${props.label}: ${props.value}${props.unit ? ` ${props.unit}` : ''}, measured${props.n != null ? `, ${props.n.toLocaleString('en-US')} ${props.nLabel ?? 'values'}` : ''}`
    return (
      <span role="group" aria-label={spoken} data-state="measured" className={cn('inline-flex gap-1', inline ? 'items-baseline' : 'flex-col align-top', props.className)}>
        <span className="inline-flex items-center gap-2">
          <Marker shape="square" />
          <span data-line="solid" className={cn('border-b-2 border-solid border-ui-measured pb-px tabular-nums text-ui-ink', VALUE_SIZE[size])}>
            {props.value}
            {props.unit ? <span className="ml-1 text-[0.875rem] font-normal text-ui-graphite">{props.unit}</span> : null}
          </span>
        </span>
        {(props.interval || props.n != null) && !cell ? (
          <span className="text-sm text-ui-graphite tabular-nums">
            {props.interval}
            {props.interval && props.n != null ? ', ' : ''}
            {props.n != null ? `${props.n.toLocaleString('en-US')} ${props.nLabel ?? 'values'}` : null}
          </span>
        ) : null}
        {props.n != null && cell ? <span className="sr-only">{`${props.n} ${props.nLabel ?? 'values'}`}</span> : null}
        <span className="sr-only">Measured</span>
      </span>
    )
  }

  if (props.state === 'insufficient') {
    const missing = props.what
      ? `${props.have != null ? `${props.have} ` : ''}${props.what}${props.need != null ? `; at least ${props.need} are needed` : ''}`
      : props.reason
    return (
      <span role="group" aria-label={`${props.label}: insufficient data${missing ? `, ${missing}` : ''}`} data-state="insufficient"
        className={cn('inline-flex flex-col gap-1 align-top', props.className)}>
        <span className="inline-flex items-center gap-2">
          <Marker shape="diamond" />
          <span data-line="dashed" className={cn('border-b-2 border-dashed border-ui-insufficient pb-px text-ui-insufficient-text', cell ? 'text-sm leading-6' : 'text-[1rem] leading-6 font-medium')}>
            insufficient data
          </span>
        </span>
        {missing && !cell ? <span className="max-w-[44ch] text-sm text-ui-graphite">{missing}</span> : null}
      </span>
    )
  }

  return (
    <span role="group" aria-label={`${props.label}: ${NOT_COMPUTED}${props.reason ? `, ${props.reason}` : ''}`} data-state="not-computed"
      className={cn('inline-flex flex-col gap-1 align-top', props.className)}>
      <span data-line="dotted" className={cn('inline-flex items-center gap-2 border border-dotted border-ui-edge px-2 py-0.5 text-ui-graphite', cell ? 'text-sm' : 'text-[1rem] leading-6')}>
        <Marker shape="dash" />
        {NOT_COMPUTED}
      </span>
      {props.reason && !cell ? <span className="max-w-[44ch] text-sm text-ui-graphite">{props.reason}</span> : null}
    </span>
  )
}
