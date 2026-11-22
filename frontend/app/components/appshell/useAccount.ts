'use client'

import { useSearchParams } from 'next/navigation'
import { useSyncExternalStore } from 'react'
import { useAuth } from '../../context/AuthContext'
import { isAllowedDemoId, resolveDashboardMode } from '../../utils/dashboardMode'
import { accountLabel } from '../shell/nav'

const subscribe = (cb: () => void) => { window.addEventListener('storage', cb); return () => window.removeEventListener('storage', cb) }
const readStored = () => { try { return localStorage.getItem('userId') } catch { return null } }

export interface Account {
  /** The demo account on screen, or null (the signed-in account's own data, or no account at all). */
  demoId: string | null
  signedIn: boolean
  /** 'demo' | 'real' | 'none': none = signed out with no demo account (only the broker-file check opens like that). */
  kind: 'demo' | 'real' | 'none'
  label: string
  dataSource: 'synthetic-demo' | 'real-user' | null
  email: string | null
  logout: () => Promise<void>
}

/**
 * Which account the address and the session point at, by the same rule the pages use to load data
 * (utils/dashboardMode.resolveDashboardMode): a demo id in the address, a signed-in account's own data, or a remembered demo id.
 * Reads the search parameters: callers sit inside a Suspense boundary.
 */
export function useAccount(): Account {
  const sp = useSearchParams()
  const { accessToken, user, logout } = useAuth()
  const stored = useSyncExternalStore(subscribe, readStored, () => null)
  const urlId = sp.get('userId')
  const mode = resolveDashboardMode({ urlUserId: urlId, storageUserId: stored, accessToken, sample: sp.get('sample') === '1' })
  const signedIn = !!accessToken
  if (mode === 'demo') {
    const demoId = [urlId, stored].find(isAllowedDemoId) ?? 'demo-disciplined'
    return { demoId, signedIn, kind: 'demo', label: accountLabel(demoId), dataSource: 'synthetic-demo', email: user?.email ?? null, logout }
  }
  if (mode === 'real') return { demoId: null, signedIn, kind: 'real', label: 'Your account', dataSource: 'real-user', email: user?.email ?? null, logout }
  return { demoId: null, signedIn, kind: 'none', label: 'No account', dataSource: null, email: null, logout }
}
