# AGENTS.md

Context for `.github/workflows/` (CI automation).

## Current Workflow Contract

`update-feed.yml` should:

1. Run on schedule (every 4 hours), manual trigger, and push to `main`.
2. Install deps via `npm ci`.
3. Run generator via `npm start`.
4. Commit only generated artifacts (`docs/feed.atom`, `data/tracking.json`).

## Rules

1. Preserve `workflow_dispatch` unless explicitly asked to remove manual runs.
2. Keep least-required permissions (`contents: write` currently needed for commits).
3. Avoid introducing self-triggering commit loops; keep `[skip ci]` in auto-commit message.
4. Keep runtime setup consistent with project requirements (Node + npm).
5. If changing schedule or triggers, document intent in workflow comments.

## Validation

- YAML must remain syntactically valid.
- Any workflow changes should be reviewed for unintended write scope or trigger behavior.
