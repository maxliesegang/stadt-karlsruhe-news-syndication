# CLAUDE.md

Guidance for Claude Code working in this repository.

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
| `npm run build` | Compile TypeScript to `dist/`                                 |

Run `npm run check` before considering a change done. Use `npm start` to validate scraper/feed
behavior against the live site.

## Module map (`src/`)

- `index.ts` — pipeline orchestration only
- `scraper.ts` — HTTP fetch, listing parsing, bounded concurrency, article ID creation
- `date.ts` — German date-string parsing (`parseGermanDate`)
- `url.ts` — shared URL resolution (`resolveHttpUrl`)
- `extractor.ts` — article body extraction (Readability → Cheerio fallback)
- `feed.ts` — tracking I/O, change detection, Atom feed generation
- `config.ts` — env-driven config, CSS selectors, constants, shared types (`Article`, `TrackingData`)

## Conventions

This repo uses nested `AGENTS.md` files as the source of truth for working rules. Read the most
specific one for the file you are editing:

- [AGENTS.md](AGENTS.md) — repo-wide guardrails
- [src/AGENTS.md](src/AGENTS.md) — source code rules
- [.github/workflows/AGENTS.md](.github/workflows/AGENTS.md) — CI behavior
- [docs/AGENTS.md](docs/AGENTS.md) — published output
- [data/AGENTS.md](data/AGENTS.md) — tracking state

Highlights: keep changes small and module boundaries clear; add selectors/constants in `config.ts`
rather than scattering literals; never hand-edit generated artifacts (`docs/feed.atom`,
`data/tracking.json`); preserve the `tracking.json` entry shape and deterministic MD5 article IDs.
