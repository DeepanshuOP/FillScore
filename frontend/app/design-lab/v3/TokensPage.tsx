import { contrastRatio } from '../../ui/contrast'
import { grid, tape } from './tokens'
import { ThemeScope } from './ThemeScope'

const SPEC = {
  tape: {
    title: 'Tape & Receipt',
    themes: [['Paper', tape.paper], ['Carbon copy', tape.carbon]] as const,
    display: 'var(--f-cabinet)', mono: 'var(--f-departure)',
    faces: 'Cabinet Grotesk 400 to 900 (display and UI, tabular figures) with Departure Mono (tape, receipts, labels: the thermal printer).',
  },
  grid: {
    title: 'Grid & Highlighter',
    themes: [['Ink', grid.ink], ['Sheet', grid.sheet]] as const,
    display: 'var(--f-archivo)', mono: 'var(--f-fragment)',
    faces: 'Archivo variable: width 125 for display figures, width 100 for UI (tabular figures at both), with Fragment Mono for indices, hashes and labels.',
  },
}

/** Tokens and type for one direction, with the contrast of each text colour measured against its grounds. */
export function TokensPage({ dir }: { dir: 'tape' | 'grid' }) {
  const s = SPEC[dir]
  return (
    <ThemeScope dir={dir}>
      <main style={{ padding: '40px var(--gutter) 80px', position: 'relative', zIndex: 1 }}>
        <h1 style={{ fontFamily: s.display, fontWeight: 900, fontStretch: dir === 'grid' ? '125%' : undefined, fontSize: 'clamp(56px, 9vw, 140px)', letterSpacing: '-0.05em', lineHeight: 0.85, margin: 0 }}>{s.title}</h1>
        <p style={{ maxWidth: '70ch', fontSize: 17, lineHeight: 1.5 }}>{s.faces}</p>
        {s.themes.map(([name, t]) => (
          <section key={name} style={{ marginTop: 36 }}>
            <h2 style={{ fontSize: 20, margin: '0 0 12px' }}>{name}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
              {Object.entries(t).map(([k, v]) => (
                <div key={k} style={{ background: t.paper, color: t.ink, boxShadow: `inset 0 0 0 1px ${t.rule}`, padding: 12 }}>
                  <div style={{ height: 54, background: v, boxShadow: `inset 0 0 0 1px ${t.rule}` }} />
                  <div style={{ fontFamily: s.mono, fontSize: 12, marginTop: 8 }}>{k}<br />{v}<br />
                    <span style={{ color: t.graphite }}>on ground {contrastRatio(v, t.paper).toFixed(2)}:1</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
        <section style={{ marginTop: 44 }}>
          <div style={{ fontFamily: s.display, fontWeight: 900, fontStretch: dir === 'grid' ? '125%' : undefined, fontSize: 120, letterSpacing: '-0.055em', lineHeight: 0.85 }}>$52.08 A 93.4</div>
          <div style={{ fontFamily: s.display, fontSize: 22, marginTop: 12 }}>245 orders paid $52.08 in January 2024, 11.7 bps of the $44,411.78 they set out to trade.</div>
          <div style={{ fontFamily: s.mono, fontSize: 14, marginTop: 10 }}>41,918.39 0.00343 20:41:36.963 10.0 bps −$0.41 ord-moderate-BTCUSDT-968874</div>
        </section>
      </main>
    </ThemeScope>
  )
}
