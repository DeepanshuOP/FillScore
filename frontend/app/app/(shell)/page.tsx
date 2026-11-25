import type { Metadata } from 'next'
import { DashboardRoute } from '@/app/dashboard/DashboardRoute'

export const metadata: Metadata = { title: 'Home' }
export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) { return <DashboardRoute view="home" searchParams={searchParams} /> }
