#!/usr/bin/env node
/**
 * Stadt Karlsruhe News Feed Generator
 *
 * Main entry point - orchestrates the feed generation pipeline:
 * 1. Fetch news listing page
 * 2. Scrape and parse articles
 * 3. Track changes
 * 4. Generate Atom feed
 */

import { CONFIG } from './config.js';
import { fetchHtml, scrapeArticles } from './scraper.js';
import { loadTracking, detectChanges, saveTracking, generateFeed } from './feed.js';

const DIVIDER = '='.repeat(60);

function logStart(): void {
  console.log(DIVIDER);
  console.log('Stadt Karlsruhe Feed Generator');
  console.log(DIVIDER);
  console.log();
}

function logSuccess(durationInSeconds: string): void {
  console.log();
  console.log(DIVIDER);
  console.log(`✓ Feed generation complete (${durationInSeconds}s)`);
  console.log(DIVIDER);
}

function logFailure(durationInSeconds: string, error: unknown): void {
  console.error();
  console.error(DIVIDER);
  console.error(`✗ Feed generation failed after ${durationInSeconds}s`);
  console.error(DIVIDER);
  console.error();
  // stack already includes the message; fall back to String() for non-Error values
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
}

async function main(): Promise<void> {
  const startTime = Date.now();

  try {
    logStart();

    // 1. Fetch listing page
    const listingHtml = await fetchHtml(CONFIG.SOURCE_URL);
    console.log();

    // 2. Scrape articles (includes fetching detail pages)
    const articles = await scrapeArticles(listingHtml);

    if (articles.length === 0) {
      console.warn('No articles found!');
      return;
    }

    // 3. Load tracking and detect changes
    const tracking = await loadTracking();
    const { updatedTracking } = detectChanges(articles, tracking);
    console.log();

    // 4. Generate feed
    await generateFeed(articles);
    console.log();

    // 5. Save tracking
    await saveTracking(updatedTracking);

    // Done!
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    logSuccess(duration);
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    logFailure(duration, error);
    process.exit(1);
  }
}

// Run the generator
main();
