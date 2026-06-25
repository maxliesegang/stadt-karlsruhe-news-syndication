/**
 * Feed generation and article tracking
 * Handles Atom feed creation and change detection
 */

import { Feed } from 'feed';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import * as cheerio from 'cheerio';
import { CONFIG, type Article, type TrackingData } from './config.js';
import { resolveHttpUrl } from './url.js';
import { md5 } from './hash.js';
import { DAY_MS, SECOND_MS } from './time.js';

type ChangeDetectionResult = {
  newCount: number;
  updatedCount: number;
  unchangedCount: number;
  prunedCount: number;
  updatedTracking: TrackingData;
};

function isPlaceholderImage(value: string): boolean {
  return value.trimStart().startsWith('data:image/gif;base64,');
}

function normalizeContentUrl(value: string, baseUrl: string): string {
  const trimmed = value.trim();

  // Leave non-navigational schemes (data:, mailto:, anchors, …) untouched so
  // we don't break inline content; everything else is resolved to an absolute
  // http(s) URL, falling back to the original on failure.
  if (!trimmed || /^(data:|mailto:|tel:|javascript:|#)/i.test(trimmed)) {
    return trimmed;
  }

  return resolveHttpUrl(trimmed, baseUrl) ?? trimmed;
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
      const normalizedUrl = normalizeContentUrl(url, baseUrl);
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
      img.attr('src', normalizeContentUrl(src, articleUrl));
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
      link.attr('href', normalizeContentUrl(href, articleUrl));
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

type ChangeStatus = 'new' | 'updated' | 'unchanged';

/**
 * Classify an article against its previously tracked state. Identity is stable
 * (see scraper.createArticleId), so a known id with a different content hash
 * means the body was edited.
 */
function classifyArticle(
  existing: TrackingData[string] | undefined,
  contentHash: string
): ChangeStatus {
  if (!existing) return 'new';
  return existing.contentHash === contentHash ? 'unchanged' : 'updated';
}

function toTrackingEntry(
  link: string,
  contentHash: string,
  lastSeen: string,
  lastModified: string
): TrackingData[string] {
  return { contentHash, lastSeen, lastModified, link };
}

/**
 * Remove tracking entries whose articles have not been seen within the
 * retention window. Articles still present on the source listing are refreshed
 * to `now` on every run, so only entries that have dropped off the listing age
 * out — keeping `tracking.json` bounded over time.
 */
export function pruneTracking(
  tracking: TrackingData,
  now: Date
): { tracking: TrackingData; prunedCount: number } {
  const cutoff = now.getTime() - CONFIG.TRACKING.retentionDays * DAY_MS;
  const retained: TrackingData = {};
  let prunedCount = 0;

  for (const [id, entry] of Object.entries(tracking)) {
    const lastSeen = Date.parse(entry.lastSeen);
    if (!Number.isNaN(lastSeen) && lastSeen < cutoff) {
      prunedCount++;
      continue;
    }
    retained[id] = entry;
  }

  return { tracking: retained, prunedCount };
}

export function detectChanges(articles: Article[], tracking: TrackingData): ChangeDetectionResult {
  const now = new Date();
  const nowIso = now.toISOString();
  const counts: Record<ChangeStatus, number> = { new: 0, updated: 0, unchanged: 0 };
  const updatedTracking: TrackingData = { ...tracking };

  // Per-change second offset keeps the timestamps of articles changed in the
  // same run distinct, while staying stable once written.
  let changeOffset = 0;

  for (const article of articles) {
    const existing = tracking[article.id];
    const contentHash = md5(article.content);
    const status = classifyArticle(existing, contentHash);
    counts[status]++;

    // Only advance lastModified when the body actually changed; unchanged
    // entries keep their previous value so the feed stays byte-stable.
    const lastModified =
      status === 'unchanged'
        ? (existing?.lastModified ?? existing?.lastSeen ?? nowIso)
        : new Date(now.getTime() + changeOffset++ * SECOND_MS).toISOString();

    updatedTracking[article.id] = toTrackingEntry(article.link, contentHash, nowIso, lastModified);
  }

  const { tracking: prunedTracking, prunedCount } = pruneTracking(updatedTracking, now);

  console.log(
    `Changes: ${counts.new} new, ${counts.updated} updated, ${counts.unchanged} unchanged, ${prunedCount} pruned`
  );

  return {
    newCount: counts.new,
    updatedCount: counts.updated,
    unchangedCount: counts.unchanged,
    prunedCount,
    updatedTracking: prunedTracking,
  };
}

// ============================================================================
// FEED GENERATION
// ============================================================================

// An entry's atom:updated comes from tracked `lastModified` (when its content
// last changed), falling back to the publish date for articles not yet tracked.
function entryUpdatedAt(article: Article, tracking: TrackingData): Date {
  const tracked = tracking[article.id];
  return tracked ? new Date(tracked.lastModified) : article.date;
}

/**
 * Build the Atom feed XML. Pure and deterministic: given the same articles and
 * tracking state it returns identical output, so the published `feed.atom` only
 * changes when an article's content actually changes (the feed's atom:updated is
 * the newest entry change, not wall-clock now).
 */
export function renderAtomFeed(articles: Article[], tracking: TrackingData): string {
  // Newest first, capped at the feed size limit.
  const entries = [...articles]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, CONFIG.MAX_ARTICLES)
    .map((article) => ({ article, updated: entryUpdatedAt(article, tracking) }));

  const latestUpdate = entries.reduce((max, { updated }) => Math.max(max, updated.getTime()), 0);
  const feedUpdated = latestUpdate > 0 ? new Date(latestUpdate) : new Date();

  const feed = new Feed({
    title: CONFIG.FEED.title,
    description: CONFIG.FEED.description,
    id: CONFIG.SOURCE_URL,
    link: CONFIG.SOURCE_URL,
    language: CONFIG.FEED.language,
    updated: feedUpdated,
    feedLinks: {
      atom: CONFIG.FEED.url,
    },
    copyright: `Stadt Karlsruhe ${feedUpdated.getFullYear()}`,
    author: {
      name: 'Stadt Karlsruhe',
      link: CONFIG.SOURCE_URL,
    },
  });

  for (const { article, updated } of entries) {
    feed.addItem({
      id: article.link,
      title: article.title,
      link: article.link,
      description: article.description,
      content: prepareContentForFeed(article.content, article.link),
      date: updated,
      published: article.date,
    });
  }

  return feed.atom1();
}

export async function generateFeed(articles: Article[], tracking: TrackingData): Promise<void> {
  const atom = renderAtomFeed(articles, tracking);
  const count = Math.min(articles.length, CONFIG.MAX_ARTICLES);
  console.log(`Adding ${count} articles to feed (max: ${CONFIG.MAX_ARTICLES})`);

  await mkdir(dirname(CONFIG.OUTPUT_FILE), { recursive: true });
  await writeFile(CONFIG.OUTPUT_FILE, atom, 'utf-8');

  console.log(`✓ Generated feed: ${CONFIG.OUTPUT_FILE}`);
}
