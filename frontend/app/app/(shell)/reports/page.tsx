import type { Metadata } from 'next'
import { DashboardRoute } from '@/app/dashboard/DashboardRoute'

export const metadata: Metadata = { title: 'Reports' }
export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) { return <DashboardRoute view="reports" searchParams={searchParams} /> }
