import { describe, expect, it } from 'vitest';
import { parseGermanDate } from './date.js';

describe('parseGermanDate', () => {
  it('parses absolute German month names to UTC midnight (timezone-independent)', () => {
    const parsed = parseGermanDate('15. März 2024');

    expect(parsed.toISOString()).toBe('2024-03-15T00:00:00.000Z');
  });

  it('parses numeric dates to UTC midnight', () => {
    const parsed = parseGermanDate('15.01.2024');

    expect(parsed.toISOString()).toBe('2024-01-15T00:00:00.000Z');
  });

  it('parses relative hour values against the injected now', () => {
    const now = new Date('2026-02-24T12:00:00.000Z');

    const parsed = parseGermanDate('vor 2 Stunden', now);

    expect(parsed.toISOString()).toBe('2026-02-24T10:00:00.000Z');
  });

  it('falls back to the injected now for unparseable input (no hidden Date.now)', () => {
    const now = new Date('2026-02-24T12:00:00.000Z');

    const parsed = parseGermanDate('kein gültiges Datum', now);

    expect(parsed.toISOString()).toBe(now.toISOString());
  });
});
