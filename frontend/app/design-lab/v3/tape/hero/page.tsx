import { ThemeScope } from '../../ThemeScope'
import { TapeHero } from '../TapeHero'

export default function Page() {
  return (
    <ThemeScope dir="tape">
      <TapeHero />
      {/* The section after the pinned hero, so the scroll story has somewhere to go. */}
      <section style={{ minHeight: '60vh', padding: '96px var(--gutter)', borderTop: '1px solid var(--v3-rule)' }}>
        <p style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', maxWidth: '28ch', margin: 0 }}>The rest of the landing page continues here in the same paper and ink.</p>
      </section>
    </ThemeScope>
  )
}
