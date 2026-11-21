'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { EVIDENCE_KEY_FINGERPRINT } from '../../lib/evidenceKey'
import { MarginNote } from '../../ui/MarginNote'
import replay from '../../lib/landing/fixtures/landing-order.replay.json'

/**
 * "Check it yourself" (design v3): an envelope that opens to a manifest of SHA-256 hashes; its lines tick one by one,
 * then the signature stamps. The two lines are the real sources of the order in the hero (its public trades file and
 * the expected-cost calibration) and the fingerprint is the real signing key's. The motion is CSS, plays once when the
 * envelope scrolls into view, and is off with reduced motion; without script the finished state shows.
 */
const ROWS = [
  { label: replay.sources[0].label, hash: replay.sources[0].sha256 },
  { label: `Expected-cost calibration ${replay.expectedCost.source.version}`, hash: replay.expectedCost.source.calibrationSha256 },
]
const LINKS = [
  { href: '/verify', title: 'Verify a pack', text: 'Drop a pack in; each hash and the signature are checked in the browser.' },
  { href: 'https://github.com/DeepanshuOP/FillScore/tree/main/packages/fillscore-metrics', title: 'fillscore-metrics', text: 'The open measurement package.' },
]

export function CheckIt() {
  const ref = useRef<HTMLDivElement>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect() } }, { threshold: 0.5 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <section aria-labelledby="check-title" className="border-y border-ui-ink px-[var(--ui-gutter)] py-24 lg:pt-20 lg:pb-36">
      <div className="grid gap-16 lg:grid-cols-[1fr_1.1fr] lg:items-center">
        <div>
          <h2 id="check-title" data-split className="display-lg text-ui-ink">Check it yourself.</h2>
          <p className="mt-4 max-w-[52ch] text-[17px] leading-7 text-ui-graphite">
            Real audits can ship signed.
            <MarginNote label="the evidence pack">
              <p>An evidence pack lists every file behind an audit with its SHA-256 and signs the list with Ed25519. Anyone can check a pack in the browser; the file never leaves it.</p>
              <p>Demo audits have no pack: nothing of a synthetic trader is signed. The sample beside lists the real sources of the order above.</p>
              <p>The signature covers the list, not each file: each file is checked against its hash.</p>
            </MarginNote>
          </p>
          <ul className="mt-8 border-t border-ui-ink">
            {LINKS.map((l) => (
              <li key={l.href} className="border-b border-dashed border-ui-rule">
                <Link href={l.href} className="group flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3 no-underline">
                  <span className="text-[17px] font-bold text-ui-ink underline decoration-ui-edge underline-offset-[0.25em] group-hover:decoration-ui-ink">{l.title}</span>
                  <span className="sr-only">{l.text}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div ref={ref} className="fs-envelope" data-open={seen} aria-label="A manifest of file hashes and its signature">
          <div className="fs-env-sheet">
            <p className="font-mono text-[11px] tracking-[0.06em] text-ui-graphite uppercase">sample manifest.json</p>
            <ul className="mt-3 border-t border-dashed border-ui-ink font-mono text-[12px]">
              {ROWS.map((r, i) => (
                <li key={r.hash} className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-2 border-b border-dashed border-ui-rule py-2.5">
                  <span className="fs-tick" data-ok="true" data-in={seen} style={{ animationDelay: `${400 + i * 350}ms` }}>OK</span>
                  <span className="min-w-0">
                    <span className="block text-ui-ink">{r.label}</span>
                    <span className="block break-all text-[11px] leading-4 text-ui-graphite">sha256 {r.hash}</span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
              <p className="font-mono text-[12px] text-ui-graphite">ED25519<br /><span className="text-[15px] text-ui-ink">KEY {EVIDENCE_KEY_FINGERPRINT}</span></p>
              <span className="fs-word-stamp" data-in={seen} style={{ animationDelay: '1200ms' }}>SIGNED</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
