import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractContent } from './scraper.js';

type TestCase = {
  /** Filename stem matching scripts/fixtures/<slug>.html */
  slug: string;
  url: string;
  /** Minimum extracted HTML length — catches empty/truncated output */
  minChars: number;
  /** Strings that must NOT appear in the extracted content */
  notContains?: string[];
};

// Add a new entry here when you add a URL to scripts/test-extraction.ts
// and have run the fetcher to save the HTML fixture.
const TEST_CASES: TestCase[] = [
  {
    slug: 'haushaltsberatungen-gemeinderat-tagt-vom-16-bis-18-dezember',
    url: 'https://www.karlsruhe.de/stadt-rathaus/aktuelles/meldungen/haushaltsberatungen-gemeinderat-tagt-vom-16-bis-18-dezember',
    minChars: 500,
  },
  {
    slug: 'staedtische-galerie-wird-zum-kunstmuseum-karlsruhe',
    url: 'https://www.karlsruhe.de/stadt-rathaus/aktuelles/meldungen/staedtische-galerie-wird-zum-kunstmuseum-karlsruhe',
    minChars: 500,
  },
  {
    slug: 'klimabaeume-bereichern-den-zoologischen-stadtgarten',
    url: 'https://www.karlsruhe.de/stadt-rathaus/aktuelles/meldungen/klimabaeume-bereichern-den-zoologischen-stadtgarten',
    minChars: 500,
  },
  {
    slug: 'bombe-nahe-marylandschule-entschaerft',
    url: 'https://www.karlsruhe.de/stadt-rathaus/aktuelles/meldungen/bombe-nahe-marylandschule-entschaerft',
    minChars: 500,
    // Hard case: photo copyright caption was prepended before article body
    notContains: ['© Stadt Karlsruhe, Presse- und Informationsamt'],
  },
  {
    slug: 'auftakt-fuer-die-world-games-2029-in-karlsruhe',
    url: 'https://www.karlsruhe.de/stadt-rathaus/aktuelles/meldungen/auftakt-fuer-die-world-games-2029-in-karlsruhe',
    minChars: 500,
  },
];

const FIXTURE_DIR = join(process.cwd(), 'scripts/fixtures');

describe('extractContent — real article fixtures', () => {
  for (const { slug, url, minChars, notContains } of TEST_CASES) {
    const fixturePath = join(FIXTURE_DIR, `${slug}.html`);
    const fixtureExists = existsSync(fixturePath);

    it.skipIf(!fixtureExists)(
      slug,
      () => {
        const html = readFileSync(fixturePath, 'utf-8');
        const content = extractContent(html, url);

        expect(content.length).toBeGreaterThanOrEqual(minChars);

        for (const forbidden of notContains ?? []) {
          expect(content).not.toContain(forbidden);
        }
      }
    );
  }
});
