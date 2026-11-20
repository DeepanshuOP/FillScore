/**
 * Hand-drawn pen strokes as SVG paths (the rough-notation look, written here so no dependency is added). Deterministic:
 * a seeded generator, so the server and the client draw the same stroke and a screenshot is reproducible.
 * Every path is one open stroke, drawn by GSAP DrawSVG from its start.
 */

function rng(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5
    return ((s >>> 0) % 10000) / 10000
  }
}

/** A loose ellipse around a box, drawn as about 1.15 turns that do not close on themselves, like a pen circling a figure. */
export function circlePath(x: number, y: number, w: number, h: number, seed = 1): string {
  const r = rng(seed)
  const cx = x + w / 2, cy = y + h / 2
  const rx = w / 2 + 8, ry = h / 2 + 7
  const start = -Math.PI * 0.62 + r() * 0.3
  const turns = 1.12 + r() * 0.08
  const steps = 36
  const pts: Array<[number, number]> = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const a = start + t * turns * Math.PI * 2
    const wob = 1 + (r() - 0.5) * 0.05 + t * 0.06
    pts.push([cx + Math.cos(a) * rx * wob, cy + Math.sin(a) * ry * (wob - t * 0.04)])
  }
  return smooth(pts)
}

/** A square bracket under a span (x0..x1) at height y, ticks pointing up, with a slight hand wobble. */
export function bracketPath(x0: number, x1: number, y: number, depth = 10, seed = 2): string {
  const r = rng(seed)
  const j = () => (r() - 0.5) * 2.2
  const pts: Array<[number, number]> = [
    [x0 + j(), y - depth + j()],
    [x0 + j() * 0.5, y + j() * 0.4],
  ]
  const n = Math.max(3, Math.round((x1 - x0) / 40))
  for (let i = 1; i < n; i++) pts.push([x0 + ((x1 - x0) * i) / n, y + j() * 0.6])
  pts.push([x1 + j() * 0.5, y + j() * 0.4], [x1 + j(), y - depth + j()])
  return line(pts)
}

/** A double underline (the total), the second stroke a little shorter and lower. */
export function underlinePath(x0: number, x1: number, y: number, seed = 3): string {
  const r = rng(seed)
  const a: Array<[number, number]> = [], b: Array<[number, number]> = []
  const n = 6
  for (let i = 0; i <= n; i++) {
    const t = i / n
    a.push([x0 + (x1 - x0) * t, y + (r() - 0.5) * 1.6 + t * 1.2])
    b.push([x0 + 6 + (x1 - x0 - 14) * t, y + 6 + (r() - 0.5) * 1.6 - t * 0.6])
  }
  return `${smooth(a)} ${smooth(b)}`
}

/**
 * A leader: the short hand-drawn stroke that ties a margin note to the mark it describes (design v3: a pen note never
 * floats). A gentle curve from (x0, y0) to (x1, y1) with a little wobble, ending in a small tick at the note.
 */
export function leaderPath(x0: number, y0: number, x1: number, y1: number, seed = 4): string {
  const r = rng(seed)
  const mx = (x0 + x1) / 2 + (r() - 0.5) * 10, my = (y0 + y1) / 2 + (r() - 0.5) * 6
  const bend = (x1 - x0) * 0.18
  return smooth([[x0, y0], [mx - bend, my], [x1, y1]])
}

function line(pts: Array<[number, number]>): string {
  return pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
}

/** Catmull-Rom through the points, as cubic Béziers. */
function smooth(pts: Array<[number, number]>): string {
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`
  }
  return d
}
