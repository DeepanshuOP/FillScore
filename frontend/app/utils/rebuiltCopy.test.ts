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
  // Design v3 "Tape & Receipt" (2026-11-20): Cabinet Grotesk is set with tight NEGATIVE tracking; uppercase and widened
  // tracking belong only to the printer's type (Departure Mono, the receipt's labels), so they must sit on a line that
  // sets font-mono. The v2 ban on every uppercase label is replaced by this rule (DESIGN.md, "Type").
  const printed = (l: { text: string }) => /font-mono|\bmono\b/.test(l.text)
  it('uppercase and widened letter-spacing only in the printer type (font-mono on the same line)', () => {
    expect(hits(/\buppercase\b|text-transform|tracking-(wide|wider|widest)\b|tracking-\[0?\.?[1-9]|tracking-\[0\.0*[1-9]|letterSpacing|letter-spacing/, code.filter((l) => !printed(l)))).toEqual([]);
  });
  it('outside the printer type, tracking is negative only (or the reset tracking-normal)', () => {
    expect(hits(/tracking-(?!\[-|normal\b)/, code.filter((l) => !printed(l)))).toEqual([]);
  });
  it('no arrow or decorative glyph in copy', () => {
    expect(hits(/[→↗↘←▶◈◆◉⬡⚖✓]/)).toEqual([]);
  });
  it('no "A · B · C" separator in a string or in text', () => {
    // One line is exempt because the order of 2026-11-23 (sixth, step 3) fixes its wording: askView.ts "Model calls: N · answer not used".
    // A second line is exempt by design v5 (PROPOSAL §3.6, invariant I5): the provenance banner's fixed words, "Demo account · synthetic
    // trader, real Binance prices · read-only". The ban keeps its intent everywhere else: no decorative "A · B · C" in copy.
    const scanned = code.filter((l) => !/Model calls: \$\{[^}]+\} · answer not used/.test(l.text) && !/Demo account<\/strong> · synthetic trader, real Binance prices · read-only/.test(l.text));
    expect(hits(/\S ·  ?\S|\S  · \S/, scanned)).toEqual([]);
    expect(hits(/['"`>][^'"`<>]* · [^'"`<>]*['"`<]/, scanned)).toEqual([]);
  });
  it('no inline colour, no hex literal, no old token or font variable', () => {
    expect(hits(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![0-9a-fA-F])|rgba?\(/, code.filter((l) => !/\.ts$/.test(l.f) || /Panel|Headline/.test(l.f)))).toEqual([]);
    expect(hits(/var\(--(bg|text|gold|green|red|font-(inter|playfair|mono))/)).toEqual([]);
  });
  it('no entrance animation and no pulse', () => {
    expect(hits(/anim-fadein|form-enter|animate-pulse|animate-ping|pulse-dot|shimmer|animation:/)).toEqual([]);
  });
});
