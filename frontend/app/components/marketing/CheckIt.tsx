'use client'

import Link from 'next/link'
import * as m from 'motion/react-m'
import { FileCheck2, Package, BookOpen, ShieldCheck } from 'lucide-react'
import { EVIDENCE_KEY_FINGERPRINT } from '../../lib/evidenceKey'
import replay from '../../design-lab/fixtures/landing-order.replay.json'

/**
 * "Check it yourself": a manifest of SHA-256 hashes that folds into one Ed25519 signature. The two rows are the real
 * sources of the order drawn in the hero (its public trades file and the expected-cost calibration), and the
 * fingerprint is the real signing key's (EVIDENCE_KEY_FINGERPRINT). Motion plays once when the block scrolls into view.
 */
const ROWS = [
  { label: replay.sources[0].label, hash: replay.sources[0].sha256 },
  { label: `Expected-cost calibration ${replay.expectedCost.source.version}`, hash: replay.expectedCost.source.calibrationSha256 },
]
const ease = [0.22, 1, 0.36, 1] as const

export function CheckIt() {
  return (
    <section aria-labelledby="check-title" className="border-y border-ui-rule bg-[color-mix(in_srgb,var(--ui-surface),var(--ui-raised)_55%)]">
      <div className="mx-auto grid max-w-[1240px] gap-14 px-5 py-24 sm:px-8 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:py-32">
        <div>
          <h2 id="check-title" data-split className="display-lg text-ui-ink">Check it yourself.</h2>
          <p className="mt-4 max-w-[52ch] text-[17px] leading-7 text-ui-graphite">
            An evidence pack lists every file behind an audit with its SHA-256 and signs the list with Ed25519. Anyone can check a pack in the browser; the file never leaves it.
          </p>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {[
              { href: '/verify', icon: FileCheck2, title: 'Verify a pack', text: 'Drop a pack in, see each hash and the signature checked.' },
              { href: '/methodology', icon: BookOpen, title: 'Read the method', text: 'Generated from the same registry the code runs.' },
              { href: 'https://github.com/DeepanshuOP/FillScore/tree/main/packages/fillscore-metrics', icon: Package, title: 'fillscore-metrics', text: 'The open measurement package.' },
              { href: '/check', icon: ShieldCheck, title: 'Check a broker file', text: 'Fill prices against the public mid of that second.' },
            ].map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="group flex h-full gap-3 rounded-[12px] p-3 no-underline transition-colors hover:bg-ui-overlay/70">
                  <l.icon aria-hidden="true" strokeWidth={1.75} className="mt-0.5 size-4 shrink-0 text-ui-graphite group-hover:text-ui-ink" />
                  <span><span className="block text-sm font-medium text-ui-ink">{l.title}</span><span className="block text-[13px] leading-5 text-ui-graphite">{l.text}</span></span>
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="panel p-5 sm:p-6" aria-label="A manifest of file hashes and its signature">
          <p className="text-[13px] text-ui-graphite">manifest.json, the sources of the order above</p>
          <ul className="mt-3 flex flex-col gap-2">
            {ROWS.map((r, i) => (
              <m.li key={r.hash} initial={{ opacity: 0, x: -12 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: '-15%' }}
                transition={{ duration: 0.6, delay: 0.15 * i, ease }}
                className="rounded-[10px] bg-ui-overlay/70 px-3.5 py-3 ring-1 ring-inset ring-ui-rule">
                <p className="text-[13px] text-ui-ink">{r.label}</p>
                <code className="mt-1 block font-ui-mono text-[11.5px] leading-4 break-all text-ui-graphite">sha256 {r.hash}</code>
              </m.li>
            ))}
          </ul>
          <svg viewBox="0 0 400 56" className="my-1 h-14 w-full" aria-hidden="true">
            {[120, 280].map((x0, i) => (
              <m.path key={x0} d={`M${x0} 0 C ${x0} 30, 200 26, 200 56`} fill="none" stroke="var(--ui-measured)" strokeWidth={1.5}
                initial={{ pathLength: 0, opacity: 0.4 }} whileInView={{ pathLength: 1, opacity: 1 }} viewport={{ once: true, margin: '-15%' }}
                transition={{ duration: 0.8, delay: 0.45 + i * 0.1, ease }} />
            ))}
          </svg>
          <m.div initial={{ opacity: 0, scale: 0.97 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true, margin: '-15%' }} transition={{ duration: 0.6, delay: 1.1, ease }}
            className="flex items-center justify-between gap-4 rounded-[12px] px-4 py-3.5 ring-1 ring-inset ring-[color-mix(in_srgb,var(--ui-measured)_45%,transparent)] bg-[color-mix(in_srgb,var(--ui-measured)_8%,transparent)]">
            <div>
              <p className="text-[13px] font-medium text-ui-ink">Signed with Ed25519</p>
              <p className="text-[12px] text-ui-graphite">Key fingerprint</p>
            </div>
            <code className="font-ui-mono text-[15px] text-ui-measured">{EVIDENCE_KEY_FINGERPRINT}</code>
          </m.div>
        </div>
      </div>
    </section>
  )
}
