import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateId, normalizeLink, parseGermanDate } from './scraper.js';

describe('parseGermanDate', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('parses absolute German month names case-insensitively', () => {
    const parsed = parseGermanDate('15. März 2024');

    expect(parsed.getFullYear()).toBe(2024);
    expect(parsed.getMonth()).toBe(2);
    expect(parsed.getDate()).toBe(15);
  });

  it('parses relative hour values', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-24T12:00:00.000Z'));

    const parsed = parseGermanDate('vor 2 Stunden');

    expect(parsed.toISOString()).toBe('2026-02-24T10:00:00.000Z');
  });
});

describe('normalizeLink', () => {
  it('normalizes relative links', () => {
    const normalized = normalizeLink('/aktuelles/testartikel');

    expect(normalized).toBe('https://www.karlsruhe.de/aktuelles/testartikel');
  });

  it('rejects non-http links', () => {
    const normalized = normalizeLink('javascript:alert(1)');

    expect(normalized).toBe('');
  });
});

describe('generateId', () => {
  it('is deterministic for same content and date', () => {
    const date = new Date('2026-02-24T12:00:00.000Z');
    const first = generateId('<p>same</p>', date);
    const second = generateId('<p>same</p>', date);

    expect(first).toBe(second);
  });
});
