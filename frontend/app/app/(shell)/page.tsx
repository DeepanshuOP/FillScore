import type { Metadata } from 'next'
import { DashboardSection } from '@/app/dashboard/DashboardContent'

export const metadata: Metadata = { title: 'Home' }
// Interim (IA v4 step 2): Home shows the overview until the Ask home is built in step 3.
export default function Page() { return <DashboardSection view="overview" /> }
