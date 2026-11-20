import { apiBase } from './apiBase'
import { authFetch } from './authFetch'
import { track } from './track'

/**
 * Downloads a signed evidence pack (GET /api/evidence/pack). The API answers JSON, { pack, files }, and the signature
 * covers the files it lists: the text is saved exactly as received and never parsed and written again.
 * Never throws; every failure comes back as { ok: false, reason, message } in words a reader can act on.
 */
export type PackKind = 'scorecard' | 'best-execution'
export type PackPhase = 'preparing' | 'saving'
export type PackResult =
  | { ok: true; fileName: string; bytes: number }
  | { ok: false; reason: 'not-configured' | 'rate-limited' | 'signed-out' | 'network' | 'error'; message: string }

export interface PackDeps {
  fetch: typeof fetch
  save: (fileName: string, text: string) => void
  onSaved: () => void
  onPhase: (phase: PackPhase) => void
}

export const packFileName = (kind: PackKind): string => `fillscore-${kind}-pack.json`

function saveInBrowser(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a) // in the DOM, so Firefox honours click()
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export const browserPackDeps = (): PackDeps => ({
  fetch: (...a) => fetch(...a),
  save: saveInBrowser,
  onSaved: () => track('evidence_pack_download'),   // the existing anonymous counter; sends no identifier
  onPhase: () => undefined,
})

const isPack = (text: string): boolean => {
  try {
    const j = JSON.parse(text) as { pack?: unknown; files?: unknown }
    return typeof j.pack === 'object' && j.pack !== null && typeof j.files === 'object' && j.files !== null
  } catch {
    return false
  }
}

export async function downloadEvidencePack(
  kind: PackKind,
  auth: { accessToken: string | null; refreshAccessToken: () => Promise<string | null> },
  deps: PackDeps = browserPackDeps(),
  base: string = apiBase(),
): Promise<PackResult> {
  deps.onPhase('preparing')
  let res: Response
  try {
    res = await authFetch(`${base}/evidence/pack?kind=${kind}`, {}, auth, deps.fetch)
  } catch {
    return { ok: false, reason: 'network', message: 'Could not reach the server. Check your connection and try again.' }
  }
  if (res.status === 503) {
    return { ok: false, reason: 'not-configured', message: 'Evidence packs are not available right now: the signing key is not configured on this server. Nothing was downloaded.' }
  }
  if (res.status === 429) return { ok: false, reason: 'rate-limited', message: 'Too many pack requests in a short time. Wait a few minutes and try again.' }
  if (res.status === 401 || res.status === 403) return { ok: false, reason: 'signed-out', message: 'Your sign-in expired. Sign in again to download a pack.' }
  if (!res.ok) return { ok: false, reason: 'error', message: `The server could not build the pack (HTTP ${res.status}). Try again later.` }
  let text: string
  try {
    text = await res.text()
  } catch {
    return { ok: false, reason: 'network', message: 'The connection dropped while the pack was arriving. Try again.' }
  }
  if (!isPack(text)) return { ok: false, reason: 'error', message: 'The server sent something that is not an evidence pack (HTTP 200). Nothing was downloaded.' }
  deps.onPhase('saving')
  const fileName = packFileName(kind)
  deps.save(fileName, text)
  deps.onSaved()
  return { ok: true, fileName, bytes: new TextEncoder().encode(text).length }
}
