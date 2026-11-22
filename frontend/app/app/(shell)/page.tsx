import type { Metadata } from 'next'
import { DashboardSection } from '@/app/dashboard/DashboardContent'

export const metadata: Metadata = { title: 'Home' }
export default function Page() { return <DashboardSection view="home" /> }
