import Link from 'next/link'

/** Index of the design v2 prototype round. The choices and their reasons are in DESIGN.md section 12. */
export default function LabIndex() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="display-md text-ui-ink">Design lab</h1>
      <p className="mt-3 text-ui-graphite">Prototype round of design v2. Development only; this route answers 404 in production.</p>
      <ul className="mt-8 flex flex-col gap-2">
        <li><Link href="/design-lab/hero" className="text-ui-ink">Landing hero</Link></li>
        <li><Link href="/design-lab/dashboard" className="text-ui-ink">Dashboard overview</Link></li>
      </ul>
    </main>
  )
}
