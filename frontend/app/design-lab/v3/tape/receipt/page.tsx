import { HERO_ID } from '../../data'
import { ThemeScope } from '../../ThemeScope'
import { TapeOverview } from '../TapeOverview'

/** The overview with the hero order's receipt printed open. */
export default function Page() {
  return <ThemeScope dir="tape"><TapeOverview initialOpen={HERO_ID} /></ThemeScope>
}
