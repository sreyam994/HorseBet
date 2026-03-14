// Unibet scraper
// Returns back odds for horse racing
// Uses data-test-id attributes (stable)

console.log('[Unibet Scraper] Initializing on:', window.location.href);

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

// Get horse name from name cell: second <strong> is the name (first is number, third is barrier)
function getHorseNameFromElement(element) {
  const strongs = element.querySelectorAll('strong');
  if (strongs.length >= 2) {
    return strongs[1].textContent.trim();
  }
  const full = element.textContent.trim();
  return full.replace(/^\d+\.\s*/, '').replace(/\s*\(\d+\)\s*$/, '').trim();
}

// Highlight horse on page
function highlightHorse(horseName) {
  const elements = document.querySelectorAll('div[data-test-id^="squence-"]');
  elements.forEach(elem => {
    const name = getHorseNameFromElement(elem);
    if (name && name.toLowerCase() === horseName.toLowerCase()) {
      elem.scrollIntoView({ behavior: 'smooth', block: 'center' });
      elem.style.transition = 'background-color 0.3s ease';
      elem.style.backgroundColor = '#ffeb3b';
      setTimeout(() => { elem.style.backgroundColor = ''; }, 2000);
      console.log('[Unibet Scraper] Highlighted:', horseName);
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
          site: 'Unibet',
          url: window.location.href
        });
      })
      .catch(error => {
        console.error('[Unibet Scraper] Error:', error);
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
    const processedNames = new Set(); // Track processed horses to avoid duplicates

    try {
      // Find all sequence elements (note the typo "squence" in their HTML)
      const sequenceElements = document.querySelectorAll('div[data-test-id^="squence-"]');
      
      console.log(`[Unibet Scraper] Found ${sequenceElements.length} sequence elements`);

      sequenceElements.forEach((element, index) => {
        try {
          const horseName = getHorseNameFromElement(element);
          if (!horseName) return;

          if (processedNames.has(horseName)) return;

          // Get sequence number from data-test-id (e.g. "squence-1-Arugamama" -> 1)
          const testId = element.getAttribute('data-test-id') || '';
          const seqMatch = testId.match(/^squence-(\d+)-/);
          const seqNum = seqMatch ? seqMatch[1] : null;
          if (!seqNum) {
            console.warn(`[Unibet Scraper] Element ${index} (${horseName}): Could not parse sequence from "${testId}"`);
            return;
          }

          // Win odds button is in a sibling WIN column cell; scope to same runners table (handles multiple races)
          const table = element.closest('[data-test-id^="runners-table-"]');
          const root = table || document;
          const winCell = Array.from(root.querySelectorAll(`[data-test-id="sequence-${seqNum}"]`))
            .find(el => el.querySelector('button[data-test-id*="FixedWin"]'));
          const winOddsButton = winCell && winCell.querySelector('button[data-test-id*="FixedWin"]');

          if (!winOddsButton) {
            console.warn(`[Unibet Scraper] Element ${index} (${horseName}): No win odds button for sequence ${seqNum}`);
            return;
          }

          const winOddsText = winOddsButton.textContent.trim();
          const winOdds = parseFloat(winOddsText);

          if (isNaN(winOdds)) {
            console.warn(`[Unibet Scraper] Element ${index} (${horseName}): Invalid win odds "${winOddsText}"`);
            return;
          }

          // Match with Betfair names if provided
          let finalName = horseName;
          if (targetHorseNames.length > 0) {
            const matchedName = findMatchingBetfairName(horseName, targetHorseNames);
            if (matchedName) {
              finalName = matchedName;
              console.log(`[Unibet Scraper] Matched "${horseName}" → Betfair: "${matchedName}"`);
            } else {
              console.log(`[Unibet Scraper] No match for "${horseName}", skipping`);
              return;
            }
          }

          // Mark as processed
          processedNames.add(finalName);

          // Standardized format: layOdds is null for bookmakers
          horses.push({
            name: finalName,
            backOdds: winOdds,
            layOdds: null,
            site: 'Unibet'
          });

          console.log(`[Unibet Scraper] Extracted: ${finalName} @ Back ${winOdds}`);
        } catch (error) {
          console.error(`[Unibet Scraper] Error processing element ${index}:`, error);
        }
      });

      console.log(`[Unibet Scraper] Successfully extracted ${horses.length} horses`);
      resolve(horses);
    } catch (error) {
      console.error('[Unibet Scraper] Fatal error:', error);
      resolve([]);
    }
  });
}
