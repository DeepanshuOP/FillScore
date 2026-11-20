import React from 'react';
import Link from 'next/link';
import { LegalSection, LEGAL_UPDATED, contactLine } from '../legal/content';
import { MarketingNav } from './marketing/MarketingNav';
import SiteFooter from './SiteFooter';

interface Props {
  title: string;
  intro: string;
  sections: LegalSection[];
  otherHref: string;
  otherLabel: string;
}

export default function LegalDocument({ title, intro, sections, otherHref, otherLabel }: Props) {
  return (
    <>
      <MarketingNav />
      <main className="min-h-screen bg-ui-surface pb-24">
        <div className="mx-auto max-w-[1240px] px-5 pt-28 sm:px-8">
          <div className="grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-16">
            <nav aria-label="Sections" className="order-2 lg:order-1 lg:sticky lg:top-24 lg:self-start">
              <p className="mb-3 text-[13px] font-medium text-ui-graphite">On this page</p>
              <ol className="flex flex-col border-l border-ui-rule">
                {sections.map((s) => (
                  <li key={s.id}>
                    <a href={`#${s.id}`} className="-ml-px block border-l border-transparent py-1.5 pl-4 text-[13.5px] text-ui-graphite no-underline transition-colors hover:border-ui-edge hover:text-ui-ink">{s.heading}</a>
                  </li>
                ))}
              </ol>
            </nav>

            <article className="order-1 max-w-[68ch] lg:order-2">
              <h1 className="display-md text-ui-ink">{title}</h1>
              <p className="mt-3 text-[13px] text-ui-graphite">Last updated {LEGAL_UPDATED}</p>
              <p className="mt-6 text-[15.5px] leading-[1.75] text-ui-graphite">{intro}</p>

              {sections.map((s) => (
                <section key={s.id} id={s.id} className="mt-10 scroll-mt-24">
                  <h2 className="mb-3 text-xl font-semibold tracking-[-0.02em] text-ui-ink">{s.heading}</h2>
                  {s.body.map((p, i) => (
                    <p key={i} className="mb-4 text-[15.5px] leading-[1.75] text-ui-graphite">{p}</p>
                  ))}
                </section>
              ))}

              <p className="mt-12 border-t border-ui-rule pt-6 text-sm leading-6 text-ui-graphite">
                {contactLine(process.env.NEXT_PUBLIC_CONTACT_EMAIL)}{' '}
                <Link href={otherHref} className="text-ui-ink">{otherLabel}</Link>
              </p>
            </article>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
