import React from 'react';
import { NOT_COMPUTED } from '../utils/notComputed';

/** Placeholder for a v1-only view of a rebuilt demo (decision 11). Never a zero, never an empty panel. */
export default function NotComputed({ title, detail }: { title: string; detail?: string }) {
  return (
    <section
      data-testid="not-computed"
      aria-label={`${title}: ${NOT_COMPUTED}`}
      style={{ padding: '1.25rem 1.5rem', background: '#161614', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '3px' }}
    >
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', letterSpacing: '0.28em', color: '#a09890', textTransform: 'uppercase', marginBottom: '0.6rem' }}>
        {title}
      </div>
      <p style={{ fontFamily: 'var(--font-inter)', fontSize: '0.85rem', lineHeight: 1.6, color: '#888078', margin: 0 }}>
        {NOT_COMPUTED.charAt(0).toUpperCase() + NOT_COMPUTED.slice(1)}.{detail ? ` ${detail}` : ''}
      </p>
    </section>
  );
}
