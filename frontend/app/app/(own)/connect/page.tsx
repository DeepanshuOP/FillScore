import type { Metadata } from 'next'
import ConnectExchange from '@/app/onboarding/ConnectExchange'

export const metadata: Metadata = { title: 'Connect an exchange' }
export default function Page() { return <ConnectExchange /> }
