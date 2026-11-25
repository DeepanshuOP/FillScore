'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Banner } from '../ui/Banner'
import { Button } from '../ui/Button'
import { buttonClass } from '../ui/buttonClass'
import { Card } from '../ui/blocks'
import { useToast } from '../ui/Toast'
import { browserPackDeps, downloadEvidencePack, type PackKind, type PackPhase, type PackResult } from '../lib/evidencePack'

import { EVIDENCE_KEY_FINGERPRINT } from '../lib/evidenceKey'
export { EVIDENCE_KEY_FINGERPRINT }

type Auth = { accessToken: string | null; refreshAccessToken: () => Promise<string | null> }
type State = { kind: PackKind; phase: PackPhase } | null

const REPORTS: Array<{ kind: PackKind; title: string; text: string; variant: 'primary' | 'secondary' }> = [
  { kind: 'scorecard', title: 'Scorecard report', variant: 'primary',
    text: 'The score, its components and the integrity hash, with the manifest that lists every file and its SHA-256.' },
  { kind: 'best-execution', title: 'Best-execution report', variant: 'secondary',
    text: 'Order outcomes and costs in a form that supports your documentation of best execution. It does not state that you comply with any rule.' },
]

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} kB`

/**
 * Reports (design v5, PROPOSAL §5; was Evidence): the two signed reports as a list, each with its words, a Download button and a
 * Verify link. A signed-in account downloads them (fetched with the access token, saved as a file, a plain message for each failure).
 * A demo account is read-only and synthetic: the card is one line that says there is nothing of the reader's to sign (no stamp).
 */
export function EvidencePanel({ mode, auth }: { mode: 'demo' | 'real' | null; auth: Auth }) {
  const toast = useToast()
  const [busy, setBusy] = useState<State>(null)
  const [done, setDone] = useState<Partial<Record<PackKind, string>>>({})
  const [failed, setFailed] = useState<Extract<PackResult, { ok: false }> | null>(null)

  async function get(kind: PackKind) {
    if (busy) return
    setFailed(null)
    setBusy({ kind, phase: 'preparing' })
    const base = await downloadEvidencePack(kind, auth, { ...browserPackDeps(), onPhase: (phase) => setBusy({ kind, phase }) })
    setBusy(null)
    if (base.ok) {
      setDone((d) => ({ ...d, [kind]: `Downloaded ${base.fileName} (${kb(base.bytes)}).` }))
      toast.show({ title: 'Report downloaded', detail: `${base.fileName}, ${kb(base.bytes)}. Check it at /verify.` })
    } else {
      setFailed(base)
    }
  }

  if (mode === null) return null
  const demo = mode === 'demo'
  const source = (
    <>Signed with Ed25519, key fingerprint <code className="font-mono text-[12px] text-ui-ink">{EVIDENCE_KEY_FINGERPRINT}</code>. A report is checked in your browser; the file never leaves it.</>
  )

  return (
    <Card title="Signed reports" sentence="Signed reports you can verify without us." id="reports" testid="reports-card"
      info="Signed files that record how these orders were measured, for your own documentation." source={source}>
      {demo ? (
        <p className="text-[14px] text-ui-ink" data-testid="reports-demo">
          Demo accounts have no signed report: they are read-only and synthetic, so there is nothing of yours to sign. A signed-in account with synced orders gets both reports.{' '}
          <Link href="/verify" className="text-ui-ink underline underline-offset-4">Check a signed report</Link>
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-ui-rule" data-testid="reports-list">
          {REPORTS.map((p) => {
            const mine = busy?.kind === p.kind
            return (
              <li key={p.kind} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-[16px] font-semibold text-ui-ink">{p.title}</p>
                  <p className="mt-0.5 max-w-[60ch] text-[14px] leading-snug text-ui-graphite">{p.text}</p>
                  <p role="status" className="mt-1 min-h-5 text-[13px] text-ui-ink">
                    {mine ? (busy!.phase === 'preparing' ? 'Preparing the report.' : 'Writing the file.') : done[p.kind] ?? ''}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button variant={p.variant} loading={mine} disabled={!!busy && !mine} onClick={() => get(p.kind)}>Download</Button>
                  <Link href="/verify" className={buttonClass('secondary', 'md', 'no-underline')}>Verify</Link>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {failed ? (
        <Banner kind={failed.reason === 'not-configured' ? 'stale' : 'refused'} title={failed.reason === 'not-configured' ? 'Signed reports are not available' : 'The report was not downloaded'}>
          {failed.message}
        </Banner>
      ) : null}
    </Card>
  )
}
