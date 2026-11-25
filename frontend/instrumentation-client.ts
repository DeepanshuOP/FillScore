import { startSentryLazily } from './lib/sentryLazy'

startSentryLazily() // no-op unless NEXT_PUBLIC_SENTRY_DSN is set; Sentry loads after the page is complete and idle (design v5 step 7)
