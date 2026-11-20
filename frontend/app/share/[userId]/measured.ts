import { serverApiBase } from '../../lib/serverApiBase'

/**
 * The measured (v2) grade for a share card. GET /api/audit/share returns only the frozen v1 grade, so the card also asks
 * GET /api/audit/v2 (public for the demo accounts; a real account's v2 needs its session and so returns nothing here).
 * No backend change: both routes exist. Returns null when there is no letter grade (never a made-up one).
 */
export async function fetchMeasured(userId: string): Promise<{ grade: string; score: number; scoringVersion: string | null } | null> {
  try {
    const r = await fetch(`${serverApiBase()}/audit/v2?userId=${encodeURIComponent(userId)}`, { next: { revalidate: 600 } })
    if (!r.ok) return null
    const b = await r.json() as { scoringVersion?: string; result?: { grade: string | null; composite: number | null } }
    const g = b.result?.grade, s = b.result?.composite
    return typeof g === 'string' && typeof s === 'number' && Number.isFinite(s) ? { grade: g, score: s, scoringVersion: b.scoringVersion ?? null } : null
  } catch {
    return null
  }
}
