import { circlePath } from '../ui/pen';
import { printsLine, printsTapeGeometry, tickPath, type PrintsWindow } from './printsTape';

/**
 * The receipt's tape of public prints for a demo order, in the tape language of DESIGN.md: each print is a tick (filled up:
 * buyer-initiated; hollow down: seller-initiated), the order's fills are ringed in pen, the arrival is a dashed line.
 * Plain SVG, no chart library, and no motion: the frame drawn here is the finished frame, so reduced motion and no script
 * see the same picture. Every position comes from the server's window through printsTape.ts.
 */
export function PrintsTape({ window: w, fills }: { window: PrintsWindow; fills: Array<{ timeMs: number; price: number }> }) {
  const g = printsTapeGeometry(w, fills);
  const label = w.prints.length === 0
    ? 'Tape of public prints: none in the window'
    : `Tape of ${w.prints.length} public prints with the order's ${fills.length === 1 ? 'fill' : 'fills'} ringed and the arrival marked`;
  return (
    <figure className="fs-printstape" data-testid="receipt-prints-tape" style={{ margin: '8px 0 0' }}>
      <svg viewBox={`0 0 ${g.width} ${g.height}`} width="100%" role="img" aria-label={label} style={{ display: 'block', overflow: 'visible' }}>
        <line x1={g.arrivalX} x2={g.arrivalX} y1={4} y2={g.height - 4} stroke="var(--ui-graphite)" strokeWidth={1} strokeDasharray="3 3" data-testid="receipt-prints-arrival" />
        <text x={g.arrivalX + 3} y={10} fontSize={8} fill="var(--ui-graphite)" fontFamily="var(--ui-mono)">ARRIVAL</text>
        {g.ticks.map((t) => (
          <path key={t.key} d={tickPath(t.x, t.y, t.buyer)} data-side={t.buyer ? 'buyer' : 'seller'}
            fill={t.buyer ? 'var(--ui-ink)' : 'none'} stroke={t.buyer ? 'none' : 'var(--ui-graphite)'} strokeWidth={1} />
        ))}
        <g className="fs-pen">
          {g.fills.map((f, i) => <path key={i} d={circlePath(f.x - 9, f.y - 9, 18, 18, 41 + i)} data-testid="receipt-prints-fill" />)}
        </g>
      </svg>
      <figcaption className="g" style={{ fontSize: 11, lineHeight: 1.35, marginTop: 4 }}>{printsLine(w)}</figcaption>
    </figure>
  );
}
