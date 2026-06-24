/**
 * Web scraping
 * Handles fetching, parsing, and assembling articles from the listing page
 */

import { ofetch } from 'ofetch';
import * as cheerio from 'cheerio';
import { createHash } from 'node:crypto';
import type { Element } from 'domhandler';
import { CONFIG, type Article } from './config.js';
import { parseGermanDate } from './date.js';
import { resolveHttpUrl } from './url.js';
import { extractContent } from './extractor.js';

type ListingCandidate = Omit<Article, 'id' | 'content'> & { position: number };

// ============================================================================
// HTTP FETCHING
// ============================================================================

export async function fetchHtml(url: string): Promise<string> {
  console.log(`Fetching ${url}...`);
  try {
    const html = await ofetch<string>(url, {
      retry: CONFIG.HTTP.maxRetries,
      retryDelay: CONFIG.HTTP.retryDelay,
      timeout: CONFIG.HTTP.timeout,
    });
    console.log(`  ✓ Fetched ${Math.round(html.length / 1024)}KB`);
    return html;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to fetch ${url}: ${message}`, { cause: error });
  }
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

export function createArticleId(content: string, date: Date): string {
  const dateStr = date.toISOString().slice(0, 10);
  const hashInput = `${dateStr}|${content}`;
  return createHash('md5').update(hashInput).digest('hex');
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
  const date = parseGermanDate(dateText);

  return { position, title, date, link, description };
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
      results[index] = await mapper(items[index]);
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
        const id = createArticleId(content, candidate.date);

        return {
          id,
          title: candidate.title,
          date: candidate.date,
          link: candidate.link,
          description: candidate.description,
          content,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`  ✗ Failed "${candidate.title}": ${message}`);
        return null;
      }
    }
  );

  console.log(`\n✓ Successfully scraped ${articles.length}/${elements.length} articles\n`);
  return articles;
}
