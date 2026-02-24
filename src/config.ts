/**
 * Configuration and constants
 * All environment variables and static configuration in one place
 */

import { config as dotenvConfig } from 'dotenv';

// Load environment variables
dotenvConfig();

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) || parsed < 1 ? fallback : parsed;
}

export const CONFIG = {
  // Source URLs
  SOURCE_URL: process.env.SOURCE_URL || 'https://www.karlsruhe.de/aktuelles',
  BASE_URL: process.env.BASE_URL || 'https://www.karlsruhe.de',

  // Feed metadata
  FEED: {
    title: process.env.FEED_TITLE || 'Stadt Karlsruhe - Aktuelle Meldungen',
    description: process.env.FEED_DESCRIPTION || 'Offizielle Nachrichten der Stadt Karlsruhe',
    language: process.env.FEED_LANGUAGE || 'de',
    url:
      process.env.FEED_URL ||
      'https://maxliesegang.github.io/stadt-karlsruhe-news-syndication/feed.atom',
  },

  // Output paths
  OUTPUT_FILE: process.env.OUTPUT_FILE || 'docs/feed.atom',
  TRACKING_FILE: process.env.TRACKING_FILE || 'data/tracking.json',
  MAX_ARTICLES: parsePositiveInteger(process.env.MAX_ARTICLES, 100),

  // HTTP settings
  HTTP: {
    maxRetries: 3,
    retryDelay: 1000,
    timeout: 30000,
  },

  // Scraper behavior
  SCRAPER: {
    concurrency: 4,
    minContentLength: 100,
  },

  // CSS selectors for HTML parsing
  SELECTORS: {
    articles: [
      '.karlTabs__tab-pane.show.active .news-item',
      '.newsroom .news-item',
      '.newsroom__item-wrapper .news-item',
      '.article',
      '[class*="news"]',
      '[class*="meldung"]',
      '.teaser',
      '[class*="teaser"]',
      'article',
      '.content-item',
      '.list-item',
    ],
    title: ['h1', 'h2', 'h3', 'h4', '.title', '[class*="title"]', '[class*="headline"]'],
    description: [
      '.news-item__teaser',
      'p.mt-1',
      'p:not(.news-item__date)',
      '.description',
      '[class*="description"]',
      '.text',
      '[class*="text"]',
    ],
    date: ['.date', '[class*="date"]', 'time', '.published', '[class*="published"]'],
    contentContainers: ['article', 'main', '.news', '.content', '#content', '[role="main"]'],
    // Elements to remove before content extraction (noise / copyright credits)
    noiseElements: ['.copyright-text'],
  },

  // German month names to indices (0-11)
  GERMAN_MONTHS: {
    januar: 0,
    februar: 1,
    märz: 2,
    maerz: 2,
    april: 3,
    mai: 4,
    juni: 5,
    juli: 6,
    august: 7,
    september: 8,
    oktober: 9,
    november: 10,
    dezember: 11,
  } as Record<string, number>,
} as const;

// TypeScript types
export type Article = {
  id: string;
  title: string;
  date: Date;
  link: string;
  description: string;
  content: string;
};

export type TrackingData = Record<
  string,
  {
    contentHash: string;
    lastSeen: string;
    link: string;
  }
>;
