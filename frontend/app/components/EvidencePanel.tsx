'use client'

import Link from 'next/link'
import { useState } from 'react'
import * as m from 'motion/react-m'
import { Banner } from '../ui/Banner'
import { Button } from '../ui/Button'
import { Panel } from '../ui/Panel'
import { useToast } from '../ui/Toast'
import { browserPackDeps, downloadEvidencePack, type PackKind, type PackPhase, type PackResult } from '../lib/evidencePack'

import { EVIDENCE_KEY_FINGERPRINT } from '../lib/evidenceKey'
export { EVIDENCE_KEY_FINGERPRINT }

type Auth = { accessToken: string | null; refreshAccessToken: () => Promise<string | null> }
type State = { kind: PackKind; phase: PackPhase } | null

const PACKS: Array<{ kind: PackKind; title: string; label: string; text: string; variant: 'primary' | 'secondary' }> = [
  { kind: 'scorecard', title: 'Scorecard pack', label: 'Download scorecard pack', variant: 'primary',
    text: 'The score, its components and the integrity hash, with the manifest that lists every file and its SHA-256.' },
  { kind: 'best-execution', title: 'Best-execution pack', label: 'Download best-execution pack', variant: 'secondary',
    text: 'Order outcomes and costs in a form that supports your documentation of best execution. It does not state that you comply with any rule.' },
]

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} kB`

/**
 * Evidence (design v3): the two signed packs as two stamped envelopes, each with its contents, its progress and the
 * signing key's fingerprint. A signed-in account downloads them (fetched with the access token, saved as a file, a plain
 * message for each failure). A demo account is read-only and synthetic: the envelopes read "NOT ISSUED" and say why.
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
    <p className="text-sm leading-6 text-ui-graphite">
      Every pack is signed with Ed25519, key fingerprint{' '}
      <code className="font-mono text-[12px] text-ui-ink">{EVIDENCE_KEY_FINGERPRINT}</code>.{' '}
      <Link href="/verify" className="text-ui-ink">Verify a pack in your browser</Link>; the file never leaves it.
    </p>
  )
  if (mode === null) return null
  const demo = mode === 'demo'

  return (
    <Panel id="evidence" title="Evidence" note={{ label: 'what the packs are', text: 'Signed files that record how these orders were measured, for your own documentation.' }}>
      <div className="flex flex-col gap-5">
        {demo ? (
          <Banner kind="demo" title="Demo accounts have no evidence pack">
            The demo accounts are read-only and synthetic, so there is nothing of yours to sign. A signed-in account with synced orders gets both packs.
          </Banner>
        ) : null}
        <div className="grid gap-6 sm:grid-cols-2">
          {PACKS.map((p, i) => {
            const mine = busy?.kind === p.kind
            const progress = mine ? (busy!.phase === 'preparing' ? 0.35 : 0.85) : done[p.kind] ? 1 : 0
            return (
              <div key={p.kind} className={`fs-envelope flex min-w-0 max-w-full flex-col items-start gap-3 [overflow-wrap:anywhere] ${i ?'sm:rotate-[0.6deg]' : 'sm:-rotate-[0.5deg]'}`}>
                <span className="fs-env-stamp fs-word-stamp !text-[15px]" data-tone={demo ? 'ink' : undefined}>
                  {demo ? 'NOT ISSUED' : 'SIGNED'}<small>{demo ? 'demo account' : 'Ed25519'}</small>
                </span>
                <p className="font-mono text-[11px] tracking-[0.06em] text-ui-graphite uppercase">Evidence, pack {i + 1} of 2</p>
                <p className="text-[1.25rem] font-black tracking-[-0.02em] text-ui-ink">{p.title}</p>
                <p className="max-w-[42ch] flex-1 text-sm leading-5 text-ui-graphite">{p.text}</p>
                <p className="font-mono text-[11px] text-ui-graphite">KEY {EVIDENCE_KEY_FINGERPRINT}</p>
                {demo ? null : (
                  <>
                    <Button variant={p.variant} loading={mine} disabled={!!busy && !mine} onClick={() => get(p.kind)}>{p.label}</Button>
                    <div aria-hidden="true" className="h-[3px] w-full border-t border-dashed border-ui-edge">
                      <m.div className="-mt-px h-[3px] bg-ui-ink" initial={false} animate={{ width: `${progress * 100}%` }} transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }} />
                    </div>
                    <p role="status" className="min-h-5 font-mono text-[12px] text-ui-ink">
                      {mine ? (busy!.phase === 'preparing' ? 'PREPARING THE PACK' : 'WRITING THE FILE') : done[p.kind] ?? ''}
                    </p>
                  </>
                )}
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
    </Panel>
  )
}
