import { describe, expect, it } from 'vitest';
import { detectChanges } from './feed.js';
import type { Article, TrackingData } from './config.js';

function buildArticle(overrides: Partial<Article>): Article {
  return {
    id: 'default-id',
    title: 'Default title',
    date: new Date('2026-02-24T12:00:00.000Z'),
    link: 'https://www.karlsruhe.de/default',
    description: 'Default description',
    content: '<p>Default content</p>',
    ...overrides,
  };
}

describe('detectChanges', () => {
  it('classifies new, updated, and unchanged entries and updates tracking shape', () => {
    const newArticle = buildArticle({
      id: 'new-id',
      link: 'https://www.karlsruhe.de/new',
    });
    const updatedArticle = buildArticle({
      id: 'updated-id',
      link: 'https://www.karlsruhe.de/updated-new-link',
    });
    const unchangedArticle = buildArticle({
      id: 'unchanged-id',
      link: 'https://www.karlsruhe.de/unchanged',
    });

    const tracking: TrackingData = {
      'updated-id': {
        contentHash: 'updated-id',
        lastSeen: '2026-02-20T00:00:00.000Z',
        link: 'https://www.karlsruhe.de/updated-old-link',
      },
      'unchanged-id': {
        contentHash: 'unchanged-id',
        lastSeen: '2026-02-20T00:00:00.000Z',
        link: 'https://www.karlsruhe.de/unchanged',
      },
    };

    const result = detectChanges([newArticle, updatedArticle, unchangedArticle], tracking);

    expect(result.newArticles).toHaveLength(1);
    expect(result.updated).toHaveLength(1);
    expect(result.unchanged).toBe(1);
    expect(result.updatedTracking['new-id']).toMatchObject({
      contentHash: 'new-id',
      link: 'https://www.karlsruhe.de/new',
    });
    expect(result.updatedTracking['updated-id']).toMatchObject({
      contentHash: 'updated-id',
      link: 'https://www.karlsruhe.de/updated-new-link',
    });
    expect(result.updatedTracking['unchanged-id']).toMatchObject({
      contentHash: 'unchanged-id',
      link: 'https://www.karlsruhe.de/unchanged',
    });

    for (const id of ['new-id', 'updated-id', 'unchanged-id']) {
      expect(new Date(result.updatedTracking[id].lastSeen).toString()).not.toBe('Invalid Date');
    }
  });
});
