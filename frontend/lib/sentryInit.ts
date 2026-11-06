import * as Sentry from '@sentry/nextjs'
import { beforeSend } from './sentryScrub'

/** No-op unless NEXT_PUBLIC_SENTRY_DSN is set. Returns whether Sentry was initialised. */
export function initSentry(dsn: string | undefined = process.env.NEXT_PUBLIC_SENTRY_DSN): boolean {
  if (!dsn || !dsn.trim()) return false
  Sentry.init({
    dsn: dsn.trim(),
    ...({ sendDefaultPii: false } as object),
    dataCollection: { userInfo: false },
    tracesSampleRate: 0,
    beforeSend: beforeSend as never,
  })
  return true
}
