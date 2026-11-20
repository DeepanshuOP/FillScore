import type { Metadata } from 'next'
import { ToastProvider } from '../ui/Toast'

export const metadata: Metadata = { title: 'Account settings — FillScore' }

export default function Layout({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>
}
