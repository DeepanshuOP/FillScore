'use client';

import { useEffect, useState } from 'react';
import { cn } from '../../lib/utils';

export interface TocItem { id: string; label: string }

/** Sticky table of contents of the methodology page. The section in view is highlighted with an IntersectionObserver. */
export default function Toc({ items }: { items: TocItem[] }) {
  const [current, setCurrent] = useState(items[0]?.id ?? '');
  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter((e): e is HTMLElement => !!e);
    if (els.length === 0 || typeof IntersectionObserver === 'undefined') return;
    const seen = new Map<string, boolean>();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) seen.set(e.target.id, e.isIntersecting);
      const first = items.find((i) => seen.get(i.id));
      if (first) setCurrent(first.id);
    }, { rootMargin: '-96px 0px -60% 0px' });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [items]);
  return (
    <nav aria-label="On this page" className="lg:sticky lg:top-24 lg:self-start">
      <p className="mb-3 text-[13px] font-medium text-ui-graphite">On this page</p>
      <ol className="flex flex-col border-l border-ui-rule">
        {items.map((i) => (
          <li key={i.id}>
            <a href={`#${i.id}`} aria-current={current === i.id ? 'location' : undefined}
              className={cn('-ml-px block border-l py-1.5 pl-4 text-[13.5px] no-underline transition-colors pointer-coarse:flex pointer-coarse:min-h-11 pointer-coarse:items-center',
                current === i.id ? 'border-ui-measured text-ui-ink' : 'border-transparent text-ui-graphite hover:text-ui-ink')}>
              {i.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
