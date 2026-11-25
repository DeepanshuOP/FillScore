// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { initSentry, captureException } = vi.hoisted(() => ({ initSentry: vi.fn(() => true), captureException: vi.fn() }))
vi.mock('./sentryInit', () => ({ initSentry }))
vi.mock('@sentry/nextjs', () => ({ captureException }))

import { MAX_QUEUED, startSentryLazily } from './sentryLazy'

// Design v5 step 7: Sentry (about a fifth of the shared first-load JS) loads after the page is complete and idle, instead of in
// every route's first load. Errors that happen before it loads are queued (the last MAX_QUEUED) and sent after init, through the same
// scrubber (`beforeSend`) as any other event. Without a DSN nothing loads and nothing listens.
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve() }

describe('startSentryLazily', () => {
  // the test dispatches errors on purpose; this listener keeps the runner from reporting them as unhandled
  const swallow = (e: ErrorEvent) => e.preventDefault()
  beforeEach(() => { vi.useFakeTimers(); initSentry.mockClear(); captureException.mockClear(); window.addEventListener('error', swallow) })
  afterEach(() => { vi.useRealTimers(); window.removeEventListener('error', swallow) })

  it('does nothing without a DSN: no listener, no load', () => {
    const add = vi.spyOn(window, 'addEventListener')
    expect(startSentryLazily(undefined)).toBe(false)
    expect(startSentryLazily('   ')).toBe(false)
    expect(add).not.toHaveBeenCalledWith('error', expect.anything())
    expect(initSentry).not.toHaveBeenCalled()
    add.mockRestore()
  })

  it('loads after the page is complete and idle, not before', async () => {
    Object.defineProperty(document, 'readyState', { value: 'loading', configurable: true })
    expect(startSentryLazily('https://k@example.invalid/1')).toBe(true)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(initSentry).not.toHaveBeenCalled()                      // the page has not finished loading
    window.dispatchEvent(new Event('load'))
    await vi.advanceTimersByTimeAsync(5_000)                       // idle callback or its timeout
    await flush()
    expect(initSentry).toHaveBeenCalledTimes(1)
    expect(initSentry).toHaveBeenCalledWith('https://k@example.invalid/1')
  })

  it('sends errors that happened before the load, once, after init', async () => {
    Object.defineProperty(document, 'readyState', { value: 'complete', configurable: true })
    startSentryLazily('https://k@example.invalid/1')
    const boom = new Error('early')
    window.dispatchEvent(new ErrorEvent('error', { error: boom, message: 'early' }))
    window.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: 'rejected early' }))
    await vi.advanceTimersByTimeAsync(5_000)
    await flush()
    expect(captureException).toHaveBeenCalledTimes(2)
    expect(captureException).toHaveBeenNthCalledWith(1, boom)
    expect(captureException).toHaveBeenNthCalledWith(2, 'rejected early')
    // after init Sentry's own handlers are in charge: ours are removed, so a later error is not sent twice by this module
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('late'), message: 'late' }))
    await flush()
    expect(captureException).toHaveBeenCalledTimes(2)
  })

  it('keeps only the last MAX_QUEUED early errors, so a storm cannot grow memory', async () => {
    Object.defineProperty(document, 'readyState', { value: 'complete', configurable: true })
    startSentryLazily('https://k@example.invalid/1')
    for (let i = 0; i < MAX_QUEUED + 7; i++) window.dispatchEvent(new ErrorEvent('error', { error: new Error(`e${i}`), message: `e${i}` }))
    await vi.advanceTimersByTimeAsync(5_000)
    await flush()
    expect(captureException).toHaveBeenCalledTimes(MAX_QUEUED)
    expect((captureException.mock.calls[0][0] as Error).message).toBe('e7')    // the first 7 were dropped; hand value: (MAX_QUEUED + 7) - MAX_QUEUED
  })
})
