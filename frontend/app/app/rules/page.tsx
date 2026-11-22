import type { Metadata } from 'next'
import { DashboardSection } from '../../dashboard/DashboardContent'

export const metadata: Metadata = { title: 'Rules' }
export default function Page() { return <DashboardSection view="rules" /> }
