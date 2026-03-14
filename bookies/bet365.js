// bet365 scraper
// Returns back odds for horse racing
// Uses structural selectors to avoid dynamic obfuscated class names

console.log('[bet365 Scraper] Initializing on:', window.location.href);

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
  // Find all h4 elements (horse names)
  const h4Elements = document.querySelectorAll('h4');
  
  h4Elements.forEach(h4 => {
    // Extract name using same logic as scraping
    const spans = h4.querySelectorAll('span');
    let name = '';
    
    if (spans.length >= 2) {
      // Last span is typically the name (first span is the number)
      name = spans[spans.length - 1].textContent.trim();
    } else {
      // Fallback: Get full h4 text and remove leading numbers/dots
      const fullText = h4.textContent.trim();
      name = fullText.replace(/^\d+\.\s*/, '').trim();
    }
    
    // Clean horse name: remove trailing barrier
    name = name.replace(/\s*\(\d+\)\s*$/, '').trim();
    
    if (name.toLowerCase() === horseName.toLowerCase()) {
      // Find the main row container - traverse up to find direct child of section
      let targetElement = h4;
      let section = h4.closest('section');
      
      if (section) {
        // Find the direct child of section that contains this h4
        while (targetElement && targetElement.parentElement !== section) {
          targetElement = targetElement.parentElement;
        }
      } else {
        // Fallback: just go up a few levels
        targetElement = h4.parentElement?.parentElement?.parentElement?.parentElement;
      }
      
      if (targetElement) {
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        targetElement.style.transition = 'background-color 0.3s ease';
        targetElement.style.backgroundColor = '#ffeb3b';
        targetElement.style.setProperty('background-color', '#ffeb3b', 'important');
        setTimeout(() => { 
          targetElement.style.backgroundColor = ''; 
          targetElement.style.removeProperty('background-color');
        }, 2000);
        console.log('[bet365 Scraper] Highlighted:', horseName);
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
          site: 'bet365',
          url: window.location.href
        });
      })
      .catch(error => {
        console.error('[bet365 Scraper] Error:', error);
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
      // Find the main section containing runners
      const sections = document.querySelectorAll('section');
      
      console.log(`[bet365 Scraper] Found ${sections.length} sections`);

      sections.forEach((section) => {
        // Get direct children divs of this section
        const potentialRows = section.querySelectorAll(':scope > div');
        
        potentialRows.forEach((row, index) => {
          try {
            // Check if this div contains an h4 (indicates it's a runner row)
            const h4Element = row.querySelector('h4');
            if (!h4Element) {
              return; // Skip non-runner rows (headers, spacers, etc.)
            }

            // Extract horse name from h4
            // Strategy 1: Get the last span child (usually the name)
            const spans = h4Element.querySelectorAll('span');
            let horseName = '';
            
            if (spans.length >= 2) {
              // Last span is typically the name (first span is the number)
              horseName = spans[spans.length - 1].textContent.trim();
            } else {
              // Fallback: Get full h4 text and remove leading numbers/dots
              const fullText = h4Element.textContent.trim();
              // Remove patterns like "1. ", "12. ", etc.
              horseName = fullText.replace(/^\d+\.\s*/, '').trim();
            }
            
            // Clean horse name: remove trailing barrier (e.g., " (1)")
            horseName = horseName.replace(/\s*\(\d+\)\s*$/, '').trim();

            if (!horseName) {
              console.warn(`[bet365 Scraper] Row ${index}: Could not extract horse name`);
              return;
            }

            // Match with Betfair names if provided
            let finalName = horseName;
            if (targetHorseNames.length > 0) {
              const matchedName = findMatchingBetfairName(horseName, targetHorseNames);
              if (matchedName) {
                finalName = matchedName;
                console.log(`[bet365 Scraper] Matched "${horseName}" → Betfair: "${matchedName}"`);
              } else {
                console.log(`[bet365 Scraper] No match for "${horseName}", skipping`);
                return;
              }
            }

            // Extract win odds
            // Find the first .rul-ce0412 element (stable library class for odds text)
            const winOddsElement = row.querySelector('.rul-ce0412');
            
            if (!winOddsElement) {
              console.warn(`[bet365 Scraper] Row ${index} (${horseName}): No win odds element found`);
              return;
            }

            const winOddsText = winOddsElement.textContent.trim();
            const winOdds = parseFloat(winOddsText);

            if (isNaN(winOdds)) {
              console.warn(`[bet365 Scraper] Row ${index} (${horseName}): Invalid win odds "${winOddsText}"`);
              return;
            }

            // Standardized format: layOdds is null for bookmakers
            horses.push({
              name: finalName,
              backOdds: winOdds,
              layOdds: null,
              site: 'bet365'
            });

            console.log(`[bet365 Scraper] Extracted: ${finalName} @ Back ${winOdds}`);
          } catch (error) {
            console.error(`[bet365 Scraper] Error processing row ${index}:`, error);
          }
        });
      });

      console.log(`[bet365 Scraper] Successfully extracted ${horses.length} horses`);
      resolve(horses);
    } catch (error) {
      console.error('[bet365 Scraper] Fatal error:', error);
      resolve([]);
    }
  });
}
