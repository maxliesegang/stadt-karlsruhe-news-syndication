# AGENTS.md

Context for `src/` (TypeScript application code).

## Module Responsibilities

- `index.ts`: orchestrates steps only (fetch, scrape, detect, generate, save).
- `scraper.ts`: HTTP fetch, listing parsing, concurrency, content extraction, ID creation.
- `date.ts`: German date-string parsing (`parseGermanDate`).
- `url.ts`: shared URL resolution (`resolveHttpUrl`).
- `hash.ts`: shared MD5 helper (`md5`) for identity and content hashing.
- `errors.ts`: shared `errorMessage(error)` for turning unknown throwables into text.
- `time.ts`: shared millisecond duration constants (`SECOND_MS`, `MINUTE_MS`, `HOUR_MS`, `DAY_MS`).
- `extractor.ts`: article body extraction (Readability → Cheerio fallback).
- `content.ts`: feed content HTML rewriting (`prepareContentForFeed`: lazy images, `<picture>`, absolute URLs).
- `feed.ts`: tracking load/save, change detection, pruning, Atom feed writing.
- `config.ts`: environment defaults, selectors, constants, shared types.

## Coding Rules

1. Keep module boundaries clear; avoid moving responsibilities across files unless requested.
2. Add/adjust parser selectors in `config.ts` (`CONFIG.SELECTORS`) instead of scattering selector literals.
3. Preserve resilience behavior in `scrapeArticles()`:
   - Skip broken entries with warnings.
   - Continue processing remaining articles.
4. Keep extraction strategy order: Readability first, Cheerio fallback.
5. Keep article identity deterministic and content-independent: `id = md5(link)`.
   Detect content edits via a separate `contentHash = md5(content)` stored in
   tracking (do not fold content back into the id).
6. Keep feed/tracking compatibility with existing data shape (`Article`, `TrackingData`).

## Environment and Config

- Read env values through `CONFIG` only.
- When adding config:
  - Add default in `config.ts`.
  - Add entry to `.env.example`.
  - Keep names descriptive and uppercase.

## Validation and Testing

- For scraper/parsing logic changes, run `npm run start`.
- For type and lint confidence, run `npm run check` (or at least `npm run typecheck` + `npm test`).
- If adding new parser/date behavior, add/expand Vitest tests.

## Style

- Follow existing ESM TypeScript style.
- Avoid introducing `any` unless there is no practical alternative.
- Keep logging concise and operationally useful.
