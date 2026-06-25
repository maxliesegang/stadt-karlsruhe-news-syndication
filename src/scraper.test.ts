import { describe, expect, it } from 'vitest';
import { createArticleId, normalizeArticleLink } from './scraper.js';

describe('normalizeArticleLink', () => {
  it('normalizes relative links', () => {
    const normalized = normalizeArticleLink('/aktuelles/testartikel');

    expect(normalized).toBe('https://www.karlsruhe.de/aktuelles/testartikel');
  });

  it('rejects non-http links', () => {
    const normalized = normalizeArticleLink('javascript:alert(1)');

    expect(normalized).toBe('');
  });
});

describe('createArticleId', () => {
  it('is deterministic for the same link', () => {
    const link = 'https://www.karlsruhe.de/aktuelles/testartikel';

    expect(createArticleId(link)).toBe(createArticleId(link));
  });

  it('is independent of content so edits keep a stable identity', () => {
    const link = 'https://www.karlsruhe.de/aktuelles/testartikel';

    expect(createArticleId(link)).not.toBe(
      createArticleId('https://www.karlsruhe.de/aktuelles/anderer-artikel')
    );
  });
});
