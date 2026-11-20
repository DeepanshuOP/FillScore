import React from 'react';
import { NOT_COMPUTED } from '../utils/notComputed';
import { ValueState } from '../ui/ValueState';

/** Placeholder for a v1-only view of a rebuilt demo (decision 11). Never a zero, never an empty panel. */
export default function NotComputed({ title, detail }: { title: string; detail?: string }) {
  return (
    <section
      data-testid="not-computed"
      aria-label={`${title}: ${NOT_COMPUTED}`}
      className="panel flex flex-col gap-2 p-5"
    >
      <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-ui-ink">{title}</h3>
      <div className="text-[13px] leading-5 text-ui-graphite">
        <ValueState state="not-computed" size="inline" label={title} reason={detail} />
      </div>
    </section>
  );
}
