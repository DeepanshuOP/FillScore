import { Gallery } from './Gallery'
import { LabShell } from './LabShell'
import { parseLab } from './params'
import mock from './fixtures/dashboard-mock.json'

export default async function LabHome({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = parseLab(await searchParams)
  return (
    <LabShell params={params} page="/design-lab" title="Components on two token sets"
      intro="The same components under direction A, Audit report (light), and direction B, Tape (dark). Switch the direction and the type family above. The table rows are demo-moderate's real per-symbol costs; the state examples are labelled as examples.">
      <Gallery symbols={mock.symbols} />
    </LabShell>
  )
}
