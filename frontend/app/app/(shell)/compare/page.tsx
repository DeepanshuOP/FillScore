import type { Metadata } from 'next'
import { DashboardSection } from '@/app/dashboard/DashboardContent'

export const metadata: Metadata = { title: 'Comparisons' }
export default function Page() { return <DashboardSection view="compare" /> }
