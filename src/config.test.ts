import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function loadConfig() {
  vi.resetModules();
  return (await import('./config.js')).CONFIG;
}

describe('CONFIG', () => {
  it('loads scraper settings from positive integer environment values', async () => {
    vi.stubEnv('SCRAPER_CONCURRENCY', '8');
    vi.stubEnv('MIN_CONTENT_LENGTH', '250');

    const config = await loadConfig();

    expect(config.SCRAPER).toEqual({ concurrency: 8, minContentLength: 250 });
  });

  it('uses defaults for partial, unsafe, or out-of-range integers', async () => {
    vi.stubEnv('MAX_ARTICLES', '10items');
    vi.stubEnv('HTTP_MAX_RETRIES', '-1');
    vi.stubEnv('HTTP_TIMEOUT_MS', '1.5');

    const config = await loadConfig();

    expect(config.MAX_ARTICLES).toBe(100);
    expect(config.HTTP.maxRetries).toBe(3);
    expect(config.HTTP.timeout).toBe(30_000);
  });

  it('derives the GitHub Pages feed URL when no explicit URL is set', async () => {
    vi.stubEnv('FEED_URL', '');
    vi.stubEnv('GITHUB_USERNAME', 'example-user');

    const config = await loadConfig();

    expect(config.FEED.url).toBe(
      'https://example-user.github.io/stadt-karlsruhe-news-syndication/feed.atom'
    );
  });
});
