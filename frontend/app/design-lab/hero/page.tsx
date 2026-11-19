import { LabShell } from '../LabShell'
import { parseLab } from '../params'
import { Hero } from './Hero'

export default async function HeroPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams
  const params = parseLab(q)
  const f = Array.isArray(q.freeze) ? q.freeze[0] : q.freeze
  const freezeAt = f !== undefined && Number.isFinite(Number(f)) ? Math.min(1, Math.max(0, Number(f))) : undefined
  return (
    <LabShell params={params} page="/design-lab/hero" title="The landing hero, as a prototype"
      intro="The one orchestrated moment of the landing page, built from the replay data of one synthetic demo order on real public prices. It plays once for about seven seconds, can be skipped, and ends on the frame shown here without script. With reduced motion set, only that frame is shown.">
      <Hero freezeAt={freezeAt} />
    </LabShell>
  )
}
