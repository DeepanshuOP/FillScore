/**
 * Loads Sentry after the page is complete and the browser is idle, so its code (about a fifth of the shared first-load JS) is not in
 * every route's first load (design v5 step 7). Without a DSN nothing loads and nothing listens, as before.
 *
 * Until Sentry is ready, uncaught errors and unhandled rejections are queued (the last MAX_QUEUED) and sent with `captureException`
 * right after `initSentry`, so they pass through the same scrubber (`beforeSend`) as any other event. Once Sentry is initialised it
 * installs its own handlers and ours are removed. The only difference from loading it at once: an error in the first seconds is
 * reported a moment later and has no breadcrumbs from before the load.
 */
export const MAX_QUEUED = 20
const IDLE_TIMEOUT_MS = 4000

export function startSentryLazily(dsn: string | undefined = process.env.NEXT_PUBLIC_SENTRY_DSN): boolean {
  const key = dsn?.trim()
  if (!key || typeof window === 'undefined') return false

  const queue: unknown[] = []
  const push = (v: unknown) => { queue.push(v); if (queue.length > MAX_QUEUED) queue.shift() }
  const onError = (e: ErrorEvent) => push(e.error ?? e.message)
  const onRejection = (e: Event) => push((e as PromiseRejectionEvent).reason)
  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onRejection)

  const load = async () => {
    try {
      const { initSentry } = await import('./sentryInit')
      initSentry(key)
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
      const Sentry = await import('@sentry/nextjs')
      for (const v of queue.splice(0)) Sentry.captureException(v)
    } catch {
      // the monitoring script could not load (offline, blocked): the page keeps working; our listeners stay and the queue stays bounded
    }
  }
  const whenIdle = () => {
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(() => { void load() }, { timeout: IDLE_TIMEOUT_MS })
    else setTimeout(() => { void load() }, 1500)
  }
  if (document.readyState === 'complete') whenIdle()
  else window.addEventListener('load', whenIdle, { once: true })
  return true
}
