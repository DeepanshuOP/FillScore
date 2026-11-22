import type { Metadata } from 'next'
import { DashboardSection } from '../../dashboard/DashboardContent'

export const metadata: Metadata = { title: 'Rankings' }
export default function Page() { return <DashboardSection view="rankings" /> }
