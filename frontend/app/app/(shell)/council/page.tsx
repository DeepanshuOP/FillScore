import type { Metadata } from 'next'
import { DashboardSection } from '@/app/dashboard/DashboardContent'

export const metadata: Metadata = { title: 'Council' }
export default function Page() { return <DashboardSection view="council" /> }
