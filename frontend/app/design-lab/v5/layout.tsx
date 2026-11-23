import type { Metadata } from 'next'
import './v5.css'
import { ThemeRoot } from './ThemeRoot'

// Design v5 prototype (orders of 2026-11-24, step 6). Under the design-lab layout, so 404 in production (designLabEnabled).
// Every figure comes from the offline demo fixtures and the stored demo prints (lib/data.ts); nothing is computed here.
export const metadata: Metadata = { title: 'Design v5 prototype', robots: { index: false, follow: false } }

export default function V5Layout({ children }: { children: React.ReactNode }) {
  return <ThemeRoot>{children}</ThemeRoot>
}
