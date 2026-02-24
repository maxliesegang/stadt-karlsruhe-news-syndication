# AGENTS.md

Context for `docs/` (published GitHub Pages artifacts).

## File Intent

- `feed.atom`: generated output from the scraper.
- `index.html`: human-facing landing page linking to the feed.
- `.nojekyll`: required for clean GitHub Pages behavior.

## Rules

1. Do not hand-edit `feed.atom` unless explicitly requested; regenerate via `npm run start`.
2. Keep `index.html` lightweight and static (no framework/tooling additions).
3. Preserve the feed link target (`href="feed.atom"`) unless asked to change URL strategy.
4. Keep copy primarily German unless the task explicitly requests language changes.
5. Ensure landing page remains mobile-friendly after edits.

## Validation

- After changing scraper logic, confirm `docs/feed.atom` is regenerated.
- After changing `index.html`, quickly check for valid HTML structure and working feed link.
