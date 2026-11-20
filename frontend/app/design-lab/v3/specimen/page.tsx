import Link from 'next/link'
import { Specimen } from './Specimen'

export default function SpecimenPage() {
  return (
    <main className="lab-v3">
      <p><Link href="/design-lab/v3">Design v3 lab</Link></p>
      <h1>Type specimen</h1>
      <p style={{ maxWidth: '70ch' }}>The candidates set in FillScore&apos;s own figures. The digit widths are measured in this browser with tabular figures on; a table face must set all ten at one width.</p>
      <Specimen />
    </main>
  )
}
