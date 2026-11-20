'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Banner } from '../ui/Banner'
import { Button } from '../ui/Button'
import { Panel } from '../ui/Panel'
import { useToast } from '../ui/Toast'
import { browserPackDeps, downloadEvidencePack, type PackKind, type PackPhase, type PackResult } from '../lib/evidencePack'

/** Fingerprint of the key that signs every pack (recorded 2026-11-18 in docs/research/LOG.md §T). /verify compares a pack with the live key. */
export const EVIDENCE_KEY_FINGERPRINT = 'ba11aa53c4961be4'

type Auth = { accessToken: string | null; refreshAccessToken: () => Promise<string | null> }
type State = { kind: PackKind; phase: PackPhase } | null

const PACKS: Array<{ kind: PackKind; label: string; text: string; variant: 'primary' | 'secondary' }> = [
  { kind: 'scorecard', label: 'Download scorecard pack', variant: 'primary',
    text: 'The score, its components and the integrity hash, with the manifest that lists every file and its SHA-256.' },
  { kind: 'best-execution', label: 'Download best-execution pack', variant: 'secondary',
    text: 'Order outcomes and costs in a form that supports your documentation of best execution. It does not state that you comply with any rule.' },
]

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} kB`

/**
 * The evidence panel of the dashboard and of settings. A signed-in account downloads its two signed packs (fetched with
 * the access token, saved as a file, with progress and a plain message for each failure). A demo account is read-only and
 * synthetic: it gets an explanation instead of the buttons.
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
      toast.show({ title: 'Evidence pack downloaded', detail: `${base.fileName}, ${kb(base.bytes)}. Check it at /verify.` })
    } else {
      setFailed(base)
    }
  }

  const verify = (
    <p className="text-sm text-ui-graphite">
      Every pack is signed with Ed25519, key fingerprint{' '}
      <code className="rounded-ui border border-ui-rule px-1.5 py-0.5 font-[family-name:var(--ui-mono)] text-[0.8125rem] text-ui-ink">{EVIDENCE_KEY_FINGERPRINT}</code>.{' '}
      <Link href="/verify" className="text-ui-ink">Verify a pack in your browser</Link>; the file never leaves it.
    </p>
  )

  return (
    <Panel id="evidence" title="Evidence" description="Signed files that record how these orders were measured, for your own documentation.">
      {mode === 'demo' ? (
        <div className="flex flex-col gap-4">
          <Banner kind="demo" title="Demo accounts have no evidence pack">
            The demo accounts are read-only and synthetic, so there is nothing of yours to sign. A signed-in account with synced orders gets both packs.
          </Banner>
          {verify}
        </div>
      ) : mode === 'real' ? (
        <div className="flex flex-col gap-4">
          <div className="grid gap-6 sm:grid-cols-2">
            {PACKS.map((p) => {
              const mine = busy?.kind === p.kind
              return (
                <div key={p.kind} className="flex flex-col items-start gap-2">
                  <Button variant={p.variant} loading={mine} disabled={!!busy && !mine} onClick={() => get(p.kind)}>{p.label}</Button>
                  <p className="max-w-[40ch] text-sm text-ui-graphite">{p.text}</p>
                  <p role="status" className="min-h-5 text-sm text-ui-ink">
                    {mine ? (busy!.phase === 'preparing' ? 'Preparing the pack.' : 'Writing the file.') : done[p.kind] ?? ''}
                  </p>
                </div>
              )
            })}
          </div>
          {failed ? (
            <Banner kind={failed.reason === 'not-configured' ? 'stale' : 'refused'} title={failed.reason === 'not-configured' ? 'Evidence packs are not available' : 'The pack was not downloaded'}>
              {failed.message}
            </Banner>
          ) : null}
          {verify}
        </div>
      ) : null}
    </Panel>
  )
}
