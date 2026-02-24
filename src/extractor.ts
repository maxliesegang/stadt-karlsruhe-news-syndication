/**
 * Content extraction
 * Extracts article body HTML from a full page HTML string
 */

import * as cheerio from 'cheerio';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import { CONFIG } from './config.js';

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

    // Strip noise elements (copyright credits, etc.) before Readability runs
    for (const selector of CONFIG.SELECTORS.noiseElements) {
      dom.window.document.querySelectorAll(selector).forEach((el) => el.remove());
    }

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
