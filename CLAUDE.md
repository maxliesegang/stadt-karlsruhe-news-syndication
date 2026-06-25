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

## Working rules

All working rules — module map, guardrails, and conventions — live in [AGENTS.md](AGENTS.md) and
its nested files. Read the most specific one for the file you are editing:

- [AGENTS.md](AGENTS.md) — repo-wide guardrails and module map
- [src/AGENTS.md](src/AGENTS.md) — source code rules
- [.github/workflows/AGENTS.md](.github/workflows/AGENTS.md) — CI behavior
- [docs/AGENTS.md](docs/AGENTS.md) — published output
- [data/AGENTS.md](data/AGENTS.md) — tracking state
