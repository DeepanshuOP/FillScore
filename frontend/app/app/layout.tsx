import type { Metadata } from 'next'
import { ToastProvider } from '../ui/Toast'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppScope } from '../components/appshell/AppScope'
import '../ui/appshell.css'

export const metadata: Metadata = { title: { default: 'FillScore app', template: '%s — FillScore' } }

/** Every page of the app lives under /app (IA v4). The frame (sidebar, header) is the layout of the (shell) group; Settings and
 *  Connect have their own shells. Design v5: `data-app` gives every app page the neutral grey ground and white cards (tokens.css);
 *  AppScope marks the body too, so a menu, sheet or dialog that opens in a portal wears the same tokens. Step 7: the tooltip provider
 *  and the toast mount live here, not in the root layout, because only the app uses them. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <div data-app className="min-h-dvh"><AppScope /><TooltipProvider delayDuration={200}><ToastProvider>{children}</ToastProvider></TooltipProvider></div>
}
