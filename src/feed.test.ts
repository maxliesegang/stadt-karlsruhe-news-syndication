import { describe, expect, it } from 'vitest';
import { detectChanges, prepareContentForFeed } from './feed.js';
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

    expect(result.newCount).toBe(1);
    expect(result.updatedCount).toBe(1);
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

describe('prepareContentForFeed', () => {
  it('converts lazy-loaded picture markup into a standard image with absolute URL', () => {
    const input = `
      <picture>
        <source media="(min-width: 0)" data-srcset="/fileadmin/test-image-small.jpg" srcset="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==">
        <img class="lazyload" data-src="/fileadmin/test-image.jpg" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" loading="lazy" decoding="async" alt="Beispielbild">
      </picture>
      <p>Text unter dem Bild</p>
    `;

    const output = prepareContentForFeed(
      input,
      'https://www.karlsruhe.de/stadt-rathaus/aktuelles/test'
    );

    expect(output).not.toContain('<picture');
    expect(output).not.toContain('<source');
    expect(output).toContain('<img');
    expect(output).toContain('src="https://www.karlsruhe.de/fileadmin/test-image.jpg"');
    expect(output).not.toContain('data:image/gif;base64');
    expect(output).toContain('<p>Text unter dem Bild</p>');
  });

  it('normalizes relative links in article content', () => {
    const input = `<p><a href="/service/info">Mehr erfahren</a></p>`;

    const output = prepareContentForFeed(
      input,
      'https://www.karlsruhe.de/stadt-rathaus/aktuelles/test'
    );

    expect(output).toContain('href="https://www.karlsruhe.de/service/info"');
  });
});
