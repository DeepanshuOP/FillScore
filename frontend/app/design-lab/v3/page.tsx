import Link from 'next/link'

const DIRS = [
  { id: 'tape', name: 'Direction 1: Tape & Receipt', note: 'Printed paper and ink, one fill-orange pen. The order is a receipt; the grade is a stamp.' },
  { id: 'grid', name: 'Direction 2: Grid & Highlighter', note: 'A visible twelve-column sheet on warm black, figures as image, a lime highlighter that marks what was measured.' },
]
const PAGES = [['tokens', 'Tokens and type'], ['hero', 'Landing hero'], ['overview', 'Overview top'], ['receipt', 'Receipt drawer']]

/** Index of the design v3 prototype round (development only). The proposal is docs/design/v3-proposal/README.md. */
export default function V3Index() {
  return (
    <main className="lab-v3">
      <h1>Design v3 lab</h1>
      <p>Prototype round for Deepanshu&apos;s choice. Development only; this route answers 404 in production. <Link href="/design-lab/v3/specimen">Type specimen and figure measurements</Link></p>
      {DIRS.map((d) => (
        <section key={d.id} className="spec-row">
          <div className="n"><b>{d.name}</b><br />{d.note}</div>
          <ul style={{ display: 'flex', gap: 20, listStyle: 'none', margin: 0, padding: 0, flexWrap: 'wrap' }}>
            {PAGES.map(([p, label]) => <li key={p}><Link href={`/design-lab/v3/${d.id}/${p}`}>{label}</Link></li>)}
          </ul>
        </section>
      ))}
    </main>
  )
}
