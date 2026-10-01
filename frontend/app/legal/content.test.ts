import { describe, it, expect } from 'vitest';
import { TERMS_SECTIONS, PRIVACY_SECTIONS, LEGAL_UPDATED, contactLine } from './content';

const allText = (sections: { heading: string; body: string[] }[]) =>
  sections.flatMap(s => [s.heading, ...s.body]).join('\n');

describe('legal content', () => {
  it('has unique section ids so the pages can anchor to them', () => {
    for (const sections of [TERMS_SECTIONS, PRIVACY_SECTIONS]) {
      const ids = sections.map(s => s.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.every(id => /^[a-z-]+$/.test(id))).toBe(true);
    }
  });

  it('has a plain ISO last-updated date', () => {
    expect(LEGAL_UPDATED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('ships no placeholders', () => {
    for (const sections of [TERMS_SECTIONS, PRIVACY_SECTIONS]) {
      expect(allText(sections)).not.toMatch(/TODO|TBD|lorem|\[[A-Za-z ]+\]|YOURDOMAIN/i);
    }
  });

  it('terms keep the product boundary: past execution only, never advice', () => {
    const text = allText(TERMS_SECTIONS).toLowerCase();
    expect(text).toContain('not financial advice');
    expect(text).toMatch(/past|historical/);
    expect(text).toContain('read-only');
    expect(text).toMatch(/does not (place|execute)/);
  });

  it('privacy policy names the data actually handled', () => {
    const text = allText(PRIVACY_SECTIONS).toLowerCase();
    for (const term of ['email', 'api key', 'aes-256-gcm', 'trade history', 'cookie', 'groq', 'delete']) {
      expect(text).toContain(term);
    }
  });

  it('privacy policy says what is and is not sent to the language model', () => {
    const text = allText(PRIVACY_SECTIONS).toLowerCase();
    expect(text).toMatch(/aggregated/);
    expect(text).toMatch(/never (sent|include)|not sent|no api keys/);
  });

  it('contactLine uses the configured address, else points at the issue tracker', () => {
    expect(contactLine('help@example.org')).toContain('help@example.org');
    expect(contactLine(undefined)).toMatch(/issue/i);
    expect(contactLine('')).toMatch(/issue/i);
  });
});
