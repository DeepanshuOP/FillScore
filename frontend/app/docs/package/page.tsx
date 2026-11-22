import type { Metadata } from 'next'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Markdown } from '../markdown'

export const metadata: Metadata = { title: 'Metrics package — FillScore Docs' }

/** From packages/fillscore-metrics/README.md (copied to app/docs/content/package.md; a test fails if the two differ). */
export default function PackageDoc() {
  return <Markdown source={readFileSync(join(process.cwd(), 'app/docs/content/package.md'), 'utf8')} />
}
