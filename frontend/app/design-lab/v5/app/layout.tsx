import { Suspense } from 'react'
import { Shell } from '../components/Shell'

export default function V5AppLayout({ children }: { children: React.ReactNode }) {
  return <Suspense><Shell>{children}</Shell></Suspense>
}
