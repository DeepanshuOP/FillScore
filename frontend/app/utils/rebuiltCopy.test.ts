import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { REBUILT_FILES } from './rebuiltFiles';

/**
 * Copy and style rules of the rebuilt screens (orders of 2026-11-20): sentence case, no uppercase eyebrow labels, no
 * "A · B · C" strings, no arrow glyph appended to a link or a button, no inline colours, no old font variables, no
 * entrance animation. A rule that a file breaks fails with the line.
 */
const lines = (f: string) => readFileSync(join(process.cwd(), f), 'utf8').split('\n').map((text, i) => ({ f, n: i + 1, text }));
const all = REBUILT_FILES.flatMap(lines);
const code = all.filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l.text));   // comments may name a banned thing to explain it

const hits = (re: RegExp, src = code) => src.filter((l) => re.test(l.text)).map((l) => `${l.f}:${l.n}: ${l.text.trim().slice(0, 100)}`);

describe('rebuilt screens', () => {
  // Design v2 (2026-11-20): DESIGN.md expresses type through tight NEGATIVE tracking, so `tracking-[-0.02em]` is allowed;
  // uppercase and any widened tracking (the eyebrow-label look) stay banned.
  it('no uppercase text and no widened letter-spacing', () => {
    expect(hits(/\buppercase\b|text-transform|tracking-(wide|wider|widest)\b|tracking-\[0?\.?[1-9]|tracking-\[0\.0*[1-9]|letterSpacing|letter-spacing/)).toEqual([]);
  });
  it('negative tracking only: every tracking utility is a negative bracket value (or the reset tracking-normal)', () => {
    expect(hits(/tracking-(?!\[-|normal\b)/)).toEqual([]);
  });
  it('no arrow or decorative glyph in copy', () => {
    expect(hits(/[→↗↘←▶◈◆◉⬡⚖✓]/)).toEqual([]);
  });
  it('no "A · B · C" separator in a string or in text', () => {
    expect(hits(/\S ·  ?\S|\S  · \S/)).toEqual([]);
    expect(hits(/['"`>][^'"`<>]* · [^'"`<>]*['"`<]/)).toEqual([]);
  });
  it('no inline colour, no hex literal, no old token or font variable', () => {
    expect(hits(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![0-9a-fA-F])|rgba?\(/, code.filter((l) => !/\.ts$/.test(l.f) || /Panel|Headline/.test(l.f)))).toEqual([]);
    expect(hits(/var\(--(bg|text|gold|green|red|font-(inter|playfair|mono))/)).toEqual([]);
  });
  it('no entrance animation and no pulse', () => {
    expect(hits(/anim-fadein|form-enter|animate-pulse|animate-ping|pulse-dot|shimmer|animation:/)).toEqual([]);
  });
});
