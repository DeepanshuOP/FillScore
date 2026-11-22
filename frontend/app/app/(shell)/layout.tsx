import { AppFrame } from '@/app/components/appshell/AppFrame'
import methodology from '@/app/methodology/methodology.json'

/**
 * The app frame for Home, Overview, Orders, Rules, Rankings, Council, Evidence, Fills and the broker-file check. The versions
 * printed at the sidebar's foot come from the same generated file as /methodology (drift-tested), read here on the server so the
 * JSON is not sent to the browser.
 */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <AppFrame versions={{ scoring: methodology.scoring.version, measure: methodology.measureVersion }}>{children}</AppFrame>
}
