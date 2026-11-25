import type { View } from '../components/shell/nav'
import { DashboardSection } from './DashboardContent'
import { loadDemoInitial } from './demoInitial'

/**
 * The server half of a dashboard page (design v5 step 7): for a demo account in the address (`?userId=demo-...`) it fetches the first
 * figures on the server and sends them in the page; for anything else the page loads in the browser exactly as before. A signed-in
 * account's figures are never loaded here (the session is not forwarded to the server).
 */
export async function DashboardRoute({ view, searchParams }: { view: View; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const id = typeof sp.userId === 'string' ? sp.userId : null
  const initial = await loadDemoInitial(id)
  return <DashboardSection view={view} initial={initial} />
}
