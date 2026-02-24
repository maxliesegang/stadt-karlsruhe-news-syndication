/**
 * Web scraping and content extraction
 * Handles fetching, parsing, and extracting article content
 */

import { ofetch } from 'ofetch';
import * as cheerio from 'cheerio';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import { createHash } from 'node:crypto';
import type { Element } from 'domhandler';
import { CONFIG, type Article } from './config.js';

type ListingCandidate = Omit<Article, 'id' | 'content'> & { position: number };

const RELATIVE_DATE_PATTERNS = [
  { pattern: /vor\s+(\d+)\s+stunde(n)?/i, milliseconds: 60 * 60 * 1000 },
  { pattern: /vor\s+(\d+)\s+minute(n)?/i, milliseconds: 60 * 1000 },
  { pattern: /vor\s+(\d+)\s+tag(en)?/i, milliseconds: 24 * 60 * 60 * 1000 },
] as const;

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
// GERMAN DATE PARSING
// ============================================================================

function parseRelativeDate(text: string, now: Date): Date | null {
  for (const { pattern, milliseconds } of RELATIVE_DATE_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;

    const amount = Number.parseInt(match[1], 10);
    if (Number.isNaN(amount)) continue;

    return new Date(now.getTime() - amount * milliseconds);
  }

  return null;
}

function isValidDate(value: Date): boolean {
  return !Number.isNaN(value.getTime());
}

export function parseGermanDate(text: string): Date {
  const now = new Date();
  const trimmed = text.trim();

  if (!trimmed) {
    console.warn('  Could not parse empty date, using current time');
    return now;
  }

  const relativeDate = parseRelativeDate(trimmed, now);
  if (relativeDate) return relativeDate;

  // "Gestern" = yesterday
  if (/gestern/i.test(trimmed)) {
    return new Date(now.getTime() - 24 * 60 * 60 * 1000);
  }

  // "Heute" = today
  if (/heute/i.test(trimmed)) {
    return now;
  }

  // Absolute date: "15. Januar 2024"
  const monthNameMatch = trimmed.match(/(\d{1,2})\.\s+([a-zäöüß]+)\s+(\d{4})/i);
  if (monthNameMatch) {
    const day = Number.parseInt(monthNameMatch[1], 10);
    const monthName = monthNameMatch[2].toLocaleLowerCase('de-DE');
    const year = Number.parseInt(monthNameMatch[3], 10);
    const month = CONFIG.GERMAN_MONTHS[monthName];

    if (month !== undefined) {
      return new Date(year, month, day);
    }
  }

  // Numeric date: "15.01.2024"
  const numericMatch = trimmed.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (numericMatch) {
    const day = Number.parseInt(numericMatch[1], 10);
    const month = Number.parseInt(numericMatch[2], 10) - 1;
    const year = Number.parseInt(numericMatch[3], 10);
    return new Date(year, month, day);
  }

  // ISO date and all parsable browser formats
  const parsed = new Date(trimmed);
  if (isValidDate(parsed)) {
    return parsed;
  }

  console.warn(`  Could not parse date "${trimmed}", using current time`);
  return now;
}

// ============================================================================
// URL NORMALIZATION
// ============================================================================

export function normalizeLink(link: string): string {
  const trimmed = link.trim();
  if (!trimmed) return '';

  try {
    const normalized = new URL(trimmed, CONFIG.SOURCE_URL);
    if (normalized.protocol !== 'http:' && normalized.protocol !== 'https:') {
      return '';
    }
    return normalized.href;
  } catch {
    return '';
  }
}

// ============================================================================
// CONTENT EXTRACTION
// ============================================================================

function hasMeaningfulContent(content: string): boolean {
  return content.trim().length >= CONFIG.SCRAPER.minContentLength;
}

function textContentToParagraphs(text: string): string {
  return text
    .trim()
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${paragraph.replace(/\s+/g, ' ')}</p>`)
    .join('');
}

export function extractContent(html: string, url: string): string {
  // Primary method: Mozilla Readability
  try {
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (article?.content) {
      const content = article.content.trim();
      if (hasMeaningfulContent(content)) {
        console.log(`  ✓ Extracted ${content.length} chars via Readability`);
        return content;
      }
    }

    // Readability returned only textContent
    if (article?.textContent) {
      const paragraphs = textContentToParagraphs(article.textContent);

      if (hasMeaningfulContent(paragraphs)) {
        console.log(`  ✓ Extracted ${paragraphs.length} chars via Readability (text mode)`);
        return paragraphs;
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`  Readability failed: ${message}`);
  }

  // Fallback: Cheerio-based extraction
  console.log('  Using cheerio fallback...');
  const $ = cheerio.load(html);

  // Remove unwanted elements for safety
  $('script, style, noscript').remove();

  // Try preferred containers
  for (const selector of CONFIG.SELECTORS.contentContainers) {
    const content = $(selector).first().html()?.trim();
    if (content && hasMeaningfulContent(content)) {
      console.log(`  ✓ Extracted ${content.length} chars via ${selector}`);
      return content;
    }
  }

  // Last resort: body
  const body = $('body').html()?.trim();
  if (body && hasMeaningfulContent(body)) {
    console.log(`  ✓ Extracted ${body.length} chars from body`);
    return body;
  }

  throw new Error('Could not extract meaningful content');
}

// ============================================================================
// ID GENERATION
// ============================================================================

export function generateId(content: string, date: Date): string {
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
  const link = normalizeLink(rawLink);
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

  return {
    position,
    title,
    date,
    link,
    description,
  };
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
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) {
        return;
      }
      results[index] = await mapper(items[index]);
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results.filter((result): result is R => result !== null);
}

export async function scrapeArticles(html: string): Promise<Article[]> {
  const $ = cheerio.load(html);
  const elements = findArticleElements($);
  const parsedCandidates: ListingCandidate[] = [];

  for (let i = 0; i < elements.length; i += 1) {
    const candidate = parseListingCandidate(elements.eq(i), i + 1);
    if (candidate) {
      parsedCandidates.push(candidate);
    }
  }

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
        const id = generateId(content, candidate.date);

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
