import { AppFrame } from '@/app/components/appshell/AppFrame'

/**
 * The app frame for Home, Costs, Orders, Fills, Flagged orders, Comparisons, AI review, Reports and the exchange-export check.
 * The score and measure versions left the sidebar (design v5): they are printed on the grade and in Settings under About.
 */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <AppFrame>{children}</AppFrame>
}
