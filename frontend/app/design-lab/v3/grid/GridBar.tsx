'use client'

import Link from 'next/link'
import { ThemeToggle } from '../ThemeScope'

/** The twelve columns drawn as hairlines over the whole page (Santal); everything else sits on them. */
export function Cols() {
  return <div className="g-cols" aria-hidden>{Array.from({ length: 12 }, (_, i) => <span key={i} />)}</div>
}

/** Top bar: each item starts on a column, with a tick where it meets the column rule. */
export function GridBar({ app, children }: { app?: boolean; children?: React.ReactNode }) {
  return (
    <header className="g-12 g-bar">
      <Link href="/design-lab/v3/grid/hero" className="g-mark" style={{ gridColumn: 'span 2' }} aria-label="FillScore">FillScore</Link>
      {app ? children : (
        <>
          <nav className="hide-s" aria-label="Main" style={{ gridColumn: '4 / span 5', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', paddingLeft: 0 }}>
            <a className="g-link tick" href="#method" style={{ paddingLeft: 10 }}>Method</a>
            <a className="g-link tick" href="#verify" style={{ paddingLeft: 10 }}>Verify a pack</a>
            <a className="g-link tick" href="#demo" style={{ paddingLeft: 10 }}>Demo audit</a>
          </nav>
          <span className="g-tog" style={{ gridColumn: '11 / span 1' }}><ThemeToggle className="g-link" /></span>
          <span className="hide-s" style={{ gridColumn: '12 / span 1' }}><a className="g-link" href="#signin">Sign in</a></span>
        </>
      )}
    </header>
  )
}
