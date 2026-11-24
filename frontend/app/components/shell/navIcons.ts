import { ArrowLeftRight, ChartColumn, CircleDollarSign, FileCheck2, Flag, House, ListOrdered, ShieldCheck, Sparkles, type LucideIcon } from 'lucide-react'
import type { SectionId } from './nav'

/** The lucide icon of each sidebar section (design v5, PROPOSAL §3.1). Kept apart from nav.ts, which stays pure data. */
export const SECTION_ICON: Record<SectionId, LucideIcon> = {
  home: House,
  overview: CircleDollarSign,
  orders: ListOrdered,
  fills: ArrowLeftRight,
  rules: Flag,
  rankings: ChartColumn,
  council: Sparkles,
  evidence: ShieldCheck,
  check: FileCheck2,
}
