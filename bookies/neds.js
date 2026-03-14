// Neds scraper
// Returns back odds for horse racing
// Uses data-testid attributes (stable) - same structure as Ladbrokes

console.log('[Neds Scraper] Initializing on:', window.location.href);

// Fuzzy match helper
function findMatchingBetfairName(bookmakeName, betfairNames) {
  if (!betfairNames || betfairNames.length === 0) return null;
  const normalize = (str) => str.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
  const normalizedBookie = normalize(bookmakeName);
  for (let betfairName of betfairNames) {
    const normalizedBetfair = normalize(betfairName);
    if (normalizedBookie === normalizedBetfair) return betfairName;
    if (normalizedBookie.includes(normalizedBetfair) || normalizedBetfair.includes(normalizedBookie)) return betfairName;
  }
  return null;
}

// Highlight horse on page
function highlightHorse(horseName) {
  const runnerRows = document.querySelectorAll('tr[data-testid="race-table-row"]');
  
  runnerRows.forEach(row => {
    const nameElement = row.querySelector('span[data-testid="runner-name"]');
    if (nameElement) {
      let name = nameElement.textContent.trim();
      name = name.replace(/^\d+\.\s*/, '').replace(/\s*\(\d+\)\s*$/, '').trim();
      
      if (name.toLowerCase() === horseName.toLowerCase()) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        row.style.transition = 'background-color 0.3s ease';
        row.style.backgroundColor = '#ffeb3b';
        setTimeout(() => { row.style.backgroundColor = ''; }, 2000);
        console.log('[Neds Scraper] Highlighted:', horseName);
      }
    }
  });
}

// Listen for odds requests from dashboard
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'highlight_horse') {
    highlightHorse(request.horseName);
    sendResponse({ success: true });
    return true;
  }
  
  if (request.action === 'request_odds') {
    const targetNames = request.targetHorseNames || [];
    scrapeOdds(targetNames)
      .then(data => {
        sendResponse({
          success: true,
          data: data,
          site: 'Neds',
          url: window.location.href
        });
      })
      .catch(error => {
        console.error('[Neds Scraper] Error:', error);
        sendResponse({
          success: false,
          error: error.message,
          data: []
        });
      });
    return true; // Keep channel open for async response
  }
});

function scrapeOdds(targetHorseNames = []) {
  return new Promise((resolve) => {
    const horses = [];

    try {
      // Find all runner rows using data-testid
      const runnerRows = document.querySelectorAll('tr[data-testid="race-table-row"]');
      
      console.log(`[Neds Scraper] Found ${runnerRows.length} runner rows`);

      runnerRows.forEach((row, index) => {
        try {
          // Extract horse name
          const nameElement = row.querySelector('span[data-testid="runner-name"]');
          if (!nameElement) {
            console.warn(`[Neds Scraper] Row ${index}: No name element found`);
            return;
          }
          let horseName = nameElement.textContent.trim();
          
          // Clean horse name: remove leading number (e.g., "1. ") and trailing barrier (e.g., " (1)")
          horseName = horseName.replace(/^\d+\.\s*/, '').replace(/\s*\(\d+\)\s*$/, '').trim();

          let finalName = horseName;
          if (targetHorseNames.length > 0) {
            const matchedName = findMatchingBetfairName(horseName, targetHorseNames);
            if (matchedName) {
              finalName = matchedName;
              console.log(`[Neds Scraper] Matched "${horseName}" → Betfair: "${matchedName}"`);
            } else {
              console.log(`[Neds Scraper] No match for "${horseName}", skipping`);
              return;
            }
          }

          // Extract win odds
          const oddsColumn = row.querySelector('td.runner-fixed-odds');
          
          if (!oddsColumn) {
            console.warn(`[Neds Scraper] Row ${index} (${horseName}): No odds column found`);
            return;
          }

          const priceButton = oddsColumn.querySelector('button[data-testid^="price-button-"]');
          
          if (!priceButton) {
            console.warn(`[Neds Scraper] Row ${index} (${horseName}): No price button found`);
            return;
          }

          const winOddsElement = priceButton.querySelector('span[data-testid="price-button-odds"]');
          
          if (!winOddsElement) {
            console.warn(`[Neds Scraper] Row ${index} (${horseName}): No win odds element found`);
            return;
          }

          const winOddsText = winOddsElement.textContent.trim();
          const winOdds = parseFloat(winOddsText);

          if (isNaN(winOdds)) {
            console.warn(`[Neds Scraper] Row ${index} (${horseName}): Invalid win odds "${winOddsText}"`);
            return;
          }

          // Standardized format: layOdds is null for bookmakers
          horses.push({
            name: finalName,
            backOdds: winOdds,
            layOdds: null,
            site: 'Neds'
          });

          console.log(`[Neds Scraper] Extracted: ${finalName} @ Back ${winOdds}`);
        } catch (error) {
          console.error(`[Neds Scraper] Error processing row ${index}:`, error);
        }
      });

      console.log(`[Neds Scraper] Successfully extracted ${horses.length} horses`);
      resolve(horses);
    } catch (error) {
      console.error('[Neds Scraper] Fatal error:', error);
      resolve([]);
    }
  });
}
