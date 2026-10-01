import React from 'react';
import Link from 'next/link';
import { LegalSection, LEGAL_UPDATED, contactLine } from '../legal/content';

interface Props {
  title: string;
  intro: string;
  sections: LegalSection[];
  otherHref: string;
  otherLabel: string;
}

export default function LegalDocument({ title, intro, sections, otherHref, otherLabel }: Props) {
  return (
    <main style={{ minHeight: '100vh', background: '#0f0f0f', padding: '96px 16px 80px' }}>
      <article style={{ maxWidth: 720, margin: '0 auto' }}>
        <h1 style={{ fontFamily: 'var(--font-playfair)', fontStyle: 'italic', fontWeight: 400, fontSize: '2rem', color: '#ede8e0', marginBottom: '0.5rem' }}>
          {title}
        </h1>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', letterSpacing: '0.12em', color: '#888078', marginBottom: '1.5rem' }}>
          LAST UPDATED {LEGAL_UPDATED}
        </p>
        <p style={{ fontFamily: 'var(--font-inter)', fontSize: '0.95rem', lineHeight: 1.75, color: '#a09890', marginBottom: '2rem' }}>
          {intro}
        </p>

        <nav aria-label="Sections" style={{ marginBottom: '2.5rem' }}>
          <ol style={{ paddingLeft: '1.2rem', fontFamily: 'var(--font-inter)', fontSize: '0.8rem', lineHeight: 2, color: '#888078' }}>
            {sections.map((s) => (
              <li key={s.id}><a href={`#${s.id}`} style={{ color: '#a78b71', textDecoration: 'none' }}>{s.heading}</a></li>
            ))}
          </ol>
        </nav>

        {sections.map((s) => (
          <section key={s.id} id={s.id} style={{ marginBottom: '2rem', scrollMarginTop: '80px' }}>
            <h2 style={{ fontFamily: 'var(--font-inter)', fontSize: '1.05rem', fontWeight: 600, color: '#ede8e0', marginBottom: '0.75rem' }}>
              {s.heading}
            </h2>
            {s.body.map((p, i) => (
              <p key={i} style={{ fontFamily: 'var(--font-inter)', fontSize: '0.9rem', lineHeight: 1.75, color: '#a09890', marginBottom: '0.75rem' }}>
                {p}
              </p>
            ))}
          </section>
        ))}

        <p style={{ fontFamily: 'var(--font-inter)', fontSize: '0.85rem', lineHeight: 1.7, color: '#a09890', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '1.5rem' }}>
          {contactLine(process.env.NEXT_PUBLIC_CONTACT_EMAIL)}{' '}
          <Link href={otherHref} style={{ color: '#a78b71' }}>{otherLabel}</Link>
        </p>
      </article>
    </main>
  );
}
