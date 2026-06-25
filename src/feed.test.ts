import { describe, expect, it } from 'vitest';
import { detectChanges, prepareContentForFeed, pruneTracking, renderAtomFeed } from './feed.js';
import { md5 } from './hash.js';
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
  it('classifies new, updated, and unchanged entries from the content hash', () => {
    const unchangedContent = '<p>unchanged content</p>';
    const editedContent = '<p>freshly edited content</p>';

    const newArticle = buildArticle({
      id: 'new-id',
      link: 'https://www.karlsruhe.de/new',
    });
    const updatedArticle = buildArticle({
      id: 'updated-id',
      link: 'https://www.karlsruhe.de/updated',
      content: editedContent,
    });
    const unchangedArticle = buildArticle({
      id: 'unchanged-id',
      link: 'https://www.karlsruhe.de/unchanged',
      content: unchangedContent,
    });

    const priorModified = '2026-06-10T00:00:00.000Z';
    const tracking: TrackingData = {
      'updated-id': {
        contentHash: md5('<p>stale content</p>'),
        lastSeen: '2026-06-20T00:00:00.000Z',
        lastModified: priorModified,
        link: 'https://www.karlsruhe.de/updated',
      },
      'unchanged-id': {
        contentHash: md5(unchangedContent),
        lastSeen: '2026-06-20T00:00:00.000Z',
        lastModified: priorModified,
        link: 'https://www.karlsruhe.de/unchanged',
      },
    };

    const result = detectChanges([newArticle, updatedArticle, unchangedArticle], tracking);

    expect(result.newCount).toBe(1);
    expect(result.updatedCount).toBe(1);
    expect(result.unchangedCount).toBe(1);
    expect(result.prunedCount).toBe(0);

    // Tracking now stores the hash of the article body, not the article id.
    expect(result.updatedTracking['updated-id'].contentHash).toBe(md5(editedContent));
    expect(result.updatedTracking['unchanged-id'].contentHash).toBe(md5(unchangedContent));
    expect(result.updatedTracking['new-id']).toMatchObject({
      contentHash: md5(newArticle.content),
      link: 'https://www.karlsruhe.de/new',
    });

    // lastModified advances only when the body changed; unchanged carries over.
    expect(result.updatedTracking['unchanged-id'].lastModified).toBe(priorModified);
    expect(result.updatedTracking['updated-id'].lastModified).not.toBe(priorModified);
    expect(result.updatedTracking['new-id'].lastModified).not.toBe(priorModified);

    for (const id of ['new-id', 'updated-id', 'unchanged-id']) {
      const { lastSeen, lastModified } = result.updatedTracking[id];
      expect(new Date(lastSeen).toString()).not.toBe('Invalid Date');
      expect(new Date(lastModified).toString()).not.toBe('Invalid Date');
    }
  });
});

describe('pruneTracking', () => {
  it('drops entries older than the retention window and keeps recent ones', () => {
    const now = new Date('2026-06-25T00:00:00.000Z');
    const tracking: TrackingData = {
      stale: {
        contentHash: 'a',
        lastSeen: '2026-01-01T00:00:00.000Z',
        lastModified: '2026-01-01T00:00:00.000Z',
        link: 'https://www.karlsruhe.de/stale',
      },
      fresh: {
        contentHash: 'b',
        lastSeen: '2026-06-24T00:00:00.000Z',
        lastModified: '2026-06-24T00:00:00.000Z',
        link: 'https://www.karlsruhe.de/fresh',
      },
    };

    const { tracking: result, prunedCount } = pruneTracking(tracking, now);

    expect(prunedCount).toBe(1);
    expect(result.stale).toBeUndefined();
    expect(result.fresh).toBeDefined();
  });
});

describe('renderAtomFeed', () => {
  it('is deterministic and drives entry timestamps from tracked lastModified', () => {
    const article = buildArticle({
      id: 'a1',
      link: 'https://www.karlsruhe.de/a1',
      date: new Date('2026-06-01T00:00:00.000Z'),
    });
    const lastModified = '2026-06-18T09:30:00.000Z';
    const tracking: TrackingData = {
      a1: {
        contentHash: md5(article.content),
        lastSeen: '2026-06-24T00:00:00.000Z',
        lastModified,
        link: article.link,
      },
    };

    const first = renderAtomFeed([article], tracking);
    const second = renderAtomFeed([article], tracking);

    // Same inputs → byte-identical output (no wall-clock timestamps leak in).
    expect(first).toBe(second);
    // Entry + feed atom:updated reflect the content-change time, not the run time.
    expect(first).toContain(`<updated>${lastModified}</updated>`);
    // Publish date stays the article's own date.
    expect(first).toContain('<published>2026-06-01T00:00:00.000Z</published>');
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
