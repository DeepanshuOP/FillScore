import type { Metadata } from 'next'
import { DashboardSection } from '@/app/dashboard/DashboardContent'

export const metadata: Metadata = { title: 'Evidence' }
export default function Page() { return <DashboardSection view="evidence" /> }
