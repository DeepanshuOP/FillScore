import { describe, expect, it } from 'vitest'
import { allowanceLines } from './usageView'
import { findAdviceTerms } from '../../../backend/src/constants/adviceTerms'

// Hand values: a Deep review costs 9 units and a Quick one 1 (ml-service/config/budget.py). The service sends the counts; the page
// only words them and never adds or divides.
//   unitsLeft 5  -> deepLeft 0 (5 // 9), quickLeft 5      -> "0 full reviews or 5 short reviews"
//   unitsLeft 18 -> deepLeft 2 (18 // 9), quickLeft 18
//   unitsLeft 9  -> deepLeft 1, quickLeft 9                -> singular "1 full review"
const block = (unitsLeft: number, deepLeft: number, quickLeft: number) => ({ unitsLeft, deepLeft, quickLeft })

describe('allowanceLines', () => {
  it('words the served counts for the account and for the day', () => {
    expect(allowanceLines(200, { account: block(5, 0, 5), day: block(18, 2, 18), units: { deep: 9, quick: 1 } })).toEqual([
      'This account can start 0 full reviews or 5 short reviews now.',
      'The daily allowance for all accounts has room for 2 full reviews or 18 short reviews.',
    ])
  })

  it('uses the singular for one', () => {
    expect(allowanceLines(200, { account: block(9, 1, 9), day: null })).toEqual([
      'This account can start 1 full review or 9 short reviews now.',
    ])
  })

  it('says a limit that is off is not set, and prints no figure for it', () => {
    expect(allowanceLines(200, { account: null, day: null })).toEqual(['No review limit is set for this account or for the day.'])
  })

  it('says a demo account runs no review on request', () => {
    expect(allowanceLines(200, { account: block(900, 100, 900), day: null, demo: true })).toEqual(['Demo accounts run no review on request.'])
  })

  it('says insufficient data when the service did not answer or answered with something else', () => {
    const none = ['Insufficient data: the allowance could not be read.']
    expect(allowanceLines(503, null)).toEqual(none)
    expect(allowanceLines(200, { account: { unitsLeft: 'x' } })).toEqual(none)
    expect(allowanceLines(200, null)).toEqual(none)
    expect(allowanceLines(null, null)).toEqual([])
  })

  it('passes the advice check', () => {
    const text = allowanceLines(200, { account: block(5, 0, 5), day: block(18, 2, 18) }).join(' ')
    expect(findAdviceTerms(text)).toEqual([])
  })
})
