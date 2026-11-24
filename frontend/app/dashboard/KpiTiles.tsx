import type { GradeView, Headline } from './headline'
import { kpiTiles } from './tiles'
import { Tile } from '../ui/blocks'

/** The four KPI tiles (two by two on a phone, four in a row from 1280 px). The values come from `kpiTiles`, which formats served figures. */
export function KpiTiles({ headline, ordersBody, grade, band }: { headline: Headline | null; ordersBody: unknown; grade: GradeView | null; band: [number, number] | null }) {
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4" data-testid="kpi-tiles">
      {kpiTiles(headline, ordersBody, grade, band).map((t) => (
        <Tile key={t.id} label={t.label} value={t.value} sub={t.sub} testid={t.id === 'total' ? 'home-total' : `tile-${t.id}`} />
      ))}
    </div>
  )
}
