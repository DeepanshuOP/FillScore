'use client'

import Link from 'next/link'
import { Banner } from '../ui/Banner'
import { Button } from '../ui/Button'
import { Panel } from '../ui/Panel'
import { Tabs } from '../ui/Tabs'
import { useToast } from '../ui/Toast'

/**
 * Mock of the evidence panel (M8 notes, "the evidence-pack download button"; question 6: on the dashboard and on settings).
 * The route GET /api/evidence/pack exists; no screen calls it yet. In the lab the buttons only show their states:
 * pressing one confirms that no file is downloaded here. The wording of the best-execution pack is "supports your
 * documentation", never "compliant".
 */
export function EvidencePanel({ fingerprint }: { fingerprint: string }) {
  const toast = useToast()
  const press = (what: string) => toast.show({ title: `${what}: lab only`, detail: 'No file is downloaded from the design lab.' })
  const verify = (
    <p className="text-sm text-ui-graphite">
      Every pack is signed with Ed25519, key fingerprint <code className="rounded-ui border border-ui-rule px-1.5 py-0.5 font-[family-name:var(--ui-mono)] text-[0.8125rem] text-ui-ink">{fingerprint}</code>.
      {' '}<Link href="/verify" className="text-ui-ink underline">Verify a pack in your browser</Link>; the file never leaves it.
    </p>
  )
  return (
    <Panel title="Evidence" id="evidence" description="Signed files that record how these orders were measured, for your own documentation.">
      <Tabs label="Account kind" tabs={[
        {
          id: 'demo', label: 'Demo account',
          content: (
            <div className="flex flex-col gap-4">
              <Banner kind="demo" title="Demo accounts have no evidence pack">The demo accounts are read-only and synthetic, so there is nothing of yours to sign. A signed-in account with synced orders gets both packs.</Banner>
              <div className="flex flex-wrap gap-3">
                <Button variant="secondary" disabled>Download scorecard pack</Button>
                <Button variant="secondary" disabled>Download best-execution pack</Button>
              </div>
              {verify}
            </div>
          ),
        },
        {
          id: 'real', label: 'Your account',
          content: (
            <div className="flex flex-col gap-4">
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="flex flex-col items-start gap-2">
                  <Button onClick={() => press('Scorecard pack')}>Download scorecard pack</Button>
                  <p className="max-w-[40ch] text-sm text-ui-graphite">The score, its components and the integrity hash, with the manifest that lists every file and its SHA-256.</p>
                </div>
                <div className="flex flex-col items-start gap-2">
                  <Button variant="secondary" onClick={() => press('Best-execution pack')}>Download best-execution pack</Button>
                  <p className="max-w-[40ch] text-sm text-ui-graphite">Order outcomes and costs in a form that supports your documentation of best execution. It does not state that you comply with any rule.</p>
                </div>
              </div>
              {verify}
            </div>
          ),
        },
      ]} />
    </Panel>
  )
}
