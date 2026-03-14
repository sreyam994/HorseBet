# MulePower
An open source google chrome extension to compare betfair and bookie odds in realtime.

## Features

- 🏇 **Real-time Odds Scraping**: Automatically extracts odds from open betting tabs
- 🎯 **All Combinations Shown**: See odds from all bookmakers side-by-side
- ⚡ **Auto-Refresh**: Updates every 1 second
- 🏢 **Multi-bookmaker Support**:
  <details>
  <summary>Show supported bookmakers</summary>

  - Betfair Exchange
  - TAB
  - bet365
  - Sportsbet
  - Ladbrokes
  - Neds
  - Pointsbet
  - Betr
  - Unibet
  - + More to come...

  </details>

## Installation

### Loading the Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right corner)
3. Click "Load unpacked"
4. Select the `mulePower` directory
5. The extension icon should appear in your toolbar

## Usage

### Step 1: Open Betting Tabs
1. Open betting tabs with horse racing markets:
   - **Betfair Exchange**: For lay odds
   - **TAB, bet365, Sportsbet, Ladbrokes, Neds, Pointsbet, Betr, Unibet**: For back odds
2. Navigate to specific race pages where odds are displayed
3. You can have multiple bookmaker tabs open for the same race

### Step 2: Launch Dashboard
1. Click the extension icon in your Chrome toolbar
2. A new tab will open with the Matched Betting Dashboard

### Step 3: Refresh Odds
1. Click the "🔄 Refresh Odds" button in the dashboard
2. The extension will scan all open tabs and extract available odds
3. View the comparison table with calculated retention percentages
4. If multiple bookmakers are open, the dashboard shows the **best (highest) back odds**

## Architecture

### File Structure

```
mulePower/
├── manifest.json       # Extension configuration (Manifest V3)
├── background.js       # Service worker (handles icon clicks)
├── dashboard.html      # Dashboard UI
├── dashboard.js        # Dashboard logic and data management
├── bookies/            # Bookmaker scrapers
│   ├── betfair.js      # Betfair Exchange scraper
│   ├── tab.js          # TAB scraper
│   └── bet365.js       # bet365 scraper
├── PRD.md              # Contributor guide / development spec
└── README.md           # This file
```

## How to contribute

New contributors should start with `PRD.md` (contributor guide + scraper standards + testing checklist).
- add `PRD.md` into the context of your AI agent

### Quick contribution steps

1. **Pick a change**: new bookmaker scraper, selector fix, UI tweak, or a dashboard improvement.
2. **Make the change** in a small PR.
3. **Manual test**:
   - Reload the extension at `chrome://extensions/`
   - Open Betfair + at least one bookmaker race page
   - Open the dashboard and verify odds flow end-to-end
4. **Open a PR** with:
   - What changed and why
   - The pages you tested and what you verified

### Adding a bookmaker (short version)

1. Add `bookies/<bookie>.js` (content script).
2. Update `manifest.json` host permissions + content scripts.
3. Ensure dashboard injection mapping supports the site (see `PRD.md`).
4. Test with tabs already open (relying on injection) and after a fresh page load.
