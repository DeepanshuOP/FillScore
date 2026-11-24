import type { Metadata } from 'next'
import { DashboardSection } from '@/app/dashboard/DashboardContent'

export const metadata: Metadata = { title: 'Costs' }
export default function Page() { return <DashboardSection view="costs" /> }
