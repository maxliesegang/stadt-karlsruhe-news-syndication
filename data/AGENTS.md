# AGENTS.md

Context for `data/` (persistent tracking state).

## File Intent

- `tracking.json` stores known article IDs and last-seen metadata.
- This file is committed and used across runs for change detection.

## Rules

1. Treat `tracking.json` as machine-managed state; prefer updating it via runtime (`npm run start`) rather than manual edits.
2. Never reset, truncate, or bulk-rewrite tracking history unless explicitly requested.
3. Preserve JSON object shape per entry:
   - `contentHash` (string)
   - `lastSeen` (ISO timestamp)
   - `link` (string URL)
4. Keep file valid JSON with stable formatting (2-space indentation).

## Operational Notes

- Unexpected large diffs in `tracking.json` may indicate parser/ID regressions. Verify scraper behavior before committing.
- If test fixtures are needed, place them outside this production tracking file.
