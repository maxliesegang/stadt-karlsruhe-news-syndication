/**
 * Web scraping and content extraction
 * Handles fetching, parsing, and extracting article content
 */

import { ofetch } from 'ofetch';
import * as cheerio from 'cheerio';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import { createHash } from 'node:crypto';
import { CONFIG, type Article } from './config.js';

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

export function parseGermanDate(text: string): Date {
  const now = new Date();
  const trimmed = text.trim();

  // Relative dates: "vor X Stunden/Minuten/Tagen"
  const hoursMatch = trimmed.match(/vor\s+(\d+)\s+Stunde(n)?/i);
  if (hoursMatch) {
    const hours = parseInt(hoursMatch[1], 10);
    return new Date(now.getTime() - hours * 3600000);
  }

  const minutesMatch = trimmed.match(/vor\s+(\d+)\s+Minute(n)?/i);
  if (minutesMatch) {
    const minutes = parseInt(minutesMatch[1], 10);
    return new Date(now.getTime() - minutes * 60000);
  }

  const daysMatch = trimmed.match(/vor\s+(\d+)\s+Tag(en)?/i);
  if (daysMatch) {
    const days = parseInt(daysMatch[1], 10);
    return new Date(now.getTime() - days * 86400000);
  }

  // "Gestern" = yesterday
  if (/gestern/i.test(trimmed)) {
    return new Date(now.getTime() - 86400000);
  }

  // "Heute" = today
  if (/heute/i.test(trimmed)) {
    return now;
  }

  // Absolute date: "15. Januar 2024"
  const monthNameMatch = trimmed.match(/(\d{1,2})\.\s+([a-zäöüß]+)\s+(\d{4})/i);
  if (monthNameMatch) {
    const [, day, monthName, year] = monthNameMatch;
    const month = CONFIG.GERMAN_MONTHS[monthName];
    if (month !== undefined) {
      return new Date(parseInt(year, 10), month, parseInt(day, 10));
    }
  }

  // Numeric date: "15.01.2024"
  const numericMatch = trimmed.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (numericMatch) {
    const [, day, month, year] = numericMatch;
    return new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
  }

  // ISO date: "2024-01-15"
  const isoMatch = trimmed.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
  }

  console.warn(`  Could not parse date "${trimmed}", using current time`);
  return now;
}

// ============================================================================
// URL NORMALIZATION
// ============================================================================

export function normalizeLink(link: string): string {
  if (!link) return '';
  if (link.startsWith('http')) return link;
  if (link.startsWith('/')) return `${CONFIG.BASE_URL}${link}`;

  try {
    return new URL(link, CONFIG.SOURCE_URL).href;
  } catch {
    return '';
  }
}

// ============================================================================
// CONTENT EXTRACTION
// ============================================================================

export function extractContent(html: string, url: string): string {
  // Primary method: Mozilla Readability
  try {
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (article?.content) {
      const content = article.content.trim();
      if (content.length > 100) {
        console.log(`  ✓ Extracted ${content.length} chars via Readability`);
        return content;
      }
    }

    // Readability returned only textContent
    if (article?.textContent) {
      const paragraphs = article.textContent
        .trim()
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => `<p>${p.replace(/\s+/g, ' ')}</p>`)
        .join('');

      if (paragraphs.length > 100) {
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
  $('script, style').remove();

  // Try preferred containers
  const preferredContainers = ['article', 'main', '.news', '.content'];
  for (const selector of preferredContainers) {
    const content = $(selector).first().html();
    if (content && content.length > 100) {
      console.log(`  ✓ Extracted ${content.length} chars via ${selector}`);
      return content.trim();
    }
  }

  // Last resort: body
  const body = $('body').html();
  if (body && body.length > 100) {
    console.log(`  ✓ Extracted ${body.length} chars from body`);
    return body.trim();
  }

  throw new Error('Could not extract meaningful content');
}

// ============================================================================
// ID GENERATION
// ============================================================================

export function generateId(content: string, date: Date): string {
  const dateStr = date.toISOString().split('T')[0];
  const hashInput = `${dateStr}|${content}`;
  return createHash('md5').update(hashInput).digest('hex');
}

// ============================================================================
// ARTICLE PARSING
// ============================================================================

export async function scrapeArticles(html: string): Promise<Article[]> {
  const $ = cheerio.load(html);

  // Find article elements
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let elements: cheerio.Cheerio<any> | null = null;
  for (const selector of CONFIG.SELECTORS.articles) {
    const found = $(selector);
    if (found.length > 0) {
      console.log(`Found ${found.length} articles with selector: ${selector}`);
      elements = found;
      break;
    }
  }

  if (!elements || elements.length === 0) {
    throw new Error('No articles found - HTML structure may have changed');
  }

  const articles: Article[] = [];

  // Process each article element
  for (let i = 0; i < elements.length; i++) {
    const el = elements.eq(i);

    try {
      // Extract title
      let title = '';
      for (const sel of CONFIG.SELECTORS.title) {
        title = el.find(sel).first().text().trim();
        if (title) break;
      }
      if (!title) {
        console.log(`  [${i + 1}] Skipping: no title found`);
        continue;
      }

      // Extract link
      const rawLink = el.find('a').first().attr('href') || '';
      const link = normalizeLink(rawLink);
      if (!link) {
        console.log(`  [${i + 1}] Skipping "${title}": invalid link`);
        continue;
      }

      // Extract description
      let description = '';
      for (const sel of CONFIG.SELECTORS.description) {
        description = el.find(sel).first().text().trim();
        if (description) break;
      }

      // Extract date
      let dateText = el.find('time[datetime]').first().attr('datetime') || '';
      if (!dateText) {
        for (const sel of CONFIG.SELECTORS.date) {
          dateText = el.find(sel).first().text().trim();
          if (dateText) break;
        }
      }
      const date = parseGermanDate(dateText || el.text());

      // Fetch detail page and extract content
      console.log(`[${i + 1}/${elements.length}] ${title}`);
      const detailHtml = await fetchHtml(link);
      const content = extractContent(detailHtml, link);
      const id = generateId(content, date);

      articles.push({ id, title, date, link, description, content });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`  ✗ Failed: ${message}`);
      continue;
    }
  }

  console.log(`\n✓ Successfully scraped ${articles.length}/${elements.length} articles\n`);
  return articles;
}
