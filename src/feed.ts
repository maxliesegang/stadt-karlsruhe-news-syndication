/**
 * Feed generation and article tracking
 * Handles Atom feed creation and change detection
 */

import { Feed } from 'feed';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { CONFIG, type Article, type TrackingData, type TrackingEntry } from './config.js';
import { prepareContentForFeed } from './content.js';
import { md5 } from './hash.js';
import { DAY_MS, SECOND_MS } from './time.js';

type ChangeDetectionResult = {
  newCount: number;
  updatedCount: number;
  unchangedCount: number;
  prunedCount: number;
  // Tracking state to persist after this run (merged, then retention-pruned).
  nextTracking: TrackingData;
};

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
function classifyArticle(existing: TrackingEntry | undefined, contentHash: string): ChangeStatus {
  if (!existing) return 'new';
  return existing.contentHash === contentHash ? 'unchanged' : 'updated';
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
  // Prior tracking with this run's entries merged in, before retention pruning.
  const mergedTracking: TrackingData = { ...tracking };

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

    mergedTracking[article.id] = {
      contentHash,
      lastSeen: nowIso,
      lastModified,
      link: article.link,
    };
  }

  const { tracking: prunedTracking, prunedCount } = pruneTracking(mergedTracking, now);

  console.log(
    `Changes: ${counts.new} new, ${counts.updated} updated, ${counts.unchanged} unchanged, ${prunedCount} pruned`
  );

  return {
    newCount: counts.new,
    updatedCount: counts.updated,
    unchangedCount: counts.unchanged,
    prunedCount,
    nextTracking: prunedTracking,
  };
}

// ============================================================================
// FEED GENERATION
// ============================================================================

// An entry's atom:updated comes from tracked `lastModified` (when its content
// last changed), falling back to the publish date for articles not yet tracked.
function entryUpdatedAt(article: Article, tracking: TrackingData): Date {
  const tracked = tracking[article.id];
  return tracked ? new Date(tracked.lastModified) : article.publishedAt;
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
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
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
      published: article.publishedAt,
    });
  }

  return feed.atom1();
}

export async function writeFeed(articles: Article[], tracking: TrackingData): Promise<void> {
  const atom = renderAtomFeed(articles, tracking);
  const count = Math.min(articles.length, CONFIG.MAX_ARTICLES);
  console.log(`Adding ${count} articles to feed (max: ${CONFIG.MAX_ARTICLES})`);

  await mkdir(dirname(CONFIG.OUTPUT_FILE), { recursive: true });
  await writeFile(CONFIG.OUTPUT_FILE, atom, 'utf-8');

  console.log(`✓ Generated feed: ${CONFIG.OUTPUT_FILE}`);
}
