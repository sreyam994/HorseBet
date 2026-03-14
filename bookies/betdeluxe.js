// BetDeluxe scraper
// Returns back odds for horse racing
// Uses data-testid attributes (RaceCard-WinPlace-Panel)

console.log('[BetDeluxe Scraper] Initializing on:', window.location.href);

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
  const containers = document.querySelectorAll('[data-testid^="RaceCard-WinPlace-Panel-RunnerContainer-"]');
  containers.forEach(container => {
    const nameEl = container.querySelector('[data-testid$="-Runner-Label-RunnerName"]');
    if (!nameEl) return;
    const name = nameEl.textContent.trim();
    if (name.toLowerCase() === horseName.toLowerCase()) {
      container.scrollIntoView({ behavior: 'smooth', block: 'center' });
      container.style.transition = 'background-color 0.3s ease';
      container.style.backgroundColor = '#ffeb3b';
      container.style.setProperty('background-color', '#ffeb3b', 'important');
      setTimeout(() => {
        container.style.backgroundColor = '';
        container.style.removeProperty('background-color');
      }, 2000);
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
          site: 'BetDeluxe',
          url: window.location.href
        });
      })
      .catch(error => {
        console.error('[BetDeluxe Scraper] Error:', error);
        sendResponse({
          success: false,
          error: error.message,
          data: []
        });
      });
    return true;
  }
});

function scrapeOdds(targetHorseNames = []) {
  return new Promise((resolve) => {
    const horses = [];
    const processedNames = new Set();

    try {
      const containers = document.querySelectorAll('[data-testid^="RaceCard-WinPlace-Panel-RunnerContainer-"]');

      containers.forEach((container) => {
        try {
          const nameEl = container.querySelector('[data-testid$="-Runner-Label-RunnerName"]');
          if (!nameEl) return;

          let horseName = nameEl.textContent.trim();
          if (!horseName) return;

          if (processedNames.has(horseName)) return;

          const winBtn = container.querySelector('button[data-testid$="-FIXED-WinBtn"]');
          if (!winBtn) return;

          const winOddsText = winBtn.textContent.trim();
          const winOdds = parseFloat(winOddsText);
          if (isNaN(winOdds)) return;

          let finalName = horseName;
          if (targetHorseNames.length > 0) {
            const matchedName = findMatchingBetfairName(horseName, targetHorseNames);
            if (matchedName) {
              finalName = matchedName;
            } else {
              return;
            }
          }

          processedNames.add(finalName);
          horses.push({
            name: finalName,
            backOdds: winOdds,
            layOdds: null,
            site: 'BetDeluxe'
          });
        } catch (err) {
          console.warn('[BetDeluxe Scraper] Error processing container:', err);
        }
      });

      resolve(horses);
    } catch (error) {
      console.error('[BetDeluxe Scraper] Fatal error:', error);
      resolve([]);
    }
  });
}
