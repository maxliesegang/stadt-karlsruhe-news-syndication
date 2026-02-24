# AGENTS.md

Repository-wide instructions for AI agents working in `stadt-karlsruhe-news-syndication`.

## Scope Model

Use the most specific `AGENTS.md` available for the file you are editing.

- Root rules here apply everywhere.
- Nested `AGENTS.md` files override/add guidance for their subtree.

## Current Project Shape

This repository currently uses a small module-based TypeScript scraper:

- `src/index.ts`: pipeline orchestration
- `src/scraper.ts`: fetch + parse + content extraction + ID generation
- `src/feed.ts`: tracking I/O + change detection + Atom generation
- `src/config.ts`: environment configuration, selectors, shared types

## Global Guardrails

1. Keep changes small and local; do not reorganize architecture unless explicitly asked.
2. Preserve generated/runtime artifacts expected by CI:
   - `docs/feed.atom`
   - `data/tracking.json`
3. Do not manually edit compiled files in `dist/`; regenerate with `npm run build`.
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
