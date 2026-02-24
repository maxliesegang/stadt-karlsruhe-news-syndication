/**
 * Fixture fetcher — saves real article HTML to scripts/fixtures/ for use in vitest.
 *
 * Run this script to refresh saved fixtures whenever you want to test against
 * fresh HTML from the live site:
 *
 *   npx tsx scripts/test-extraction.ts
 *
 * To add a new test case:
 *   1. Add the URL to TEST_URLS below
 *   2. Run this script to save the HTML fixture
 *   3. Add a matching entry to the TEST_CASES array in src/extraction.test.ts
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fetchHtml } from '../src/scraper.js';

const TEST_URLS = [
  'https://www.karlsruhe.de/stadt-rathaus/aktuelles/meldungen/haushaltsberatungen-gemeinderat-tagt-vom-16-bis-18-dezember',
  'https://www.karlsruhe.de/stadt-rathaus/aktuelles/meldungen/staedtische-galerie-wird-zum-kunstmuseum-karlsruhe',
  'https://www.karlsruhe.de/stadt-rathaus/aktuelles/meldungen/klimabaeume-bereichern-den-zoologischen-stadtgarten',
  'https://www.karlsruhe.de/stadt-rathaus/aktuelles/meldungen/bombe-nahe-marylandschule-entschaerft',
  'https://www.karlsruhe.de/stadt-rathaus/aktuelles/meldungen/auftakt-fuer-die-world-games-2029-in-karlsruhe',
  // ↑ Add new URLs here — then run this script and add a matching entry to src/extraction.test.ts
];

const FIXTURE_DIR = 'scripts/fixtures';

async function main(): Promise<void> {
  await mkdir(FIXTURE_DIR, { recursive: true });

  for (const url of TEST_URLS) {
    const slug = url.split('/').pop() ?? 'unknown';
    try {
      const html = await fetchHtml(url);
      await writeFile(join(FIXTURE_DIR, `${slug}.html`), html, 'utf-8');
      console.log(`✓ ${slug} (${Math.round(html.length / 1024)} KB)`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`✗ ${slug}: ${message}`);
    }
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
