// TAB scraper
// Returns back odds for horse racing

console.log('[TAB Scraper] Initializing on:', window.location.href);

// Fuzzy match helper - checks if bookmaker name matches any Betfair name
function findMatchingBetfairName(bookmakeName, betfairNames) {
  if (!betfairNames || betfairNames.length === 0) return null;
  
  const normalize = (str) => str.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
  const normalizedBookie = normalize(bookmakeName);
  
  for (let betfairName of betfairNames) {
    const normalizedBetfair = normalize(betfairName);
    
    // Exact match
    if (normalizedBookie === normalizedBetfair) {
      return betfairName;
    }
    
    // Contains match (for cases like "Horse Name" vs "Horse Name Extra")
    if (normalizedBookie.includes(normalizedBetfair) || normalizedBetfair.includes(normalizedBookie)) {
      return betfairName;
    }
  }
  
  return null;
}

// Highlight horse on page
function highlightHorse(horseName) {
  const runnerRows = document.querySelectorAll('div.row[data-testid^="runner-number-"]');
  
  runnerRows.forEach(row => {
    const nameElement = row.querySelector('.runner-name');
    if (nameElement) {
      let name = nameElement.textContent.trim();
      name = name.replace(/^\d+\.\s*/, '').replace(/\s*\(\d+\)\s*$/, '').trim();
      
      if (name.toLowerCase() === horseName.toLowerCase()) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        row.style.transition = 'background-color 0.3s ease';
        row.style.backgroundColor = '#ffeb3b';
        setTimeout(() => { row.style.backgroundColor = ''; }, 2000);
        console.log('[TAB Scraper] Highlighted:', horseName);
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
          site: 'TAB',
          url: window.location.href
        });
      })
      .catch(error => {
        console.error('[TAB Scraper] Error:', error);
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
      const runnerRows = document.querySelectorAll('div.row[data-testid^="runner-number-"]');
      
      console.log(`[TAB Scraper] Found ${runnerRows.length} runner rows`);

      runnerRows.forEach((row, index) => {
        try {
          // Extract horse name
          const nameElement = row.querySelector('.runner-name');
          if (!nameElement) {
            console.warn(`[TAB Scraper] Row ${index}: No name element found`);
            return;
          }
          let horseName = nameElement.textContent.trim();
          
          // Clean horse name: remove leading number (e.g., "1. ") and trailing barrier (e.g., " (1)")
          horseName = horseName.replace(/^\d+\.\s*/, '').replace(/\s*\(\d+\)\s*$/, '').trim();

          // If we have Betfair target names, try to match
          let finalName = horseName;
          if (targetHorseNames.length > 0) {
            const matchedName = findMatchingBetfairName(horseName, targetHorseNames);
            if (matchedName) {
              finalName = matchedName; // Use Betfair name
              console.log(`[TAB Scraper] Matched "${horseName}" → Betfair: "${matchedName}"`);
            } else {
              console.log(`[TAB Scraper] No match for "${horseName}", skipping`);
              return; // Skip if no match found
            }
          }

          // Extract win odds
          const winOddsElement = row.querySelector('div[data-test-fixed-odds-win-price] .animate-odd');
          
          if (!winOddsElement) {
            console.warn(`[TAB Scraper] Row ${index} (${horseName}): No win odds element found`);
            return;
          }

          const winOddsText = winOddsElement.textContent.trim();

          // Skip if scratched or empty
          if (!winOddsText || winOddsText === 'SCR' || winOddsText === '') {
            console.log(`[TAB Scraper] Row ${index} (${horseName}): Scratched or no odds`);
            return;
          }

          const winOdds = parseFloat(winOddsText);

          if (isNaN(winOdds)) {
            console.warn(`[TAB Scraper] Row ${index} (${horseName}): Invalid win odds "${winOddsText}"`);
            return;
          }

          // Standardized format: layOdds is null for bookmakers
          horses.push({
            name: finalName, // Use matched Betfair name or original
            backOdds: winOdds,
            layOdds: null,
            site: 'TAB'
          });

          console.log(`[TAB Scraper] Extracted: ${finalName} @ Back ${winOdds}`);
        } catch (error) {
          console.error(`[TAB Scraper] Error processing row ${index}:`, error);
        }
      });

      console.log(`[TAB Scraper] Successfully extracted ${horses.length} horses`);
      resolve(horses);
    } catch (error) {
      console.error('[TAB Scraper] Fatal error:', error);
      resolve([]);
    }
  });
}
