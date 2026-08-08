/**
 * Web scraping
 * Handles fetching, parsing, and assembling articles from the listing page
 */

import { ofetch } from 'ofetch';
import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import { CONFIG, type Article } from './config.js';
import { parseGermanDate } from './date.js';
import { resolveHttpUrl } from './url.js';
import { extractContent } from './extractor.js';
import { errorMessage } from './errors.js';
import { md5 } from './hash.js';

type ListingCandidate = Omit<Article, 'id' | 'content'> & { position: number };

const RETRYABLE_HTTP_STATUSES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

// ============================================================================
// HTTP FETCHING
// ============================================================================

export async function fetchHtml(url: string): Promise<string> {
  console.log(`Fetching ${url}...`);

  const maxAttempts = CONFIG.HTTP.maxRetries + 1;
  let lastError: unknown;
  let attemptsMade = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    attemptsMade = attempt;
    try {
      // Retry explicitly so every timeout gets a fresh AbortSignal. ofetch's
      // built-in recursive retry can otherwise reuse the already-aborted signal.
      const html = await ofetch<string>(url, {
        headers: {
          accept: 'text/html,application/xhtml+xml',
          'user-agent': CONFIG.HTTP.userAgent,
        },
        retry: false,
        timeout: CONFIG.HTTP.timeout,
      });
      console.log(`  ✓ Fetched ${Math.round(html.length / 1024)}KB`);
      return html;
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts || !isRetryableFetchError(error)) {
        break;
      }

      const retryDelay = CONFIG.HTTP.retryBaseDelay * 2 ** (attempt - 1);
      console.warn(
        `  ! Attempt ${attempt}/${maxAttempts} failed: ${errorMessage(error)}. ` +
          `Retrying in ${Math.round(retryDelay / 1000)}s...`
      );
      await wait(retryDelay);
    }
  }

  throw new Error(
    `Failed to fetch ${url} after ${attemptsMade} ${attemptsMade === 1 ? 'attempt' : 'attempts'}: ${errorMessage(lastError)}`,
    { cause: lastError }
  );
}

function isRetryableFetchError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return true;

  const response = (error as { response?: { status?: unknown } }).response;
  if (!response || typeof response.status !== 'number') return true;

  return RETRYABLE_HTTP_STATUSES.has(response.status);
}

function wait(duration: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, duration));
}

// ============================================================================
// URL NORMALIZATION
// ============================================================================

export function normalizeArticleLink(link: string): string {
  return resolveHttpUrl(link, CONFIG.SOURCE_URL) ?? '';
}

// ============================================================================
// ID GENERATION
// ============================================================================

// Identity is derived from the article's stable URL, not its content, so that
// editing an article's body is detected as an *update* (see feed.detectChanges)
// rather than producing a brand-new entry each time the text changes.
export function createArticleId(link: string): string {
  return md5(link);
}

// ============================================================================
// ARTICLE PARSING
// ============================================================================

function firstNonEmptyText(
  element: cheerio.Cheerio<Element>,
  selectors: readonly string[]
): string {
  for (const selector of selectors) {
    const text = element.find(selector).first().text().trim();
    if (text) {
      return text;
    }
  }

  return '';
}

function findArticleElements($: cheerio.CheerioAPI): cheerio.Cheerio<Element> {
  for (const selector of CONFIG.SELECTORS.articles) {
    const elements = $(selector);
    if (elements.length > 0) {
      console.log(`Found ${elements.length} articles with selector: ${selector}`);
      return elements;
    }
  }

  throw new Error('No articles found - HTML structure may have changed');
}

function parseListingCandidate(
  element: cheerio.Cheerio<Element>,
  position: number
): ListingCandidate | null {
  const title = firstNonEmptyText(element, CONFIG.SELECTORS.title);
  if (!title) {
    console.log(`  [${position}] Skipping: no title found`);
    return null;
  }

  const rawLink = element.find('a').first().attr('href') ?? '';
  const link = normalizeArticleLink(rawLink);
  if (!link) {
    console.log(`  [${position}] Skipping "${title}": invalid link`);
    return null;
  }

  const description = firstNonEmptyText(element, CONFIG.SELECTORS.description);
  const dateText =
    element.find('time[datetime]').first().attr('datetime') ||
    firstNonEmptyText(element, CONFIG.SELECTORS.date) ||
    element.text();
  const publishedAt = parseGermanDate(dateText);

  return { position, title, publishedAt, link, description };
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T) => Promise<R | null>
): Promise<R[]> {
  if (items.length === 0) return [];

  const workerCount = Math.min(Math.max(1, concurrency), items.length);
  const results: Array<R | null> = new Array(items.length).fill(null);
  let cursor = 0;

  const worker = async (): Promise<void> => {
    while (cursor < items.length) {
      const index = cursor++;
      const item = items[index];
      if (item !== undefined) {
        results[index] = await mapper(item);
      }
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results.filter((result): result is R => result !== null);
}

export async function scrapeArticles(html: string): Promise<Article[]> {
  const $ = cheerio.load(html);
  const elements = findArticleElements($);

  const parsedCandidates = elements
    .toArray()
    .map((el, i) => parseListingCandidate($(el), i + 1))
    .filter((c): c is ListingCandidate => c !== null);

  if (parsedCandidates.length === 0) {
    throw new Error('No valid article entries found');
  }

  console.log(
    `Processing ${parsedCandidates.length} detail pages (concurrency: ${CONFIG.SCRAPER.concurrency})`
  );

  const articles = await mapWithConcurrency(
    parsedCandidates,
    CONFIG.SCRAPER.concurrency,
    async (candidate) => {
      try {
        console.log(`[${candidate.position}/${elements.length}] ${candidate.title}`);
        const detailHtml = await fetchHtml(candidate.link);
        const content = extractContent(detailHtml, candidate.link);
        const id = createArticleId(candidate.link);

        return {
          id,
          title: candidate.title,
          publishedAt: candidate.publishedAt,
          link: candidate.link,
          description: candidate.description,
          content,
        };
      } catch (error) {
        console.warn(`  ✗ Failed "${candidate.title}": ${errorMessage(error)}`);
        return null;
      }
    }
  );

  console.log(`\n✓ Successfully scraped ${articles.length}/${elements.length} articles\n`);
  return articles;
}
