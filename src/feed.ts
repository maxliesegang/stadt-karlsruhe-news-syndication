/**
 * Feed generation and article tracking
 * Handles Atom feed creation and change detection
 */

import { Feed } from 'feed';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import * as cheerio from 'cheerio';
import { CONFIG, type Article, type TrackingData } from './config.js';

type ChangeDetectionResult = {
  newCount: number;
  updatedCount: number;
  unchanged: number;
  updatedTracking: TrackingData;
};

function isPlaceholderImage(value: string): boolean {
  return value.trimStart().startsWith('data:image/gif;base64,');
}

function normalizeUrl(value: string, baseUrl: string): string {
  const trimmed = value.trim();

  if (!trimmed || /^(data:|mailto:|tel:|javascript:|#)/i.test(trimmed)) {
    return trimmed;
  }

  try {
    const absolute = new URL(trimmed, baseUrl);
    if (absolute.protocol !== 'http:' && absolute.protocol !== 'https:') {
      return trimmed;
    }
    return absolute.href;
  } catch {
    return trimmed;
  }
}

function firstSrcsetUrl(srcset: string): string {
  const firstCandidate = srcset.split(',')[0]?.trim();
  if (!firstCandidate) return '';
  return firstCandidate.split(/\s+/)[0] ?? '';
}

function normalizeSrcset(srcset: string, baseUrl: string): string {
  const trimmed = srcset.trim();
  if (!trimmed || trimmed.startsWith('data:')) return trimmed;

  return trimmed
    .split(',')
    .map((candidate) => {
      const parts = candidate.trim().split(/\s+/);
      if (parts.length === 0 || !parts[0]) return '';

      const [url, ...descriptor] = parts;
      const normalizedUrl = normalizeUrl(url, baseUrl);
      return [normalizedUrl, ...descriptor].join(' ');
    })
    .filter(Boolean)
    .join(', ');
}

export function prepareContentForFeed(content: string, articleUrl: string): string {
  const $ = cheerio.load(content, null, false);

  $('img').each((_, element) => {
    const img = $(element);
    const src = img.attr('src')?.trim() ?? '';
    const dataSrc = img.attr('data-src')?.trim() ?? '';
    const srcset = img.attr('srcset')?.trim() ?? '';
    const dataSrcset = img.attr('data-srcset')?.trim() ?? '';

    if (dataSrc && (!src || isPlaceholderImage(src))) {
      img.attr('src', dataSrc);
    }

    if (dataSrcset && (!srcset || isPlaceholderImage(srcset))) {
      img.attr('srcset', dataSrcset);
    }

    img.removeAttr('data-src');
    img.removeAttr('data-srcset');
    img.removeAttr('loading');
    img.removeAttr('decoding');
  });

  $('picture').each((_, element) => {
    const picture = $(element);
    const img = picture.find('img').first();

    if (img.length === 0) {
      picture.remove();
      return;
    }

    const src = img.attr('src')?.trim() ?? '';
    if (!src || isPlaceholderImage(src)) {
      const source = picture.find('source').first();
      const sourceSrcset =
        source.attr('data-srcset')?.trim() ?? source.attr('srcset')?.trim() ?? '';
      const sourceUrl = firstSrcsetUrl(sourceSrcset);
      if (sourceUrl) {
        img.attr('src', sourceUrl);
      }
    }

    picture.replaceWith(img);
  });

  $('img').each((_, element) => {
    const img = $(element);
    const src = img.attr('src')?.trim();
    const srcset = img.attr('srcset')?.trim();

    if (src) {
      img.attr('src', normalizeUrl(src, articleUrl));
    }
    if (srcset) {
      if (isPlaceholderImage(srcset)) {
        img.removeAttr('srcset');
      } else {
        img.attr('srcset', normalizeSrcset(srcset, articleUrl));
      }
    }
  });

  $('a[href]').each((_, element) => {
    const link = $(element);
    const href = link.attr('href')?.trim();
    if (href) {
      link.attr('href', normalizeUrl(href, articleUrl));
    }
  });

  return $.root().html()?.trim() ?? content.trim();
}

// ============================================================================
// TRACKING
// ============================================================================

export async function loadTracking(): Promise<TrackingData> {
  try {
    const content = await readFile(CONFIG.TRACKING_FILE, 'utf-8');
    const data = JSON.parse(content) as TrackingData;
    console.log(`Loaded tracking data: ${Object.keys(data).length} entries`);
    return data;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      console.log('No tracking file found, starting fresh');
      return {};
    }
    throw error;
  }
}

export async function saveTracking(tracking: TrackingData): Promise<void> {
  await mkdir(dirname(CONFIG.TRACKING_FILE), { recursive: true });
  await writeFile(CONFIG.TRACKING_FILE, JSON.stringify(tracking, null, 2), 'utf-8');
  console.log(`Saved tracking data: ${Object.keys(tracking).length} entries`);
}

function toTrackingEntry(article: Article, lastSeen: string): TrackingData[string] {
  return {
    contentHash: article.id,
    lastSeen,
    link: article.link,
  };
}

export function detectChanges(articles: Article[], tracking: TrackingData): ChangeDetectionResult {
  let newCount = 0;
  let updatedCount = 0;
  let unchanged = 0;
  const now = new Date().toISOString();
  const updatedTracking: TrackingData = { ...tracking };

  for (const article of articles) {
    const existing = tracking[article.id];

    if (!existing || existing.link !== article.link) {
      // New article or link changed — both need a fresh tracking entry
      if (!existing) newCount++;
      else updatedCount++;
      updatedTracking[article.id] = toTrackingEntry(article, now);
    } else {
      // Unchanged - just update lastSeen
      unchanged++;
      updatedTracking[article.id] = { ...existing, lastSeen: now };
    }
  }

  console.log(`Changes: ${newCount} new, ${updatedCount} updated, ${unchanged} unchanged`);

  return { newCount, updatedCount, unchanged, updatedTracking };
}

// ============================================================================
// FEED GENERATION
// ============================================================================

export async function generateFeed(articles: Article[]): Promise<void> {
  const now = new Date();
  const feed = new Feed({
    title: CONFIG.FEED.title,
    description: CONFIG.FEED.description,
    id: CONFIG.SOURCE_URL,
    link: CONFIG.SOURCE_URL,
    language: CONFIG.FEED.language,
    updated: now,
    feedLinks: {
      atom: CONFIG.FEED.url,
    },
    copyright: `Stadt Karlsruhe ${now.getFullYear()}`,
    author: {
      name: 'Stadt Karlsruhe',
      link: CONFIG.SOURCE_URL,
    },
  });

  // Keep newest entries first and enforce feed size.
  const limited = [...articles]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, CONFIG.MAX_ARTICLES);
  console.log(`Adding ${limited.length} articles to feed (max: ${CONFIG.MAX_ARTICLES})`);

  for (const [index, article] of limited.entries()) {
    // Add a per-entry second offset so articles sharing the same calendar date
    // get distinct atom:updated values (validator recommendation).
    const entryDate = new Date(article.date.getTime() + index * 1000);
    feed.addItem({
      id: article.link,
      title: article.title,
      link: article.link,
      description: article.description,
      content: prepareContentForFeed(article.content, article.link),
      date: entryDate,
      published: article.date,
    });
  }

  // Write feed to file
  await mkdir(dirname(CONFIG.OUTPUT_FILE), { recursive: true });
  await writeFile(CONFIG.OUTPUT_FILE, feed.atom1(), 'utf-8');

  console.log(`✓ Generated feed: ${CONFIG.OUTPUT_FILE}`);
}
