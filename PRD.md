# PRD: MulePower Contributor Guide (for first-time contributors)

## Purpose

This document is a **product + engineering guideline** for contributing to MulePower.
It explains how the extension works, what “good changes” look like, and how to add/maintain bookmaker scrapers without breaking the dashboard.

## What MulePower is

MulePower is a Chrome extension (Manifest V3) that:
- Scrapes **lay odds** from **Betfair Exchange**
- Scrapes **back odds** from multiple bookmakers
- Merges the data into a dashboard that updates every second

## Non-goals

- Automated E2E testing across bookmaker sites (sites change frequently).
- Betting automation / placing bets.
- Supporting every market type (focus is horse racing win markets).

## Repository structure (high level)

```
mulePower/
├── manifest.json        # MV3 config: permissions, content scripts, hosts
├── background.js        # Service worker: opens dashboard, messaging glue
├── dashboard.html       # Dashboard UI (table + settings modal)
├── dashboard.js         # Dashboard logic: tab discovery, injection, merge, render
├── bookies/             # One scraper per site (content scripts)
└── PRD.md               # This contributor guide
```

## Architecture overview

### 1) Content scripts (scrapers) — `bookies/*.js`

Each bookmaker file runs on its matching host(s) and must:
- Listen for `chrome.runtime.onMessage`
- Respond to `request_odds` with a **standardized** payload
- (Optional) Respond to `highlight_horse` to scroll + highlight a runner

### 2) Dashboard — `dashboard.js`

The dashboard:
- Finds relevant tabs
- Requests odds from each tab
- **Programmatically injects** a scraper into already-open tabs when needed
- Merges bookmaker back odds with Betfair lay odds
- Renders a comparison table and handles UI features (filters, click-to-view, settings)

### 3) Betfair-first matching (source of truth)

When Betfair is available, MulePower treats **Betfair horse names as authoritative**:
- Dashboard fetches Betfair first
- Passes Betfair names into bookmaker scrapers (`targetHorseNames`)
- Scrapers fuzzy/structurally match and return results using the **Betfair name** to keep the table consistent

If Betfair is not open, scrapers can fall back to returning “all runners found”.

## Data contract (MUST follow)

### Message: request odds

Dashboard → Content script:

```js
{ action: 'request_odds', targetHorseNames?: string[] }
```

Content script → Dashboard:

```js
{
  success: true,
  site: "Sportsbet",
  url: window.location.href,
  data: [
    { name: "Horse Name", backOdds: 5.5, layOdds: null, site: "Sportsbet" }
  ]
}
```

Notes:
- `backOdds` is for bookmakers; `layOdds` is for Betfair.
- Keep numbers as `Number` (not strings).
- Always set `site` consistently (it’s used for display + filtering).

### Message: highlight horse (optional but encouraged)

Dashboard → Content script:

```js
{ action: 'highlight_horse', horseName: 'Horse Name' }
```

Content scripts should:
- Find the runner row
- `scrollIntoView({ behavior: 'smooth', block: 'center' })`
- Temporarily highlight the row (e.g. yellow flash) then restore

## Scraper selector strategy (what “good” looks like)

### Preferred selectors (most stable)

- `data-testid`
- `data-test`, `data-test-id`
- `data-automation-id`

Why: these are used by QA/automation; breaking them often breaks internal tests.

### Avoid (fragile)

- Obfuscated / hashed classes (CSS-in-JS): `.jss1234`, `.sc-xxxxx`, etc.
- Deep positional selectors that assume exact nesting.

### When stable attributes don’t exist

Use a fallback strategy:
- Structure-based selection (e.g., “runner rows contain an h4 with name”)
- Visible text patterns (e.g., `^\d+\.\s+Horse Name`)
- Validate extracted odds (numeric, > 1, not `SCR`)

## Adding a new bookmaker (end-to-end checklist)

### A) Implement the scraper — `bookies/<bookie>.js`

Minimum requirements:
- Handle `request_odds`
- Return array of `{ name, backOdds, layOdds, site }`
- Prefer stable selectors (see above)
- Log meaningful messages in the console (prefix with `[<Bookie> Scraper]`)

Skeleton:

```js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'request_odds') {
    scrapeOdds(request.targetHorseNames || []).then((data) => {
      sendResponse({ success: true, data, site: 'BookieName', url: window.location.href });
    }).catch((err) => {
      console.warn('[Bookie Scraper] scrape failed:', err);
      sendResponse({ success: true, data: [], site: 'BookieName', url: window.location.href });
    });
    return true;
  }
});
```

### B) Wire it into Chrome — `manifest.json`

- Add the host patterns under `host_permissions`
- Add a content script entry under `content_scripts`

### C) Ensure dashboard injection supports it — `dashboard.js`

If the project uses programmatic injection mapping (for already-open tabs), add the URL→scraper mapping so `requestOddsFromTab()` can inject the right file when a tab doesn’t respond.

### D) Manual test plan (required)

1. Reload extension: `chrome://extensions/` → Reload
2. Open the bookmaker race page and Betfair race page
3. Open dashboard
4. Verify:
   - Scraper logs show “found N runners”
   - Odds show in the table
   - Click a row → switches tab + highlights runner (if implemented)
   - Filter toggles include the new bookie name

## Supported bookmakers (reference)

This repo’s scrapers generally follow these proven strategies:
- Test/automation attributes (`data-testid`, `data-automation-id`, `data-test*`)
- Structural fallbacks for sites without stable attributes

If you add a new bookmaker, keep the same philosophy: **stability over cleverness**.

## Common dashboard behaviors contributors should know

- **Auto-refresh:** the dashboard polls every 1 second.
- **Tabs already open:** the dashboard can inject scripts into existing tabs when a tab doesn’t respond.
- **Show all combinations:** multiple bookmaker odds can create multiple rows per horse.
- **Click-to-view:** clicking a row focuses a relevant tab and asks it to highlight the runner.
- **Settings:** modal provides color thresholds for row/cell coloring (bonus vs non-promo).

## Contribution workflow

### Branch + PR expectations

- Keep PRs scoped (one feature/fix per PR).
- Prefer clear names: `feature/<thing>`, `fix/<bug>`, `chore/<cleanup>`.
- Include:
  - What changed and why
  - Manual test steps (what pages you opened, what you verified)

### PR checklist

- [ ] Scraper uses stable selectors (or documents why it can’t)
- [ ] Returns standardized data shape
- [ ] Works when the bookmaker tab was already open (injection path)
- [ ] Console logs are useful and not spammy
- [ ] `manifest.json` hosts and scripts updated correctly

## Icons

Chrome expects icons at common sizes. If you’re working on packaging/release readiness:
- Provide `icon16.png`, `icon48.png`, `icon128.png`, or remove icon references from `manifest.json` for quick local testing.

