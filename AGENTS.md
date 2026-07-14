# AGENTS.md

Repository-wide instructions for AI agents working in `stadt-karlsruhe-news-syndication`.

## What this is

An automated Atom feed generator for [Stadt Karlsruhe news](https://www.karlsruhe.de/aktuelles).
A small ESM TypeScript pipeline scrapes the news listing, extracts each article's body, tracks
changes, and writes an Atom feed that is published via GitHub Pages. A GitHub Actions workflow
regenerates the feed every 4 hours.

## Commands

| Command         | Purpose                                                       |
| --------------- | ------------------------------------------------------------- |
| `npm start`     | Run the generator once (fetch → scrape → detect → write feed) |
| `npm run dev`   | Same, in watch mode                                           |
| `npm test`      | Run the Vitest unit + fixture tests                           |
| `npm run check` | Full gate: typecheck + lint + format check + tests            |

The app runs directly from source via `tsx` (no build/emit step); `npm run typecheck` type-checks
with `--noEmit`. Run `npm run check` before considering a change done. Use `npm start` to validate
scraper/feed behavior against the live site.

## Scope Model

Use the most specific `AGENTS.md` available for the file you are editing.

- Root rules here apply everywhere.
- Nested `AGENTS.md` files override/add guidance for their subtree.

## Current Project Shape

This repository currently uses a small module-based TypeScript scraper:

- `src/index.ts`: pipeline orchestration
- `src/scraper.ts`: HTTP fetch + listing parsing + bounded concurrency + article ID creation
- `src/date.ts`: German date-string parsing
- `src/url.ts`: shared URL resolution
- `src/hash.ts`: shared MD5 helper (identity + content hashing)
- `src/errors.ts`: shared unknown-error → message helper
- `src/time.ts`: shared millisecond duration constants
- `src/extractor.ts`: article body extraction (Readability → Cheerio fallback)
- `src/content.ts`: feed content HTML rewriting (lazy images, `<picture>`, absolute URLs)
- `src/feed.ts`: tracking I/O + change detection + retention pruning + Atom generation
- `src/config.ts`: environment configuration, selectors, shared types

## Global Guardrails

1. Keep changes small and local; do not reorganize architecture unless explicitly asked.
2. Preserve generated/runtime artifacts expected by CI:
   - `docs/feed.atom`
   - `data/tracking.json`
3. The app runs from source via `tsx`; there is no build/emit step. Use `npm run typecheck`
   (`tsc --noEmit`) for type confidence.
4. Prefer updating selectors/config in `src/config.ts` rather than hardcoding values elsewhere.
5. Keep Node ESM + TypeScript style consistent (existing import/export patterns).
6. Validate behavior after meaningful logic changes:
   - `npm run start` for scraper/feed behavior
   - `npm test` and/or `npm run check` when relevant

## Directory-Specific Agent Guides

- `src/AGENTS.md` for implementation changes in source code.
- `.github/workflows/AGENTS.md` for CI/scheduling behavior.
- `docs/AGENTS.md` for published static output and landing page.
- `data/AGENTS.md` for tracking state handling.
