import { ThemeScope } from '../../ThemeScope'
import { GridHero } from '../GridHero'

export default function Page() {
  return (
    <ThemeScope dir="grid">
      <GridHero />
      <section style={{ minHeight: '60vh', padding: '96px var(--gutter)', borderTop: '1px solid var(--v3-rule)', position: 'relative' }}>
        <p style={{ fontSize: 28, fontWeight: 700, maxWidth: '28ch', margin: 0 }}>The rest of the landing page continues on the same sheet.</p>
      </section>
    </ThemeScope>
  )
}
