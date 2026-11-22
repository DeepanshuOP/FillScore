import type { Metadata } from 'next'
import Link from 'next/link'
import { DOCS } from './docsList'

export const metadata: Metadata = { title: 'Docs — FillScore', description: 'The documents of FillScore: the MCP client, the metrics package and the methodology.' }

export default function DocsHub() {
  return (
    <>
      <h1 className="display-md text-ui-ink">Docs</h1>
      <p className="mt-3 max-w-[60ch] text-[16px] text-ui-graphite">What you can read, run and check yourself. FillScore audits past execution; none of these documents predicts or advises.</p>
      <ul className="mt-10 flex flex-col">
        {DOCS.map((d) => (
          <li key={d.href} className="border-t border-ui-rule py-5 last:border-b">
            <Link href={d.href} className="block no-underline">
              <span className="block text-[20px] font-bold tracking-[-0.015em] text-ui-ink">{d.title}</span>
              <span className="mt-1 block text-[15px] text-ui-graphite">{d.line}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}
