import type { Metadata } from 'next'
import ConnectExchange from '../../onboarding/ConnectExchange'

export const metadata: Metadata = { title: 'Connect an exchange' }
export default function Page() { return <ConnectExchange /> }
