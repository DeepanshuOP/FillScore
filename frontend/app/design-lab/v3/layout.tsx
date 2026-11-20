import './v3.css'
import { fontVars } from './fonts'

// Design v3 prototype round (2026-11-20). Inherits the lab's guard (404 in production) and noindex from ../layout.tsx.
export default function V3Layout({ children }: { children: React.ReactNode }) {
  return <div className={fontVars}>{children}</div>
}
