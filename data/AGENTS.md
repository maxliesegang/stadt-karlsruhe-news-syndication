# AGENTS.md

Context for `data/` (persistent tracking state).

## File Intent

- `tracking.json` maps each article `id` (`md5(link)`) to its last-known
  `contentHash` (`md5(content)`), `lastSeen` and `lastModified` timestamps, and `link`.
- This file is committed and used across runs for change detection. Comparing
  the stored `contentHash` against the freshly scraped content is how article
  edits are detected as updates rather than as new entries. `lastModified` only
  advances when the content changes, and feeds the entry's `atom:updated` so the
  published feed stays stable when nothing changed.

## Rules

1. Treat `tracking.json` as machine-managed state; prefer updating it via runtime (`npm run start`) rather than manual edits.
2. Never reset, truncate, or bulk-rewrite tracking history unless explicitly requested.
   Routine runs prune entries whose `lastSeen` is older than
   `TRACKING_RETENTION_DAYS` (default 365); that automatic aging-out is expected.
3. Preserve JSON object shape per entry:
   - `contentHash` (string — `md5(content)`)
   - `lastSeen` (ISO timestamp — refreshed every run)
   - `lastModified` (ISO timestamp — advances only when content changes)
   - `link` (string URL)
4. Keep file valid JSON with stable formatting (2-space indentation).

## Operational Notes

- Unexpected large diffs in `tracking.json` may indicate parser/ID regressions. Verify scraper behavior before committing.
- Entries naturally disappear once an article leaves the source listing and ages past the retention window — small deletions are normal, not a regression.
- If test fixtures are needed, place them outside this production tracking file.
