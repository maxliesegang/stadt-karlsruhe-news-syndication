# stadt-karlsruhe-news-syndication

Automated Atom feed generator for [Stadt Karlsruhe news](https://www.karlsruhe.de/aktuelles).

A simple, maintainable TypeScript scraper with a small module-based architecture.

## Features

- 🔄 Scrapes karlsruhe.de/aktuelles for latest news
- 📰 Generates valid Atom feed with full article content
- 🎯 Uses @mozilla/readability for intelligent content extraction
- 🔍 Tracks article changes with MD5 hashing
- ⏰ Auto-updates every 4 hours via GitHub Actions
- 🚀 Deploys to GitHub Pages
- 🔧 Environment-based configuration
- 📦 Small module-based architecture
- 🪶 Lightweight with minimal dependencies

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` and set your GitHub username:

```bash
GITHUB_USERNAME=your-username
```

The feed URL will be auto-generated as:

```
https://your-username.github.io/stadt-karlsruhe-news-syndication/feed.atom
```

Or manually set:

```bash
FEED_URL=https://your-custom-domain.com/feed.atom
```

### 3. Test Locally

```bash
bun run start
# or
npm run start
```

This will:

- Fetch the latest articles from karlsruhe.de
- Generate `docs/feed.atom`
- Create `data/tracking.json` for change tracking

### 4. Enable GitHub Pages

1. Go to your repository Settings
2. Navigate to Pages (under "Code and automation")
3. Set Source to "Deploy from a branch"
4. Select branch: `main`, folder: `/docs`
5. Click Save

### 5. Push to GitHub

```bash
git add .
git commit -m "Initial implementation"
git push
```

GitHub Actions will automatically:

- Run every 4 hours
- Update the feed
- Commit changes back to the repository

## Usage

### Feed URL

Once deployed, your feed will be available at:

```
https://<your-username>.github.io/stadt-karlsruhe-news-syndication/feed.atom
```

Subscribe to this URL in any feed reader (Feedly, Inoreader, NetNewsWire, etc.)

### Manual Trigger

To manually update the feed:

1. Go to the "Actions" tab in your GitHub repository
2. Select "Update Feed" workflow
3. Click "Run workflow"

### Local Development

```bash
# Run once
npm run start

# Watch mode (auto-restart on file changes)
npm run dev

# Build TypeScript
npm run build

# Run tests
npm test

# Type checking
npm run typecheck
```

### Environment Variables

All configuration is managed through environment variables:

| Variable          | Default                              | Description               |
| ----------------- | ------------------------------------ | ------------------------- |
| `SOURCE_URL`      | `https://www.karlsruhe.de/aktuelles` | News source URL           |
| `GITHUB_USERNAME` | -                                    | Your GitHub username      |
| `FEED_URL`        | Auto-generated                       | Published feed URL        |
| `MAX_ARTICLES`    | `100`                                | Maximum articles in feed  |
| `OUTPUT_FILE`     | `docs/feed.atom`                     | Feed output path          |
| `TRACKING_FILE`   | `data/tracking.json`                 | Change tracking file path |

See [.env.example](.env.example) for all options.

## How It Works

### Content Extraction

The scraper uses @mozilla/readability (from Firefox Reader View) as the primary method to extract article content, with cheerio as a fallback. This ensures clean, readable content without ads, navigation, or other page clutter.

### ID Generation

Articles are identified using MD5 hashes of their content and date:

```
md5(content + date) → "e26cb58274098ee7c9bca9d45b2bba8e"
```

This ensures:

- Content changes result in new IDs (treated as new articles)
- Stable IDs for unchanged content
- No duplicate entries in the feed

### Change Detection

The system tracks articles using MD5 hashing:

1. **New articles** → Added to feed
2. **Content changes** → New ID generated, treated as new article
3. **No changes** → Last-seen timestamp updated

Tracking data is persisted in `data/tracking.json` and committed to git.

### Feed Limits

- Maximum 100 articles in feed (configurable via `MAX_ARTICLES`)
- Articles sorted by date (newest first)

## Architecture

### Project Structure

```
stadt-karlsruhe-news-syndication/
├── src/
│   ├── index.ts              # Pipeline orchestration
│   ├── scraper.ts            # Fetching + parsing + content extraction
│   ├── feed.ts               # Tracking state + Atom generation
│   ├── config.ts             # Shared config, selectors, and types
│   ├── scraper.test.ts       # Scraper/date/link unit tests
│   └── feed.test.ts          # Tracking unit tests
├── .github/workflows/
│   └── update-feed.yml      # GitHub Actions (runs every 4 hours)
├── docs/
│   ├── feed.atom            # Generated feed (GitHub Pages)
│   └── index.html           # Landing page
├── data/
│   └── tracking.json        # Article tracking (committed to git)
├── .env.example             # Environment template
├── package.json
├── tsconfig.json
├── README.md
└── AGENTS.md                # Guide for AI agents
```

### Code Structure

The source code is split by responsibility:

1. **`src/index.ts`** - Main pipeline (fetch, scrape, detect, generate, save)
2. **`src/config.ts`** - Environment values, selectors, constants, shared types
3. **`src/scraper.ts`** - HTTP fetching, date parsing, listing parsing, content extraction, ID generation
4. **`src/feed.ts`** - Tracking load/save, change detection, Atom feed writing

### Tech Stack

**Core:**

- **TypeScript** - Type-safe development
- **Node.js** - Runtime (ES2022 modules)

**Libraries:**

- **@mozilla/readability** - Intelligent content extraction (Firefox Reader View)
- **cheerio** - Fast HTML parsing (jQuery-like API)
- **jsdom** - DOM implementation for Readability
- **feed** - Atom/RSS feed generation
- **ofetch** - Modern fetch wrapper with retry
- **dotenv** - Environment variable management

**Development:**

- **tsx** - TypeScript execution
- **TypeScript** - Type checking
- **ESLint** - Code linting
- **Prettier** - Code formatting

**Deployment:**

- **GitHub Actions** - Scheduled automation
- **GitHub Pages** - Static feed hosting

## Troubleshooting

### No articles found

If the scraper returns 0 articles:

1. The website HTML structure may have changed
2. Inspect karlsruhe.de/aktuelles in browser DevTools
3. Update selectors in `CONFIG.SELECTORS.articles` in `src/config.ts`
4. Run locally to see detailed console output

### Feed not updating

1. Check GitHub Actions status in the "Actions" tab
2. Review workflow logs for errors
3. Ensure GitHub Pages is enabled and deployed from `/docs`
4. Verify `data/tracking.json` and `docs/feed.atom` are committed

### Date parsing issues

If dates aren't parsed correctly:

1. Check console output for warnings about unparsed dates
2. Add new patterns to `parseGermanDate()` in `src/scraper.ts`
3. Test with actual website data

### Content extraction issues

If articles have missing or incorrect content:

1. Check if @mozilla/readability is extracting properly (console logs show method used)
2. Update cheerio fallback selectors in `CONFIG.SELECTORS.contentContainers` (in `src/config.ts`)
3. Adjust extraction heuristics in `extractContent()` (`src/scraper.ts`) if content is missing

## Contributing

### For Developers

The codebase is intentionally simple and split into focused modules:

- `src/index.ts` keeps orchestration linear and easy to follow
- `src/scraper.ts` contains scraping and extraction behavior
- `src/feed.ts` contains tracking and feed generation behavior
- `src/config.ts` centralizes selectors and environment-driven settings
- Unit tests in `src/*.test.ts` cover parser and tracking behavior

### For AI Agents

See [AGENTS.md](AGENTS.md) for comprehensive guidance on:

- Project architecture and patterns
- Common tasks and modifications (updating selectors, date parsing, etc.)
- Best practices for code changes
- Debugging strategies
- Understanding the simplified structure

## License

MIT
