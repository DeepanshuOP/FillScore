import { HERO_ID } from '../../data'
import { ThemeScope } from '../../ThemeScope'
import { GridOverview } from '../GridOverview'

/** The overview with the hero order's ledger sheet open. */
export default function Page() {
  return <ThemeScope dir="grid"><GridOverview initialOpen={HERO_ID} /></ThemeScope>
}
