import type { Metadata } from 'next'
import { DashboardSection } from '../../dashboard/DashboardContent'

export const metadata: Metadata = { title: 'Overview' }
export default function Page() { return <DashboardSection view="overview" /> }
