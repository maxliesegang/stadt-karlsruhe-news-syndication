import { ofetch } from 'ofetch';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONFIG } from './config.js';
import { createArticleId, fetchHtml, normalizeArticleLink } from './scraper.js';

vi.mock('ofetch', () => ({ ofetch: vi.fn() }));

const mockedFetch = vi.mocked(ofetch);

afterEach(() => {
  mockedFetch.mockReset();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('fetchHtml', () => {
  it('retries a timeout with a fresh request', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const timeoutError = new Error('The operation was aborted due to timeout');
    timeoutError.name = 'TimeoutError';
    mockedFetch.mockRejectedValueOnce(timeoutError).mockResolvedValueOnce('<html>ok</html>');

    const result = fetchHtml('https://example.com');
    await vi.advanceTimersByTimeAsync(CONFIG.HTTP.retryBaseDelay);

    await expect(result).resolves.toBe('<html>ok</html>');
    expect(mockedFetch).toHaveBeenCalledTimes(2);
    expect(mockedFetch).toHaveBeenNthCalledWith(
      2,
      'https://example.com',
      expect.objectContaining({ retry: false, timeout: CONFIG.HTTP.timeout })
    );
  });

  it('does not retry a permanent HTTP error', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const notFoundError = Object.assign(new Error('Not Found'), {
      response: { status: 404 },
    });
    mockedFetch.mockRejectedValueOnce(notFoundError);

    await expect(fetchHtml('https://example.com/missing')).rejects.toThrow(
      'Failed to fetch https://example.com/missing'
    );
    expect(mockedFetch).toHaveBeenCalledOnce();
  });
});

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
