import Link from 'next/link'

/** IA v4 prototype index (fifth order of 2026-11-22). Development only; 404 in production. Proposal: docs/design/IA-v4/. */
export default function Ia4Index() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="display-md text-ui-ink">IA v4 prototype</h1>
      <p className="mt-3 text-ui-graphite">A marketing site and an app with a sidebar. Figures from committed fixtures; Ask answers recorded from the real agent.</p>
      <ul className="mt-8 flex flex-col gap-2">
        <li><Link href="/design-lab/ia4/site" className="text-ui-ink">Marketing site: header, first two viewports, footer</Link></li>
        <li><Link href="/design-lab/ia4/app" className="text-ui-ink">App home: Ask FillScore and the key figures</Link></li>
      </ul>
    </main>
  )
}
