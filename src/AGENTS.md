# AGENTS.md

Context for `src/` (TypeScript application code).

## Module Responsibilities

- `index.ts`: orchestrates steps only (fetch, scrape, detect, generate, save).
- `scraper.ts`: HTTP fetch, listing parsing, date parsing, content extraction, ID creation.
- `feed.ts`: tracking load/save, change detection, Atom feed writing.
- `config.ts`: environment defaults, selectors, constants, shared types.

## Coding Rules

1. Keep module boundaries clear; avoid moving responsibilities across files unless requested.
2. Add/adjust parser selectors in `config.ts` (`CONFIG.SELECTORS`) instead of scattering selector literals.
3. Preserve resilience behavior in `scrapeArticles()`:
   - Skip broken entries with warnings.
   - Continue processing remaining articles.
4. Keep extraction strategy order: Readability first, Cheerio fallback.
5. Keep IDs deterministic: MD5 of `YYYY-MM-DD|content`.
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
