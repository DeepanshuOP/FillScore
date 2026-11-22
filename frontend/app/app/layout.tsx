import type { Metadata } from 'next'
import { ToastProvider } from '../ui/Toast'
import '../ui/appshell.css'

export const metadata: Metadata = { title: { default: 'FillScore app', template: '%s — FillScore' } }

/** Every page of the app lives under /app (IA v4). The frame (sidebar, header) is the layout of the (shell) group; Settings and
 *  Connect have their own shells. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>
}
