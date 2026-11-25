import { Suspense } from 'react'
import type { Metadata } from 'next'
import SettingsPage from '@/app/settings/SettingsPage'
import methodology from '@/app/methodology/methodology.json'

export const metadata: Metadata = { title: 'Settings' }
/** The score and measure versions left the sidebar (design v5); Settings > About prints them. Read here on the server, so the JSON is not sent to the browser.
 *  The page reads `?section=`, so it sits in a Suspense boundary. */
export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-ui-surface" />}>
      <SettingsPage versions={{ scoring: methodology.scoring.version, measure: methodology.measureVersion }} />
    </Suspense>
  )
}
