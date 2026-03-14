// Sportsbet scraper
// Returns back odds for horse racing
// Uses data-automation-id attributes (stable)

console.log('[Sportsbet Scraper] Initializing on:', window.location.href);

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
  const runnerRows = document.querySelectorAll('div[data-automation-id^="racecard-outcome-"]');
  
  runnerRows.forEach(row => {
    const nameElement = row.querySelector('div[data-automation-id="racecard-outcome-name"]');
    if (nameElement) {
      let name = nameElement.textContent.trim();
      name = name.replace(/^\d+\.\s*/, '').replace(/\s*\(\d+\)\s*$/, '').trim();
      
      if (name.toLowerCase() === horseName.toLowerCase()) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        row.style.transition = 'background-color 0.3s ease';
        row.style.backgroundColor = '#ffeb3b';
        setTimeout(() => { row.style.backgroundColor = ''; }, 2000);
        console.log('[Sportsbet Scraper] Highlighted:', horseName);
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
          site: 'Sportsbet',
          url: window.location.href
        });
      })
      .catch(error => {
        console.error('[Sportsbet Scraper] Error:', error);
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
      // Find all runner rows using data-automation-id
      const runnerRows = document.querySelectorAll('div[data-automation-id^="racecard-outcome-"]');
      
      console.log(`[Sportsbet Scraper] Found ${runnerRows.length} runner rows`);

      runnerRows.forEach((row, index) => {
        try {
          // Extract horse name
          const nameElement = row.querySelector('div[data-automation-id="racecard-outcome-name"]');
          if (!nameElement) {
            console.warn(`[Sportsbet Scraper] Row ${index}: No name element found`);
            return;
          }
          let horseName = nameElement.textContent.trim();
          
          // Clean horse name: remove leading number (e.g., "1. ") and trailing barrier (e.g., " (1)")
          horseName = horseName.replace(/^\d+\.\s*/, '').replace(/\s*\(\d+\)\s*$/, '').trim();

          // Match with Betfair names if provided
          let finalName = horseName;
          if (targetHorseNames.length > 0) {
            const matchedName = findMatchingBetfairName(horseName, targetHorseNames);
            if (matchedName) {
              finalName = matchedName;
              console.log(`[Sportsbet Scraper] Matched "${horseName}" → Betfair: "${matchedName}"`);
            } else {
              console.log(`[Sportsbet Scraper] No match for "${horseName}", skipping`);
              return;
            }
          }

          // Extract win odds
          const oddsContainer = row.querySelector('div[data-automation-id="racecard-outcome-0-L-price"]');
          
          if (!oddsContainer) {
            console.warn(`[Sportsbet Scraper] Row ${index} (${horseName}): No odds container found`);
            return;
          }

          const winOddsElement = oddsContainer.querySelector('span[data-automation-id$="-odds-button-text"]');
          
          if (!winOddsElement) {
            console.warn(`[Sportsbet Scraper] Row ${index} (${horseName}): No win odds element found`);
            return;
          }

          const winOddsText = winOddsElement.textContent.trim();
          const winOdds = parseFloat(winOddsText);

          if (isNaN(winOdds)) {
            console.warn(`[Sportsbet Scraper] Row ${index} (${horseName}): Invalid win odds "${winOddsText}"`);
            return;
          }

          // Standardized format: layOdds is null for bookmakers
          horses.push({
            name: finalName,
            backOdds: winOdds,
            layOdds: null,
            site: 'Sportsbet'
          });

          console.log(`[Sportsbet Scraper] Extracted: ${finalName} @ Back ${winOdds}`);
        } catch (error) {
          console.error(`[Sportsbet Scraper] Error processing row ${index}:`, error);
        }
      });

      console.log(`[Sportsbet Scraper] Successfully extracted ${horses.length} horses`);
      resolve(horses);
    } catch (error) {
      console.error('[Sportsbet Scraper] Fatal error:', error);
      resolve([]);
    }
  });
}
