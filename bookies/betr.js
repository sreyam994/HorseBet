// Betr scraper
// Returns back odds for horse racing
// WARNING: Uses JSS classes - DO NOT use them, use data-test-id

console.log('[Betr Scraper] Initializing on:', window.location.href);

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
  const runnerRows = document.querySelectorAll('div[data-test-id^="RUNNER-"]');
  
  runnerRows.forEach(row => {
    const divs = row.querySelectorAll('h3, h4, h5, strong, b, p, div');
    for (let elem of divs) {
      const text = elem.textContent.trim();
      if (/^\d+\.\s+/.test(text)) {
        const firstLine = text.split(/[\n\r]/)[0].trim();
        const namePart = firstLine.split(/\s+[WJFT]:/)[0].trim();
        const name = namePart.replace(/^\d+\.\s+/, '').replace(/\s*\(\d+\)\s*$/, '').trim();
        
        if (name.toLowerCase() === horseName.toLowerCase()) {
          row.scrollIntoView({ behavior: 'smooth', block: 'center' });
          row.style.transition = 'background-color 0.3s ease';
          row.style.backgroundColor = '#ffeb3b';
          setTimeout(() => { row.style.backgroundColor = ''; }, 2000);
          console.log('[Betr Scraper] Highlighted:', horseName);
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
          site: 'Betr',
          url: window.location.href
        });
      })
      .catch(error => {
        console.error('[Betr Scraper] Error:', error);
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
      // Find all runner rows using data-test-id
      const runnerRows = document.querySelectorAll('div[data-test-id^="RUNNER-"]');
      
      console.log(`[Betr Scraper] Found ${runnerRows.length} runner rows`);

      runnerRows.forEach((row, index) => {
        try {
          // Extract horse name
          // Name is in a div following the SVG/Silk image
          // Look for text containing "number. Horse Name" pattern
          let horseName = '';
          
          // Try to find heading or emphasized elements first
          const headingElements = row.querySelectorAll('h3, h4, h5, strong, b, p, [class*="name"], [class*="Name"], [class*="runner"]');
          for (let element of headingElements) {
            const text = element.textContent.trim();
            if (text && /^\d+\.\s+/.test(text)) {
              // Extract only the first line (before any newline or long text)
              const firstLine = text.split(/[\n\r]/)[0].trim();
              // Get only the horse name part (stops at first W:, J:, F:, T:)
              const namePart = firstLine.split(/\s+[WJFT]:/)[0].trim();
              horseName = namePart.replace(/^\d+\.\s+/, '').replace(/\s*\(\d+\)\s*$/, '').trim();
              if (horseName) break;
            }
          }
          
          // Fallback: Look in divs but extract more carefully
          if (!horseName) {
            const divs = row.querySelectorAll('div');
            for (let div of divs) {
              const text = div.textContent.trim();
              if (/^\d+\.\s+/.test(text)) {
                // Extract only the first line
                const firstLine = text.split(/[\n\r]/)[0].trim();
                // Get only the horse name part (stops at first W:, J:, F:, T:)
                const namePart = firstLine.split(/\s+[WJFT]:/)[0].trim();
                horseName = namePart.replace(/^\d+\.\s+/, '').replace(/\s*\(\d+\)\s*$/, '').trim();
                if (horseName) break;
              }
            }
          }

          if (!horseName) {
            console.warn(`[Betr Scraper] Row ${index}: No horse name found`);
            return;
          }

          let finalName = horseName;
          if (targetHorseNames.length > 0) {
            const matchedName = findMatchingBetfairName(horseName, targetHorseNames);
            if (matchedName) {
              finalName = matchedName;
              console.log(`[Betr Scraper] Matched "${horseName}" → Betfair: "${matchedName}"`);
            } else {
              console.log(`[Betr Scraper] No match for "${horseName}", skipping`);
              return;
            }
          }

          // Extract win odds
          // Look for the first button containing a numeric value
          const buttons = row.querySelectorAll('button');
          let winOdds = null;
          
          for (let button of buttons) {
            const buttonText = button.textContent.trim();
            const possibleOdds = parseFloat(buttonText);
            
            if (!isNaN(possibleOdds) && possibleOdds > 1) {
              winOdds = possibleOdds;
              break;
            }
          }

          if (winOdds === null) {
            console.warn(`[Betr Scraper] Row ${index} (${horseName}): No valid win odds found`);
            return;
          }

          // Standardized format: layOdds is null for bookmakers
          horses.push({
            name: finalName,
            backOdds: winOdds,
            layOdds: null,
            site: 'Betr'
          });

          console.log(`[Betr Scraper] Extracted: ${finalName} @ Back ${winOdds}`);
        } catch (error) {
          console.error(`[Betr Scraper] Error processing row ${index}:`, error);
        }
      });

      console.log(`[Betr Scraper] Successfully extracted ${horses.length} horses`);
      resolve(horses);
    } catch (error) {
      console.error('[Betr Scraper] Fatal error:', error);
      resolve([]);
    }
  });
}
