import Link from 'next/link'

/** Index of the design lab (development only; this route answers 404 in production). The v2 round was deleted when
 *  design v3 "Tape & Receipt" was built into production (2026-11-20); the v3 prototypes stay for reference. */
export default function LabIndex() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="display-md text-ui-ink">Design lab</h1>
      <p className="mt-3 text-ui-graphite">Prototypes of design v3. Development only.</p>
      <ul className="mt-8 flex flex-col gap-2">
        <li><Link href="/design-lab/v3" className="text-ui-ink">Design v3: Tape &amp; Receipt and Grid &amp; Highlighter</Link></li>
      </ul>
    </main>
  )
}
