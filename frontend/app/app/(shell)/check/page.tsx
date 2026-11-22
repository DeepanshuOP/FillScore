import type { Metadata } from 'next'
import CheckFile from '@/app/check/CheckFile'

export const metadata: Metadata = { title: 'Check a broker file' }
export default function Page() { return <CheckFile /> }
