// Background script for Matched Betting Dashboard
// Listens for extension icon clicks and opens the dashboard

chrome.action.onClicked.addListener((tab) => {
  // Create a new tab with the dashboard
  chrome.tabs.create({
    url: chrome.runtime.getURL('dashboard.html')
  });
});
