import type { Metadata } from 'next'
import { ToastProvider } from '../ui/Toast'

export const metadata: Metadata = { title: { default: 'FillScore app', template: '%s — FillScore' } }

/** Every page of the app lives under /app (IA v4). The shell itself is added in step 2. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>
}
