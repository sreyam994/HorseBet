// Pointsbet scraper
// Returns back odds for horse racing
// Uses data-test attributes (stable) - WARNING: Highly obfuscated classes

console.log('[Pointsbet Scraper] Initializing on:', window.location.href);

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
  const runnerList = document.querySelector('div[data-test="runner-list"]');
  if (!runnerList) return;
  
  const rows = runnerList.querySelectorAll('li');
  rows.forEach(row => {
    const divs = row.querySelectorAll(':scope > div, h3, h4, h5, strong, b');
    for (let elem of divs) {
      const text = elem.textContent.trim();
      if (/^\d+\.\s+/.test(text)) {
        const firstLine = text.split(/[\n\r]/)[0].trim();
        const namePart = firstLine.split(/\s+[JTWF]:/)[0].trim();
        const name = namePart.replace(/^\d+\.\s+/, '').replace(/\s*\(\d+\)\s*$/, '').trim();
        
        if (name.toLowerCase() === horseName.toLowerCase()) {
          row.scrollIntoView({ behavior: 'smooth', block: 'center' });
          row.style.transition = 'background-color 0.3s ease';
          row.style.backgroundColor = '#ffeb3b';
          setTimeout(() => { row.style.backgroundColor = ''; }, 2000);
          console.log('[Pointsbet Scraper] Highlighted:', horseName);
          break;
        }
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
          site: 'Pointsbet',
          url: window.location.href
        });
      })
      .catch(error => {
        console.error('[Pointsbet Scraper] Error:', error);
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
      // Find the runner list container
      const runnerListContainer = document.querySelector('div[data-test="runner-list"]');
      
      if (!runnerListContainer) {
        console.warn('[Pointsbet Scraper] No runner list container found');
        resolve([]);
        return;
      }

      // Find all runner rows (li elements)
      const runnerRows = runnerListContainer.querySelectorAll('li');
      
      console.log(`[Pointsbet Scraper] Found ${runnerRows.length} runner rows`);

      runnerRows.forEach((row, index) => {
        try {
          // Extract horse name
          // Look for a more specific element - the name is usually in a span or div with specific styling
          // Strategy: Find text that starts with number. and extract only the first line/sentence
          let horseName = '';
          
          // Try to find a heading or emphasized text element first
          const headingElements = row.querySelectorAll('h3, h4, h5, strong, b, [class*="name"], [class*="Name"], [class*="runner"]');
          for (let element of headingElements) {
            const text = element.textContent.trim();
            if (text && /^\d+\.\s+/.test(text)) {
              // Extract only the first line (before any newline or long text)
              const firstLine = text.split(/[\n\r]/)[0].trim();
              // Get only the horse name part (stops at first J:, T:, W:, or long whitespace)
              const namePart = firstLine.split(/\s+[JTWF]:/)[0].trim();
              horseName = namePart.replace(/^\d+\.\s+/, '').replace(/\s*\(\d+\)\s*$/, '').trim();
              if (horseName) break;
            }
          }
          
          // Fallback: Look in divs but extract more carefully
          if (!horseName) {
            const divs = row.querySelectorAll(':scope > div');
            for (let div of divs) {
              const text = div.textContent.trim();
              if (/^\d+\.\s+/.test(text)) {
                // Extract only the first line
                const firstLine = text.split(/[\n\r]/)[0].trim();
                // Get only the horse name part (stops at first J:, T:, W:, or multiple spaces)
                const namePart = firstLine.split(/\s+[JTWF]:/)[0].trim();
                horseName = namePart.replace(/^\d+\.\s+/, '').replace(/\s*\(\d+\)\s*$/, '').trim();
                if (horseName) break;
              }
            }
          }

          if (!horseName) {
            console.warn(`[Pointsbet Scraper] Row ${index}: No horse name found`);
            return;
          }

          let finalName = horseName;
          if (targetHorseNames.length > 0) {
            const matchedName = findMatchingBetfairName(horseName, targetHorseNames);
            if (matchedName) {
              finalName = matchedName;
              console.log(`[Pointsbet Scraper] Matched "${horseName}" → Betfair: "${matchedName}"`);
            } else {
              console.log(`[Pointsbet Scraper] No match for "${horseName}", skipping`);
              return;
            }
          }

          // Extract win odds
          // Look for button with data-test ending in "OutcomeRunnerWinOddsButton"
          const winOddsButton = row.querySelector('button[data-test$="OutcomeRunnerWinOddsButton"]');
          
          if (!winOddsButton) {
            console.warn(`[Pointsbet Scraper] Row ${index} (${horseName}): No win odds button found`);
            return;
          }

          const winOddsText = winOddsButton.textContent.trim();
          const winOdds = parseFloat(winOddsText);

          if (isNaN(winOdds)) {
            console.warn(`[Pointsbet Scraper] Row ${index} (${horseName}): Invalid win odds "${winOddsText}"`);
            return;
          }

          // Standardized format: layOdds is null for bookmakers
          horses.push({
            name: finalName,
            backOdds: winOdds,
            layOdds: null,
            site: 'Pointsbet'
          });

          console.log(`[Pointsbet Scraper] Extracted: ${finalName} @ Back ${winOdds}`);
        } catch (error) {
          console.error(`[Pointsbet Scraper] Error processing row ${index}:`, error);
        }
      });

      console.log(`[Pointsbet Scraper] Successfully extracted ${horses.length} horses`);
      resolve(horses);
    } catch (error) {
      console.error('[Pointsbet Scraper] Fatal error:', error);
      resolve([]);
    }
  });
}
