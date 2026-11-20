'use client'

import Link from 'next/link'
import { useState } from 'react'
import * as m from 'motion/react-m'
import { FileCheck2, Scale } from 'lucide-react'
import { Banner } from '../ui/Banner'
import { Button } from '../ui/Button'
import { Panel } from '../ui/Panel'
import { useToast } from '../ui/Toast'
import { browserPackDeps, downloadEvidencePack, type PackKind, type PackPhase, type PackResult } from '../lib/evidencePack'

import { EVIDENCE_KEY_FINGERPRINT } from '../lib/evidenceKey'
export { EVIDENCE_KEY_FINGERPRINT }

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
    <p className="text-[13px] leading-6 text-ui-graphite">
      Every pack is signed with Ed25519, key fingerprint{' '}
      <code className="rounded-[6px] bg-ui-overlay px-1.5 py-0.5 font-ui-mono text-[12px] text-ui-ink">{EVIDENCE_KEY_FINGERPRINT}</code>.{' '}
      <Link href="/verify" className="text-ui-action underline-offset-4 hover:underline">Verify a pack in your browser</Link>; the file never leaves it.
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
          <div className="grid gap-4 sm:grid-cols-2">
            {PACKS.map((p) => {
              const mine = busy?.kind === p.kind
              const Icon = p.kind === 'scorecard' ? FileCheck2 : Scale
              return (
                <div key={p.kind} className="flex flex-col items-start gap-3 rounded-[12px] bg-ui-overlay/40 p-4 ring-1 ring-inset ring-ui-rule">
                  <div className="flex items-center gap-3">
                    <span className="grid size-8 shrink-0 place-items-center rounded-[8px] bg-ui-overlay">
                      <Icon aria-hidden="true" strokeWidth={1.75} className="size-4 text-ui-ink" />
                    </span>
                    <p className="text-[15px] font-semibold tracking-[-0.01em] text-ui-ink">{p.kind === 'scorecard' ? 'Scorecard pack' : 'Best-execution pack'}</p>
                  </div>
                  <p className="max-w-[40ch] flex-1 text-[13px] leading-5 text-ui-graphite">{p.text}</p>
                  <Button variant={p.variant} loading={mine} disabled={!!busy && !mine} onClick={() => get(p.kind)}>{p.label}</Button>
                  <div aria-hidden="true" className="h-1 w-full overflow-hidden rounded-full bg-ui-overlay">
                    <m.div className="h-full rounded-full bg-ui-measured" initial={false}
                      animate={{ width: mine ? (busy!.phase === 'preparing' ? '35%' : '85%') : done[p.kind] ? '100%' : '0%' }}
                      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} />
                  </div>
                  <p role="status" className="min-h-5 text-[13px] text-ui-ink">
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
