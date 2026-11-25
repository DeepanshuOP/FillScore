import { count } from '../lib/format'

/**
 * Settings > Usage: the AI review allowance, worded from what `GET /ml/agents/council/budget` serves. Wording only: the service
 * counts (a full review is 9 units, a short one 1) and this file never adds, divides or estimates. A limit that is off arrives as
 * `null` and prints no figure. An answer that is not the expected shape is "insufficient data", never a zero.
 */
interface Block { unitsLeft: number; deepLeft: number; quickLeft: number }

const isBlock = (v: unknown): v is Block => {
  const b = v as Record<string, unknown> | null
  return !!b && typeof b === 'object' && ['unitsLeft', 'deepLeft', 'quickLeft'].every((k) => typeof b[k] === 'number' && Number.isFinite(b[k] as number))
}

export function allowanceLines(status: number | null, body: unknown): string[] {
  if (status === null) return []
  const unreadable = ['Insufficient data: the allowance could not be read.']
  const b = body as { account?: unknown; day?: unknown; demo?: unknown } | null
  if (status !== 200 || !b || typeof b !== 'object' || !('account' in b) || !('day' in b)) return unreadable
  if (b.account !== null && !isBlock(b.account)) return unreadable
  if (b.day !== null && !isBlock(b.day)) return unreadable
  if (b.demo === true) return ['Demo accounts run no review on request.']
  const words = (x: Block) => `${count(x.deepLeft, 'full review')} or ${count(x.quickLeft, 'short review')}`
  const lines: string[] = []
  if (b.account) lines.push(`This account can start ${words(b.account as Block)} now.`)
  if (b.day) lines.push(`The daily allowance for all accounts has room for ${words(b.day as Block)}.`)
  return lines.length ? lines : ['No review limit is set for this account or for the day.']
}
