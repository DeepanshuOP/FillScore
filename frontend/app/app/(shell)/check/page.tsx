import type { Metadata } from 'next'
import CheckFile from '@/app/check/CheckFile'

export const metadata: Metadata = { title: 'Check an exchange export' }

/** Reading `searchParams` makes the page render per request, so the demo banner that depends on `?userId=` is in the server's HTML
 *  and does not push the page down when the browser adds it (layout shift found in the design v5 audit, step 8). */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await searchParams
  return <CheckFile />
}
