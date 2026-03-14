// Dashboard logic for Matched Betting Extension

class MatchedBettingDashboard {
  constructor() {
    this.oddsData = [];
    this.refreshBtn = document.getElementById('refreshBtn');
    this.statusDiv = document.getElementById('status');
    this.tableBody = document.getElementById('tableBody');
    this.filterOptionsDiv = document.getElementById('filterOptions');
    this.toggleAllBtn = document.getElementById('toggleAllBtn');
    this.autoRefreshInterval = null;
    this.isCollapsed = false;
    this.COLLAPSE_THRESHOLD = 10;
    this.enabledBookies = new Set();
    this.availableBookies = new Set();

    this.commissionValue = 0.08;
    this.commissionEnabled = true;

    this.backStakeValue = 50;

    this.retentionValue = 80;
    this.placesPaid = 3;

    this.evHighlightThreshold = 7;

    this.mode = 'bonus';

    this.colorThresholds = {
      bonus: {
        darkGreen: 90,
        lightGreen: 80,
        yellow: 75,
        orange: 70
      },
      nonPromo: {
        darkGreen: -5,
        lightGreen: -7.5,
        yellow: -10,
        orange: -12.5
      }
    };
    this.eliteMode = false;

    this.init();
  }

  async init() {
    this.commissionInput = document.getElementById('commissionInput');
    this.commissionCheckbox = document.getElementById('commissionEnabled');
    this.backStakeInput = document.getElementById('backStakeInput');

    try {
      const stored = await chrome.storage.local.get([
        'betfairCommission',
        'betfairCommissionEnabled',
        'backStakeValue',
        'bettingMode',
        'colorThresholds',
        'eliteMode'
      ]);

      let percent = 8;
      if (stored.betfairCommission != null) {
        percent = Math.max(0, Math.min(20, Math.round(Number(stored.betfairCommission))));
      }
      this.commissionValue = percent / 100;
      if (this.commissionInput) this.commissionInput.value = percent;

      if (stored.betfairCommissionEnabled != null) {
        this.commissionEnabled = !!stored.betfairCommissionEnabled;
        if (this.commissionCheckbox) this.commissionCheckbox.checked = this.commissionEnabled;
      }

      if (stored.backStakeValue != null) {
        const parsedStake = Number(stored.backStakeValue);
        if (Number.isFinite(parsedStake) && parsedStake > 0) {
          this.backStakeValue = parsedStake;
        }
      }
      if (this.backStakeInput) this.backStakeInput.value = this.backStakeValue;

      if (stored.bettingMode) {
        this.mode = stored.bettingMode;
      }

      if (stored.colorThresholds) {
        this.colorThresholds = stored.colorThresholds;
      }

      if (stored.eliteMode != null) {
        this.eliteMode = !!stored.eliteMode;
        if (this.eliteMode) {
          this.colorThresholds.nonPromo = { darkGreen: -1, lightGreen: -2.7, yellow: -5.6, orange: -8.3 };
        }
      }
    } catch (e) {
      console.warn('[Dashboard] Could not load settings:', e);
    }

    this.modeSelect = document.getElementById('modeSelect');
    if (this.modeSelect) {
      this.modeSelect.value = this.mode;
      this.modeSelect.addEventListener('change', () => this.onModeChange());
    }

    this.refreshBtn.addEventListener('click', () => this.fetchOdds());
    this.toggleAllBtn.addEventListener('click', () => this.toggleAllBookies());

    if (this.commissionInput) {
      this.commissionInput.addEventListener('input', () => this.onPricingInputsChange());
      this.commissionInput.addEventListener('change', () => this.onPricingInputsChange());
    }
    if (this.commissionCheckbox) {
      this.commissionCheckbox.addEventListener('change', () => this.onPricingInputsChange());
    }
    if (this.backStakeInput) {
      this.backStakeInput.addEventListener('input', () => this.onPricingInputsChange());
      this.backStakeInput.addEventListener('change', () => this.onPricingInputsChange());
    }

    this.settingsBtn = document.getElementById('settingsBtn');
    this.settingsModal = document.getElementById('settingsModal');
    this.closeModalBtn = document.querySelector('.close');
    this.saveSettingsBtn = document.getElementById('saveSettingsBtn');
    this.resetDefaultsBtn = document.getElementById('resetDefaultsBtn');
    this.eliteModeCheckbox = document.getElementById('eliteModeCheckbox');

    if (this.settingsBtn) {
      this.settingsBtn.addEventListener('click', () => this.openSettingsModal());
    }
    if (this.closeModalBtn) {
      this.closeModalBtn.addEventListener('click', () => this.closeSettingsModal());
    }
    if (this.saveSettingsBtn) {
      this.saveSettingsBtn.addEventListener('click', () => this.saveColorSettings());
    }
    if (this.resetDefaultsBtn) {
      this.resetDefaultsBtn.addEventListener('click', () => this.resetToDefaults());
    }
    if (this.eliteModeCheckbox) {
      this.eliteModeCheckbox.addEventListener('change', () => this.onEliteModeToggle());
    }

    window.addEventListener('click', (e) => {
      if (e.target === this.settingsModal) {
        this.closeSettingsModal();
      }
    });

    this.fetchOdds();
    this.startAutoRefresh();
  }

  onPricingInputsChange() {
    const rawCommission = parseFloat(this.commissionInput?.value);
    const percent = isNaN(rawCommission) ? 8 : Math.max(0, Math.min(20, Math.round(rawCommission)));
    if (this.commissionInput) this.commissionInput.value = percent;
    this.commissionValue = percent / 100;
    this.commissionEnabled = !!this.commissionCheckbox?.checked;

    const rawStake = parseFloat(this.backStakeInput?.value);
    this.backStakeValue = Number.isFinite(rawStake) && rawStake > 0 ? rawStake : 50;
    if (this.backStakeInput) this.backStakeInput.value = this.backStakeValue;

    chrome.storage.local.set({
      betfairCommission: percent,
      betfairCommissionEnabled: this.commissionEnabled,
      backStakeValue: this.backStakeValue
    }).catch(() => {});

    this.renderTable();
  }

  onModeChange() {
    this.mode = this.modeSelect.value;
    chrome.storage.local.set({ bettingMode: this.mode }).catch(() => {});
    this.renderTable();
  }

  openSettingsModal() {
    document.getElementById('bonus-dark-green').value = this.colorThresholds.bonus.darkGreen;
    document.getElementById('bonus-light-green').value = this.colorThresholds.bonus.lightGreen;
    document.getElementById('bonus-yellow').value = this.colorThresholds.bonus.yellow;
    document.getElementById('bonus-orange').value = this.colorThresholds.bonus.orange;

    const npDark = document.getElementById('nonpromo-dark-green');
    const npLight = document.getElementById('nonpromo-light-green');
    const npYellow = document.getElementById('nonpromo-yellow');
    const npOrange = document.getElementById('nonpromo-orange');

    if (this.eliteModeCheckbox) this.eliteModeCheckbox.checked = this.eliteMode;

    if (this.eliteMode) {
      npDark.value = -1;
      npLight.value = -2.7;
      npYellow.value = -5.6;
      npOrange.value = -8.3;
      npDark.disabled = npLight.disabled = npYellow.disabled = npOrange.disabled = true;
    } else {
      npDark.value = this.colorThresholds.nonPromo.darkGreen;
      npLight.value = this.colorThresholds.nonPromo.lightGreen;
      npYellow.value = this.colorThresholds.nonPromo.yellow;
      npOrange.value = this.colorThresholds.nonPromo.orange;
      npDark.disabled = npLight.disabled = npYellow.disabled = npOrange.disabled = false;
    }

    this.settingsModal.style.display = 'block';
  }

  onEliteModeToggle() {
    const checked = this.eliteModeCheckbox && this.eliteModeCheckbox.checked;
    const npDark = document.getElementById('nonpromo-dark-green');
    const npLight = document.getElementById('nonpromo-light-green');
    const npYellow = document.getElementById('nonpromo-yellow');
    const npOrange = document.getElementById('nonpromo-orange');

    if (checked) {
      npDark.value = -1;
      npLight.value = -2.7;
      npYellow.value = -5.6;
      npOrange.value = -8.3;
      npDark.disabled = npLight.disabled = npYellow.disabled = npOrange.disabled = true;
    } else {
      npDark.value = this.colorThresholds.nonPromo.darkGreen;
      npLight.value = this.colorThresholds.nonPromo.lightGreen;
      npYellow.value = this.colorThresholds.nonPromo.yellow;
      npOrange.value = this.colorThresholds.nonPromo.orange;
      npDark.disabled = npLight.disabled = npYellow.disabled = npOrange.disabled = false;
    }
  }

  closeSettingsModal() {
    this.settingsModal.style.display = 'none';
  }

  saveColorSettings() {
    const eliteOn = this.eliteModeCheckbox && this.eliteModeCheckbox.checked;
    this.eliteMode = eliteOn;

    this.colorThresholds = {
      bonus: {
        darkGreen: parseFloat(document.getElementById('bonus-dark-green').value) || 90,
        lightGreen: parseFloat(document.getElementById('bonus-light-green').value) || 80,
        yellow: parseFloat(document.getElementById('bonus-yellow').value) || 75,
        orange: parseFloat(document.getElementById('bonus-orange').value) || 70
      },
      nonPromo: eliteOn
        ? { darkGreen: -1, lightGreen: -2.7, yellow: -5.6, orange: -8.3 }
        : {
            darkGreen: parseFloat(document.getElementById('nonpromo-dark-green').value) || -5,
            lightGreen: parseFloat(document.getElementById('nonpromo-light-green').value) || -7.5,
            yellow: parseFloat(document.getElementById('nonpromo-yellow').value) || -10,
            orange: parseFloat(document.getElementById('nonpromo-orange').value) || -12.5
          }
    };

    chrome.storage.local.set({
      colorThresholds: this.colorThresholds,
      eliteMode: this.eliteMode
    }).catch(() => {});

    this.renderTable();
    this.closeSettingsModal();
  }

  resetToDefaults() {
    this.eliteMode = false;
    this.colorThresholds = {
      bonus: { darkGreen: 90, lightGreen: 80, yellow: 75, orange: 70 },
      nonPromo: { darkGreen: -5, lightGreen: -7.5, yellow: -10, orange: -12.5 }
    };

    chrome.storage.local.set({
      colorThresholds: this.colorThresholds,
      eliteMode: false
    }).catch(() => {});

    document.getElementById('bonus-dark-green').value = this.colorThresholds.bonus.darkGreen;
    document.getElementById('bonus-light-green').value = this.colorThresholds.bonus.lightGreen;
    document.getElementById('bonus-yellow').value = this.colorThresholds.bonus.yellow;
    document.getElementById('bonus-orange').value = this.colorThresholds.bonus.orange;

    if (this.eliteModeCheckbox) this.eliteModeCheckbox.checked = false;

    const npDark = document.getElementById('nonpromo-dark-green');
    const npLight = document.getElementById('nonpromo-light-green');
    const npYellow = document.getElementById('nonpromo-yellow');
    const npOrange = document.getElementById('nonpromo-orange');

    npDark.value = this.colorThresholds.nonPromo.darkGreen;
    npLight.value = this.colorThresholds.nonPromo.lightGreen;
    npYellow.value = this.colorThresholds.nonPromo.yellow;
    npOrange.value = this.colorThresholds.nonPromo.orange;
    npDark.disabled = npLight.disabled = npYellow.disabled = npOrange.disabled = false;
  }

  startAutoRefresh() {
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
    }

    this.autoRefreshInterval = setInterval(() => {
      this.fetchOdds(true);
    }, 1000);

    console.log('[Dashboard] Auto-refresh started (1s interval)');
  }

  stopAutoRefresh() {
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
      this.autoRefreshInterval = null;
      console.log('[Dashboard] Auto-refresh stopped');
    }
  }

  getBookieScriptFile(url) {
    if (!url) return null;
    if (url.includes('betfair.com.au')) return 'bookies/betfair.js';
    if (url.includes('tab.com.au')) return 'bookies/tab.js';
    if (url.includes('bet365.com')) return 'bookies/bet365.js';
    if (url.includes('sportsbet.com.au')) return 'bookies/sportsbet.js';
    if (url.includes('ladbrokes.com.au')) return 'bookies/ladbrokes.js';
    if (url.includes('neds.com.au')) return 'bookies/neds.js';
    if (url.includes('pointsbet.com')) return 'bookies/pointsbet.js';
    if (url.includes('betr.com.au')) return 'bookies/betr.js';
    if (url.includes('unibet.com')) return 'bookies/unibet.js';
    if (url.includes('betdeluxe.com.au')) return 'bookies/betdeluxe.js';
    return null;
  }

  async fetchOdds(silent = false) {
    if (!silent) {
      this.setStatus('🔄 Scanning open tabs...', 'loading');
      this.refreshBtn.disabled = true;
    }

    this.oddsData = [];
    this.availableBookies.clear();

    try {
      const tabs = await chrome.tabs.query({});
      if (!silent) {
        this.setStatus(`📡 Found ${tabs.length} tabs, requesting odds data...`, 'loading');
      }

      const betfairTabs = tabs.filter(tab => tab.url && tab.url.includes('betfair.com.au'));
      let betfairHorseNames = [];

      if (betfairTabs.length > 0) {
        if (!silent) {
          this.setStatus('🏇 Loading Betfair data (source of truth)...', 'loading');
        }

        const betfairResults = await Promise.allSettled(
          betfairTabs.map(tab => this.requestOddsFromTab(tab))
        );

        betfairResults.forEach(result => {
          if (result.status === 'fulfilled' && result.value) {
            const { data, tabInfo } = result.value;
            if (data && data.length > 0) {
              this.mergeOddsData(data, tabInfo);
              data.forEach(horse => {
                if (horse.name) betfairHorseNames.push(horse.name);
              });
            }
          }
        });
      }

      const bookieTabs = tabs.filter(
        tab => tab.url && !tab.url.includes('betfair.com.au') && this.getBookieScriptFile(tab.url)
      );

      if (bookieTabs.length > 0) {
        if (!silent) {
          this.setStatus('📊 Searching bookmakers for Betfair horses...', 'loading');
        }

        const bookieResults = await Promise.allSettled(
          bookieTabs.map(tab => this.requestOddsFromTab(tab, betfairHorseNames))
        );

        bookieResults.forEach(result => {
          if (result.status === 'fulfilled' && result.value) {
            const { data, tabInfo } = result.value;
            if (data && data.length > 0) {
              this.mergeOddsData(data, tabInfo);
            }
          }
        });
      }

      this.updateBookieFilters();

      if (this.oddsData.length === 0) {
        if (!silent) {
          this.setStatus(
            '⚠️ No odds data found. Make sure you have betting tabs open (Betfair, TAB, bet365, Sportsbet, Ladbrokes, Neds, PointsBet, Betr, Unibet, BetDeluxe).',
            'warning'
          );
        }
        this.renderEmptyState();
      } else {
        const totalLoadedTabs = betfairTabs.length + bookieTabs.length;
        if (!silent) {
          this.setStatus(
            `Successfully loaded odds from ${totalLoadedTabs} tab(s). Found ${this.oddsData.length} odds entries. Auto-refreshing every 1s.`,
            'success'
          );
        }
        this.renderTable();
      }
    } catch (error) {
      console.error('Error fetching odds:', error);
      if (!silent) {
        this.setStatus('❌ Error fetching odds. Check console for details.', 'error');
      }
    } finally {
      if (!silent) {
        this.refreshBtn.disabled = false;
      }
    }
  }

  async requestOddsFromTab(tab, targetHorseNames = []) {
    return new Promise(async (resolve) => {
      const timeout = setTimeout(() => {
        resolve(null);
      }, 2000);

      const message = {
        action: 'request_odds',
        targetHorseNames: targetHorseNames
      };

      chrome.tabs.sendMessage(tab.id, message, async (response) => {
        clearTimeout(timeout);

        if (chrome.runtime.lastError) {
          const scriptFile = this.getBookieScriptFile(tab.url);

          try {
            if (scriptFile) {
              await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: [scriptFile]
              });

              await new Promise(r => setTimeout(r, 500));

              const retryMessage = {
                action: 'request_odds',
                targetHorseNames: targetHorseNames
              };

              chrome.tabs.sendMessage(tab.id, retryMessage, (response2) => {
                if (chrome.runtime.lastError) {
                  resolve(null);
                  return;
                }

                if (response2 && response2.success) {
                  resolve({
                    data: response2.data,
                    tabInfo: {
                      url: tab.url,
                      title: tab.title,
                      tabId: tab.id
                    }
                  });
                } else {
                  resolve(null);
                }
              });
            } else {
              resolve(null);
            }
          } catch (error) {
            console.error(`[Dashboard] Failed to inject script into tab ${tab.id}:`, error);
            resolve(null);
          }
          return;
        }

        if (response && response.success) {
          resolve({
            data: response.data,
            tabInfo: {
              url: tab.url,
              title: tab.title,
              tabId: tab.id
            }
          });
        } else {
          resolve(null);
        }
      });
    });
  }

  mergeOddsData(data, tabInfo) {
    data.forEach(horse => {
      this.oddsData.push({
        name: horse.name,
        normalizedName: this.normalizeHorseName(horse.name),
        backOdds: horse.backOdds,
        layOdds: horse.layOdds,
        liquidity: horse.liquidity ?? null,
        site: horse.site,
        source: `${horse.site}: ${tabInfo.url}`,
        tabId: tabInfo.tabId,
        tabUrl: tabInfo.url
      });

      if (horse.site !== 'Betfair') {
        this.availableBookies.add(horse.site);
      }
    });
  }

  normalizeHorseName(name) {
    if (!name) return '';

    return String(name)
      .toLowerCase()
      .replace(/^\d+\s*[.\-]?\s*/, '')              // leading runner number
      .replace(/\[[^\]]*\]/g, ' ')                  // [..]
      .replace(/\([^)]*\)/g, ' ')                   // (..)
      .replace(/\b(nz|aus|gb|ire|fr|usa|saf|jpn)\b/g, ' ')
      .replace(/['’`]/g, '')                        // apostrophes
      .replace(/[^a-z0-9]+/g, ' ')                  // punctuation to space
      .replace(/\s+/g, ' ')
      .trim();
  }

  getCompactHorseKey(name) {
    return this.normalizeHorseName(name).replace(/\s+/g, '');
  }

  getMatchedHorseGroupKey(entry, horseGroups) {
    const exactKey = entry.normalizedName;
    if (horseGroups.has(exactKey)) {
      return exactKey;
    }

    const compactKey = this.getCompactHorseKey(entry.name);

    for (const existingKey of horseGroups.keys()) {
      const existingCompact = existingKey.replace(/\s+/g, '');

      if (compactKey === existingCompact) {
        return existingKey;
      }

      if (compactKey && existingCompact) {
        if (compactKey.includes(existingCompact) || existingCompact.includes(compactKey)) {
          return existingKey;
        }
      }
    }

    return exactKey;
  }

  parseCurrency(value) {
    if (value == null) return null;
    if (typeof value === 'number') return value;
    const parsed = parseFloat(String(value).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }

  calculateRetention(betfairLay, bookieBack) {
    if (!betfairLay || !bookieBack) return null;

    if (this.commissionEnabled) {
      const denominator = betfairLay - this.commissionValue;
      if (denominator <= 0) return null;
      return ((bookieBack - 1) * (1 - this.commissionValue) / denominator) * 100;
    }

    return ((bookieBack - 1) / betfairLay) * 100;
  }

  calculateLayStake(betfairLay, bookieBack, backStake = this.backStakeValue) {
    if (!betfairLay || !bookieBack || !backStake) return null;

    const denominator = this.commissionEnabled
      ? (betfairLay - this.commissionValue)
      : betfairLay;

    if (denominator <= 0) return null;

    return (backStake * bookieBack) / denominator;
  }

  calculateExpectedReturn(betfairLay, bookieBack, backStake = this.backStakeValue) {
    const layStake = this.calculateLayStake(betfairLay, bookieBack, backStake);
    if (layStake == null) return null;

    const layWinAfterCommission = this.commissionEnabled
      ? layStake * (1 - this.commissionValue)
      : layStake;

    return layWinAfterCommission - backStake;
  }

  calculateReturnsAndLiability(backStake, bookieBack, layStake, betfairLay) {
    if (!backStake || !bookieBack || !layStake || !betfairLay) return null;

    const winReturn = backStake * (bookieBack - 1) - layStake * (betfairLay - 1);
    const loseReturn = this.commissionEnabled
      ? (-backStake + layStake * (1 - this.commissionValue))
      : (-backStake + layStake);

    return {
      winReturn,
      loseReturn,
      liability: layStake * (betfairLay - 1)
    };
  }

  estimatePlaceOdds(layOdds, placesPaid, numRunners) {
    if (!layOdds || !placesPaid || !numRunners) return null;
    if (placesPaid <= 1) return 0;
    if (numRunners <= placesPaid) return 1;

    const hpLookup = {
      1: 1000,
      2: 1000,
      3: 1000,
      4: 10,
      5: 7,
      6: 6,
      7: 5
    };

    const divisor = hpLookup[numRunners] ?? (4.2 - (numRunners - 8) / 10);
    return ((layOdds - 1) / divisor / placesPaid) * 3 + 1;
  }

  calculateBonusBackPlaceEv(betfairLay, bookieBack, backStake = this.backStakeValue, numRunners = 0) {
    const layStake = this.calculateLayStake(betfairLay, bookieBack, backStake);
    if (layStake == null) return null;

    const returns = this.calculateReturnsAndLiability(backStake, bookieBack, layStake, betfairLay);
    if (!returns) return null;

    const winProb = 1 / betfairLay;
    const placeOdds = this.estimatePlaceOdds(betfairLay, this.placesPaid, numRunners);
    if (!placeOdds || placeOdds <= 0) return null;

    const placeOnlyProb = Math.max(0, (1 / placeOdds) - winProb);
    const loseProb = Math.max(0, 1 - winProb - placeOnlyProb);

    const bonusValue = backStake * (this.retentionValue / 100);
    const placeReturn = returns.loseReturn + bonusValue;

    const ev =
      winProb * returns.winReturn +
      placeOnlyProb * placeReturn +
      loseProb * returns.loseReturn;

    return {
      ev,
      winReturn: returns.winReturn,
      loseReturn: returns.loseReturn,
      placeOdds
    };
  }

  calculateNonPromoLossWin(betfairLay, bookieBack) {
    if (!betfairLay || !bookieBack) return null;

    const backStake = this.backStakeValue;

    let layStake;
    if (this.commissionEnabled) {
      layStake = (backStake * bookieBack) / (betfairLay - this.commissionValue);
    } else {
      layStake = (backStake * bookieBack) / betfairLay;
    }

    const backProfit = backStake * (bookieBack - 1);
    const layLoss = layStake * (betfairLay - 1);
    const outcome = backProfit - layLoss;

    return (outcome / backStake) * 100;
  }

  generateCombinations() {
    const combinations = [];
    const horseGroups = new Map();

    this.oddsData.forEach(entry => {
      const groupKey = this.getMatchedHorseGroupKey(entry, horseGroups);

      if (!horseGroups.has(groupKey)) {
        horseGroups.set(groupKey, {
          name: entry.name,
          betfair: [],
          bookies: [],
          tabIds: {}
        });
      }

      const group = horseGroups.get(groupKey);

      // Prefer the cleaner/shorter display name
      if (!group.name || entry.name.length < group.name.length) {
        group.name = entry.name;
      }

      group.tabIds[entry.site] = { tabId: entry.tabId, url: entry.tabUrl };

      if (entry.site === 'Betfair') {
        group.betfair.push(entry);
      } else {
        group.bookies.push(entry);
      }
    });

    const numRunners = this.oddsData.filter(entry => entry.site === 'Betfair').length;

    horseGroups.forEach(group => {
      if (group.betfair.length > 0 && group.bookies.length > 0) {
        group.betfair.forEach(betfairEntry => {
          group.bookies.forEach(bookieEntry => {
            if (this.enabledBookies.has(bookieEntry.site)) {
              const layStake = this.calculateLayStake(
                betfairEntry.layOdds,
                bookieEntry.backOdds,
                this.backStakeValue
              );

              const xr = this.calculateExpectedReturn(
                betfairEntry.layOdds,
                bookieEntry.backOdds,
                this.backStakeValue
              );

              const evData = this.calculateBonusBackPlaceEv(
                betfairEntry.layOdds,
                bookieEntry.backOdds,
                this.backStakeValue,
                numRunners
              );

              const ev = evData ? evData.ev : null;

              const retentionValue = this.mode === 'bonus'
                ? this.calculateRetention(betfairEntry.layOdds, bookieEntry.backOdds)
                : this.calculateNonPromoLossWin(betfairEntry.layOdds, bookieEntry.backOdds);

              combinations.push({
                name: group.name,
                betfairLayOdds: betfairEntry.layOdds,
                bookieBackOdds: bookieEntry.backOdds,
                bookieName: bookieEntry.site,
                liquidity: betfairEntry.liquidity ?? null,
                layStake,
                xr,
                ev,
                retention: retentionValue,
                tabIds: group.tabIds
              });
            }
          });
        });
      } else if (group.betfair.length > 0) {
        group.betfair.forEach(betfairEntry => {
          combinations.push({
            name: group.name,
            betfairLayOdds: betfairEntry.layOdds,
            bookieBackOdds: null,
            bookieName: null,
            liquidity: betfairEntry.liquidity ?? null,
            layStake: null,
            xr: null,
            ev: null,
            retention: null,
            tabIds: group.tabIds
          });
        });
      } else if (group.bookies.length > 0) {
        group.bookies.forEach(bookieEntry => {
          if (this.enabledBookies.has(bookieEntry.site)) {
            combinations.push({
              name: group.name,
              betfairLayOdds: null,
              bookieBackOdds: bookieEntry.backOdds,
              bookieName: bookieEntry.site,
              liquidity: null,
              layStake: null,
              xr: null,
              ev: null,
              retention: null,
              tabIds: group.tabIds
            });
          }
        });
      }
    });

    return combinations;
  }

  updateBookieFilters() {
    const currentBookies = Array.from(this.availableBookies).sort();
    const existingCheckboxes = this.filterOptionsDiv.querySelectorAll('input[type="checkbox"]');
    const existingBookies = Array.from(existingCheckboxes).map(cb => cb.value);

    if (JSON.stringify(currentBookies) !== JSON.stringify(existingBookies)) {
      this.filterOptionsDiv.innerHTML = '';

      if (currentBookies.length === 0) {
        this.filterOptionsDiv.innerHTML = '<span style="color: #666; font-size: 14px;">No bookies available</span>';
        this.toggleAllBtn.style.display = 'none';
        return;
      }

      this.toggleAllBtn.style.display = 'block';

      currentBookies.forEach(bookie => {
        if (!this.enabledBookies.has(bookie)) {
          this.enabledBookies.add(bookie);
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'filter-checkbox';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `filter-${bookie}`;
        checkbox.value = bookie;
        checkbox.checked = this.enabledBookies.has(bookie);
        checkbox.className = 'bookie-checkbox';

        checkbox.addEventListener('change', (e) => {
          if (e.target.checked) {
            this.enabledBookies.add(bookie);
          } else {
            this.enabledBookies.delete(bookie);
          }
          this.updateToggleAllButton();
          this.renderTable();
        });

        const label = document.createElement('label');
        label.htmlFor = `filter-${bookie}`;
        label.textContent = bookie;

        wrapper.appendChild(checkbox);
        wrapper.appendChild(label);
        this.filterOptionsDiv.appendChild(wrapper);
      });

      this.updateToggleAllButton();
    }
  }

  updateToggleAllButton() {
    const checkboxes = this.filterOptionsDiv.querySelectorAll('.bookie-checkbox');
    const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;

    this.toggleAllBtn.textContent =
      checkboxes.length > 0 && checkedCount === checkboxes.length
        ? 'Unselect All'
        : 'Select All';
  }

  toggleAllBookies() {
    const checkboxes = this.filterOptionsDiv.querySelectorAll('.bookie-checkbox');
    const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
    const shouldCheck = checkedCount !== checkboxes.length;

    checkboxes.forEach(checkbox => {
      checkbox.checked = shouldCheck;
      const bookie = checkbox.value;

      if (shouldCheck) {
        this.enabledBookies.add(bookie);
      } else {
        this.enabledBookies.delete(bookie);
      }
    });

    this.updateToggleAllButton();
    this.renderTable();
  }

  renderTable() {
    this.tableBody.innerHTML = '';

    const xrHeader = document.getElementById('xrHeader');
    const evHeader = document.getElementById('evHeader');

    if (xrHeader) xrHeader.textContent = 'Xr';
    if (evHeader) evHeader.textContent = this.mode === 'bonus' ? 'EV' : '% Loss/Win';

    if (this.oddsData.length === 0) {
      this.renderEmptyState();
      return;
    }

    const combinations = this.generateCombinations();

    const sortedCombos = combinations.sort((a, b) => {
      if (a.ev === null && b.ev === null) return 0;
      if (a.ev === null) return 1;
      if (b.ev === null) return -1;
      return b.ev - a.ev;
    });

    const shouldCollapse = sortedCombos.length > this.COLLAPSE_THRESHOLD;
    const visibleRows = shouldCollapse && this.isCollapsed
      ? sortedCombos.slice(0, this.COLLAPSE_THRESHOLD)
      : sortedCombos;

    visibleRows.forEach((combo) => {
      const row = document.createElement('tr');
      row.style.cursor = 'pointer';
      row.title = 'Click to view on betting site';
      row.addEventListener('click', () => this.handleRowClick(combo));

      const liquidityValue = this.parseCurrency(combo.liquidity);
      const hasEnoughLiquidity = (
        liquidityValue != null &&
        combo.layStake != null &&
        liquidityValue > combo.layStake
      );

      const evHighlighted = combo.ev != null && combo.ev > this.evHighlightThreshold;

      const nameCell = document.createElement('td');
      nameCell.innerHTML = `<span class="horse-name">${combo.name}</span>`;
      row.appendChild(nameCell);

      const bookieNameCell = document.createElement('td');
      bookieNameCell.innerHTML = combo.bookieName
        ? `<span class="bookie-label">${combo.bookieName}</span>`
        : '<span class="neutral">-</span>';
      row.appendChild(bookieNameCell);

      const backCell = document.createElement('td');
      backCell.innerHTML = combo.bookieBackOdds != null
        ? `<span class="odds-bookie">${combo.bookieBackOdds.toFixed(2)}</span>`
        : '<span class="neutral">-</span>';
      row.appendChild(backCell);

      const layCell = document.createElement('td');
      layCell.innerHTML = combo.betfairLayOdds != null
        ? `<span class="odds-betfair">${combo.betfairLayOdds.toFixed(2)}</span>`
        : '<span class="neutral">-</span>';
      row.appendChild(layCell);

      const liquidityCell = document.createElement('td');
      liquidityCell.innerHTML = combo.liquidity != null
        ? `<span class="liquidity">${combo.liquidity}</span>`
        : '<span class="neutral">-</span>';

      if (hasEnoughLiquidity) {
        liquidityCell.style.backgroundColor = 'rgba(76, 175, 80, 0.28)';
        liquidityCell.style.boxShadow = 'inset 0 0 0 2px rgba(76, 175, 80, 0.65)';
        liquidityCell.style.borderRadius = '6px';
        liquidityCell.title = 'Liquidity is greater than lay amount';
      }

      row.appendChild(liquidityCell);

      const layStakeCell = document.createElement('td');
      layStakeCell.innerHTML = combo.layStake != null
        ? `<span class="stake-value">${combo.layStake.toFixed(2)}</span>`
        : '<span class="neutral">-</span>';
      row.appendChild(layStakeCell);

      const xrCell = document.createElement('td');
      if (combo.xr != null) {
        const xrClass = combo.xr >= 0 ? 'positive' : 'negative';
        xrCell.innerHTML = `<span class="metric ${xrClass}">${combo.xr.toFixed(2)}</span>`;
      } else {
        xrCell.innerHTML = '<span class="metric neutral">-</span>';
      }
      row.appendChild(xrCell);

      const evCell = document.createElement('td');
      if (this.mode === 'bonus') {
        if (combo.ev != null) {
          const evClass = combo.ev >= 0 ? 'positive' : 'negative';
          evCell.innerHTML = `<span class="metric ${evClass}">${combo.ev.toFixed(2)}</span>`;
        } else {
          evCell.innerHTML = '<span class="metric neutral">-</span>';
        }
      } else {
        if (combo.retention != null) {
          const evClass = combo.retention >= 0 ? 'positive' : 'negative';
          evCell.innerHTML = `<span class="metric ${evClass}">${combo.retention.toFixed(2)}%</span>`;
        } else {
          evCell.innerHTML = '<span class="metric neutral">-</span>';
        }
      }

      if (evHighlighted) {
        evCell.style.backgroundColor = 'rgba(255, 215, 0, 0.28)';
        evCell.style.boxShadow = 'inset 0 0 0 2px rgba(255, 215, 0, 0.8)';
        evCell.style.borderRadius = '6px';
        evCell.style.fontWeight = '700';
        evCell.title = `EV is greater than ${this.evHighlightThreshold}`;
      }

      row.appendChild(evCell);
      this.tableBody.appendChild(row);
    });

    if (shouldCollapse) {
      const buttonRow = document.createElement('tr');
      buttonRow.id = 'collapseButtonRow';

      const buttonCell = document.createElement('td');
      buttonCell.colSpan = 8;
      buttonCell.style.textAlign = 'center';
      buttonCell.style.padding = '15px';

      const button = document.createElement('button');
      button.textContent = this.isCollapsed
        ? `▼ Show ${sortedCombos.length - this.COLLAPSE_THRESHOLD} more rows`
        : '▲ Collapse';
      button.style.padding = '8px 16px';
      button.style.cursor = 'pointer';
      button.onclick = () => {
        this.isCollapsed = !this.isCollapsed;
        this.renderTable();
      };

      buttonCell.appendChild(button);
      buttonRow.appendChild(buttonCell);
      this.tableBody.appendChild(buttonRow);
    }
  }

  renderEmptyState() {
    this.tableBody.innerHTML = `
      <tr>
        <td colspan="8" class="empty-state">
          <div class="empty-state-icon">📊</div>
          <div class="empty-state-text">No odds data available</div>
          <div class="empty-state-hint">Open betting tabs and click refresh to load odds</div>
        </td>
      </tr>
    `;
  }

  setStatus(message, type = 'info') {
    this.statusDiv.textContent = message;
    this.statusDiv.style.backgroundColor = {
      loading: '#2a4a6a',
      success: '#2a4a2a',
      warning: '#6a5a2a',
      error: '#6a2a2a',
      info: '#2a2a2a'
    }[type] || '#2a2a2a';
  }

  async handleRowClick(combo) {
    const targetSite = combo.bookieName || 'Betfair';
    const targetTabInfo = combo.tabIds[targetSite];

    if (!targetTabInfo) {
      return;
    }

    try {
      await chrome.tabs.update(targetTabInfo.tabId, { active: true });
      await chrome.windows.update(
        (await chrome.tabs.get(targetTabInfo.tabId)).windowId,
        { focused: true }
      );

      setTimeout(() => {
        chrome.tabs.sendMessage(targetTabInfo.tabId, {
          action: 'highlight_horse',
          horseName: combo.name
        }, () => {});
      }, 300);
    } catch (error) {
      console.error('[Dashboard] Error switching to tab:', error);
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new MatchedBettingDashboard();
});