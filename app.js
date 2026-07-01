// Percento Portfolio App Logic
// Client-side state management, LocalStorage, Chart.js, Yahoo Finance API & Exchange Rates API integration.

// --- CONFIGURATION ---
const RATES_API = "https://open.er-api.com/v6/latest/USD";
const CORS_PROXY = "https://corsproxy.io/?";
const STOCK_API_TEMPLATE = "https://query1.finance.yahoo.com/v8/finance/chart/{ticker}";

// --- STATE MANAGEMENT ---
let state = {
  baseCurrency: "TWD",
  assets: [],
  exchangeRates: { TWD: 32.5, USD: 1, EUR: 0.92, JPY: 155, CNY: 7.25 }, // Default fallback rates
  lastRatesUpdate: null,
  lastStockSync: null,
  chartPeriod: "1M" // 1M, 3M, 1Y, ALL
};

// Default mock data to initialize a premium experience
const defaultAssets = [
  {
    id: "mock-cash-twd",
    name: "聯邦銀行活存",
    category: "cash",
    type: "manual",
    currency: "TWD",
    value: 120000,
    history: [
      { date: getDaysAgo(30), value: 110000 },
      { date: getDaysAgo(15), value: 115000 },
      { date: getDaysAgo(0), value: 120000 }
    ]
  },
  {
    id: "mock-stock-tsmc",
    name: "台積電",
    category: "stock",
    type: "stock",
    ticker: "2330.TW",
    shares: 200,
    currency: "TWD",
    value: 190000, // Approximate starting mock value
    history: [
      { date: getDaysAgo(30), value: 175000 },
      { date: getDaysAgo(15), value: 182000 },
      { date: getDaysAgo(0), value: 190000 }
    ]
  },
  {
    id: "mock-stock-apple",
    name: "Apple Inc.",
    category: "stock",
    type: "stock",
    ticker: "AAPL",
    shares: 15,
    currency: "USD",
    value: 3150, // Approximate USD starting mock value
    history: [
      { date: getDaysAgo(30), value: 2850 },
      { date: getDaysAgo(15), value: 3000 },
      { date: getDaysAgo(0), value: 3150 }
    ]
  },
  {
    id: "mock-crypto-btc",
    name: "Bitcoin",
    category: "crypto",
    type: "stock", // crypto can be fetched using Yahoo Finance BTC-USD ticker
    ticker: "BTC-USD",
    shares: 0.05,
    currency: "USD",
    value: 3250,
    history: [
      { date: getDaysAgo(30), value: 2900 },
      { date: getDaysAgo(15), value: 3100 },
      { date: getDaysAgo(0), value: 3250 }
    ]
  }
];

// --- POPULAR TAIWAN STOCKS ---
const POPULAR_TW_STOCKS = [
  { name: "台積電", ticker: "2330.TW" },
  { name: "元大台灣50", ticker: "0050.TW" },
  { name: "元大高股息", ticker: "0056.TW" },
  { name: "國泰永續高股息", ticker: "00878.TW" },
  { name: "群益台灣精選高息", ticker: "00919.TW" },
  { name: "復華台灣科技優息", ticker: "00929.TW" },
  { name: "鴻海", ticker: "2317.TW" },
  { name: "聯發科", ticker: "2454.TW" },
  { name: "聯電", ticker: "2303.TW" },
  { name: "富邦金", ticker: "2881.TW" },
  { name: "國泰金", ticker: "2882.TW" },
  { name: "玉山金", ticker: "2884.TW" },
  { name: "兆豐金", ticker: "2886.TW" },
  { name: "中鋼", ticker: "2002.TW" },
  { name: "長榮", ticker: "2603.TW" }
];

function renderQuickTWStocksPills() {
  const container = document.getElementById("quick-tw-stocks");
  if (!container) return;
  
  container.innerHTML = "";
  
  POPULAR_TW_STOCKS.forEach(stock => {
    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = "quick-pill";
    pill.textContent = `${stock.name} (${stock.ticker.replace(".TW", "")})`;
    
    pill.addEventListener("click", () => {
      // Set values
      document.getElementById("asset-name").value = stock.name;
      document.getElementById("asset-ticker").value = stock.ticker;
      document.getElementById("asset-category").value = "stock";
      document.getElementById("asset-currency").value = "TWD";
      
      // Update active styling
      document.querySelectorAll(".quick-pill").forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      
      // Focus shares input
      const sharesInput = document.getElementById("asset-shares");
      if (sharesInput) sharesInput.focus();
    });
    
    container.appendChild(pill);
  });
}

// --- INITIALIZATION ---
function initApp() {
  loadState();
  initLucide();
  setupEventListeners();
  renderApp();
  checkDailySync();
  renderQuickTWStocksPills();
  
  // Set intervals for daily checks and UI animations
  setInterval(checkDailySync, 60000); // Check for 2:00 PM auto sync every minute
}

// --- LOCAL STORAGE ---
function loadState() {
  const saved = localStorage.getItem("percento_portfolio_state");
  if (saved) {
    try {
      state = JSON.parse(saved);
      // Ensure all required fields exist
      if (!state.assets) state.assets = [];
      if (!state.exchangeRates) state.exchangeRates = { TWD: 32.5, USD: 1 };
      if (!state.chartPeriod) state.chartPeriod = "1M";
    } catch (e) {
      console.error("Error parsing saved state:", e);
      initializeMockData();
    }
  } else {
    initializeMockData();
  }
}

function saveState() {
  localStorage.setItem("percento_portfolio_state", JSON.stringify(state));
}

function initializeMockData() {
  state.assets = defaultAssets;
  state.lastStockSync = new Date().toISOString();
  state.lastRatesUpdate = new Date().toISOString();
  saveState();
}

// --- CORE UTILITIES ---
function getLocalDateString(date = new Date()) {
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - (offset * 60 * 1000));
  return localDate.toISOString().split('T')[0];
}

function getDaysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return getLocalDateString(date);
}

function formatCurrency(amount, currency = state.baseCurrency) {
  const locales = {
    TWD: "zh-TW",
    USD: "en-US",
    EUR: "de-DE",
    JPY: "ja-JP",
    CNY: "zh-CN"
  };
  
  const options = {
    style: "currency",
    currency: currency,
    maximumFractionDigits: (currency === "TWD" || currency === "JPY") ? 0 : 2
  };
  
  return new Intl.NumberFormat(locales[currency] || "en-US", options).format(amount);
}

function initLucide() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// Convert amount between currencies using local USD-base exchange rates
function convertCurrency(amount, from, to) {
  if (from === to) return amount;
  const rates = state.exchangeRates;
  if (!rates[from] || !rates[to]) return amount; // Fallback
  // convert to USD first, then to target
  const usdAmount = amount / rates[from];
  return usdAmount * rates[to];
}

// --- SYNC API INTEGRATION ---

// Fetch latest exchange rates from Open Exchange API
async function fetchExchangeRates() {
  try {
    const res = await fetch(RATES_API);
    if (!res.ok) throw new Error("Rates API failed");
    const data = await res.json();
    if (data && data.rates) {
      state.exchangeRates = data.rates;
      state.lastRatesUpdate = new Date().toISOString();
      saveState();
      return true;
    }
  } catch (err) {
    console.error("Failed to fetch exchange rates:", err);
  }
  return false;
}

// Fetch stock price using Yahoo Finance via CORS Proxy
async function fetchStockPrice(ticker) {
  const url = `${CORS_PROXY}${encodeURIComponent(STOCK_API_TEMPLATE.replace("{ticker}", ticker))}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Stock API failed for ${ticker}`);
    const data = await res.json();
    
    if (data && data.chart && data.chart.result && data.chart.result[0]) {
      const result = data.chart.result[0];
      const price = result.meta.regularMarketPrice;
      const currency = result.meta.currency || "USD";
      return { price, currency, success: true };
    }
  } catch (err) {
    console.error(`Failed to fetch stock price for ${ticker}:`, err);
  }
  return { price: null, currency: null, success: false };
}

// Main function to sync all stocks and currencies
async function syncAllPrices(isManual = false) {
  showSyncIndicator(true);
  
  // 1. Fetch Exchange Rates
  await fetchExchangeRates();
  
  // 2. Fetch all stocks in parallel
  const stockAssets = state.assets.filter(a => a.type === "stock");
  let failedStocks = [];
  
  const promises = stockAssets.map(async (asset) => {
    const res = await fetchStockPrice(asset.ticker);
    if (res.success) {
      asset.value = res.price * asset.shares;
      asset.currency = res.currency; // Update currency to match market currency if changed
      
      // Update history log for today
      updateAssetHistoryLog(asset, asset.value);
    } else {
      failedStocks.push(asset.name);
    }
  });
  
  await Promise.all(promises);
  
  // Update manual assets' history logs for today (carrying forward current value)
  state.assets.filter(a => a.type === "manual").forEach(asset => {
    updateAssetHistoryLog(asset, asset.value);
  });
  
  state.lastStockSync = new Date().toISOString();
  saveState();
  
  showSyncIndicator(false);
  renderApp();
  
  if (failedStocks.length > 0) {
    showNotification(`同步完成，但以下股票更新失敗：\n${failedStocks.join(", ")}`, "warning");
  } else if (isManual) {
    showNotification("資產與最新股價同步成功！", "success");
  }
}

// Append or update today's history log for an asset
function updateAssetHistoryLog(asset, value) {
  if (!asset.history) asset.history = [];
  const today = getLocalDateString();
  const existingIndex = asset.history.findIndex(h => h.date === today);
  
  if (existingIndex !== -1) {
    asset.history[existingIndex].value = value;
  } else {
    asset.history.push({ date: today, value: value });
  }
  
  // Limit history entries to prevent localstorage bloat (e.g. max 365 records per asset)
  if (asset.history.length > 365) {
    asset.history.sort((a, b) => a.date.localeCompare(b.date));
    asset.history = asset.history.slice(-365);
  }
}

// Smart 14:00 Auto Sync check
function checkDailySync() {
  const now = new Date();
  const currentHour = now.getHours();
  const todayStr = getLocalDateString(now);
  
  // Check if it's past 14:00 (2:00 PM) local time
  if (currentHour >= 14) {
    // Check if the last sync date was before today
    let lastSyncDate = "";
    if (state.lastStockSync) {
      lastSyncDate = getLocalDateString(new Date(state.lastStockSync));
    }
    
    if (lastSyncDate !== todayStr) {
      console.log(`Auto Sync triggered. Time: ${now.toLocaleTimeString()}, Today: ${todayStr}, Last Sync: ${lastSyncDate}`);
      syncAllPrices(false);
    }
  }
}

// --- DATA PROCESSING FOR CHARTS ---

// Calculates the combined net worth of the portfolio on each recorded history date
function getPortfolioHistory() {
  // Collect all history dates from all assets
  const allDates = new Set();
  state.assets.forEach(asset => {
    if (asset.history) {
      asset.history.forEach(h => allDates.add(h.date));
    }
  });
  
  let sortedDates = Array.from(allDates).sort();
  if (sortedDates.length === 0) {
    sortedDates.push(getLocalDateString());
  }
  
  // Filter dates based on selected chart period
  const today = new Date();
  let cutOffDate = "";
  if (state.chartPeriod === "1M") {
    cutOffDate = getDaysAgo(30);
  } else if (state.chartPeriod === "3M") {
    cutOffDate = getDaysAgo(90);
  } else if (state.chartPeriod === "1Y") {
    cutOffDate = getDaysAgo(365);
  }
  
  if (cutOffDate) {
    sortedDates = sortedDates.filter(d => d >= cutOffDate);
    // If we filtered out all dates, ensure at least one remains
    if (sortedDates.length === 0) {
      sortedDates.push(getLocalDateString());
    }
  }
  
  // For each date, sum all asset values on that date (converted to base currency)
  return sortedDates.map(date => {
    let total = 0;
    state.assets.forEach(asset => {
      let valueOnDate = 0;
      if (asset.history && asset.history.length > 0) {
        // Sort history to find correctly
        const sortedHistory = [...asset.history].sort((a, b) => a.date.localeCompare(b.date));
        let lastVal = 0;
        for (let h of sortedHistory) {
          if (h.date <= date) {
            lastVal = h.value;
          } else {
            break;
          }
        }
        valueOnDate = lastVal;
      } else {
        valueOnDate = asset.value || 0;
      }
      
      // Convert to base currency
      const valInBase = convertCurrency(valueOnDate, asset.currency, state.baseCurrency);
      total += valInBase;
    });
    
    return { date, value: Math.round(total) };
  });
}

// Get portfolio breakdown by category
function getPortfolioAllocation() {
  const categories = {
    cash: { value: 0, color: "var(--color-emerald)", label: "現金" },
    stock: { value: 0, color: "var(--color-blue)", label: "股票/ETF" },
    crypto: { value: 0, color: "var(--color-gold)", label: "加密貨幣" },
    realestate: { value: 0, color: "var(--color-purple)", label: "房地產" },
    other: { value: 0, color: "var(--text-secondary)", label: "其他" }
  };
  
  let totalValue = 0;
  
  state.assets.forEach(asset => {
    const valInBase = convertCurrency(asset.value, asset.currency, state.baseCurrency);
    totalValue += valInBase;
    if (categories[asset.category]) {
      categories[asset.category].value += valInBase;
    } else {
      categories.other.value += valInBase;
    }
  });
  
  return {
    totalValue,
    breakdown: Object.keys(categories).map(key => {
      const cat = categories[key];
      const pct = totalValue > 0 ? (cat.value / totalValue) * 100 : 0;
      return {
        key,
        label: cat.label,
        value: cat.value,
        color: cat.color,
        percentage: pct
      };
    }).filter(c => c.value > 0) // Only display active categories
  };
}

// --- CHART RENDERING (Chart.js) ---
let portfolioChart = null;

function renderCharts() {
  const historyData = getPortfolioHistory();
  const ctx = document.getElementById("portfolioChartCanvas");
  if (!ctx) return;
  
  if (portfolioChart) {
    portfolioChart.destroy();
  }
  
  const labels = historyData.map(d => {
    // Format date string YYYY-MM-DD to MM/DD
    const parts = d.date.split("-");
    return parts.length === 3 ? `${parts[1]}/${parts[2]}` : d.date;
  });
  const dataValues = historyData.map(d => d.value);
  
  // Create gorgeous gradient background
  const chartCtx = ctx.getContext("2d");
  const gradient = chartCtx.createLinearGradient(0, 0, 0, 190);
  gradient.addColorStop(0, "rgba(59, 130, 246, 0.2)");
  gradient.addColorStop(1, "rgba(59, 130, 246, 0.0)");
  
  portfolioChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [{
        label: "總資產",
        data: dataValues,
        borderColor: "rgba(59, 130, 246, 1)",
        borderWidth: 2,
        pointBackgroundColor: "rgba(59, 130, 246, 1)",
        pointHoverBackgroundColor: "#ffffff",
        pointBorderWidth: 0,
        pointHoverRadius: 5,
        pointRadius: historyData.length < 15 ? 3 : 0, // Show points only if data points are few
        fill: true,
        backgroundColor: gradient,
        tension: 0.35 // Curved line
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#1c202b",
          titleColor: "#8a8f9f",
          bodyColor: "#ffffff",
          borderColor: "rgba(255, 255, 255, 0.08)",
          borderWidth: 1,
          padding: 10,
          cornerRadius: 10,
          displayColors: false,
          callbacks: {
            title: function(context) {
              const idx = context[0].dataIndex;
              return historyData[idx].date;
            },
            label: function(context) {
              return formatCurrency(context.raw);
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: "#4e5361",
            font: { size: 10, family: "var(--font-system)" },
            maxTicksLimit: 6
          },
          border: { display: false }
        },
        y: {
          grid: { color: "rgba(255, 255, 255, 0.03)" },
          ticks: {
            color: "#4e5361",
            font: { size: 9, family: "var(--font-system)" },
            callback: function(value) {
              // Convert to compact formats (e.g. 100k, 1M)
              if (value >= 1000000) {
                return (value / 1000000).toFixed(1) + "M";
              } else if (value >= 1000) {
                return (value / 1000).toFixed(0) + "k";
              }
              return value;
            }
          },
          border: { display: false }
        }
      }
    }
  });
}

// --- RENDER DYNAMIC UI ---

function renderApp() {
  const allocation = getPortfolioAllocation();
  
  // 1. Render Dashboard Net Worth
  const totalValElement = document.getElementById("dashboard-total-value");
  if (totalValElement) {
    totalValElement.textContent = formatCurrency(allocation.totalValue);
  }
  
  // Calculate gains/losses trend (comparing current value to 30 days ago, or first record)
  const historyData = getPortfolioHistory();
  const trendBadge = document.getElementById("dashboard-trend-badge");
  if (trendBadge && historyData.length > 0) {
    const currentVal = historyData[historyData.length - 1].value;
    const initialVal = historyData[0].value;
    const diff = currentVal - initialVal;
    const pct = initialVal > 0 ? (diff / initialVal) * 100 : 0;
    
    trendBadge.className = "trend-badge";
    if (diff > 0) {
      trendBadge.classList.add("positive");
      trendBadge.innerHTML = `<i data-lucide="trending-up"></i> +${pct.toFixed(2)}%`;
    } else if (diff < 0) {
      trendBadge.classList.add("negative");
      trendBadge.innerHTML = `<i data-lucide="trending-down"></i> ${pct.toFixed(2)}%`;
    } else {
      trendBadge.classList.add("neutral");
      trendBadge.innerHTML = `平盤`;
    }
  }
  
  // Update Sync Time Text
  const lastSyncText = document.getElementById("last-sync-time");
  if (lastSyncText) {
    if (state.lastStockSync) {
      const syncDate = new Date(state.lastStockSync);
      lastSyncText.textContent = `股價更新：${syncDate.toLocaleDateString()} ${syncDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
    } else {
      lastSyncText.textContent = "未同步";
    }
  }
  
  // 2. Render Allocation Bar & Details
  renderAllocationUI(allocation);
  
  // 3. Render Charts
  renderCharts();
  
  // 4. Render Asset Cards (Assets View)
  renderAssetsList();
  
  // 5. Render History Timeline (History View)
  renderHistoryTimeline();
  
  // 6. Refresh Settings view
  const baseCurrencySelect = document.getElementById("settings-base-currency");
  if (baseCurrencySelect) {
    baseCurrencySelect.value = state.baseCurrency;
  }
  
  initLucide();
}

function renderAllocationUI(allocation) {
  const bar = document.getElementById("allocation-bar");
  const list = document.getElementById("allocation-list");
  if (!bar || !list) return;
  
  bar.innerHTML = "";
  list.innerHTML = "";
  
  if (allocation.totalValue === 0) {
    list.innerHTML = `<div style="grid-column: 1/3; text-align: center; color: var(--text-muted);">無資產配置資料</div>`;
    return;
  }
  
  allocation.breakdown.forEach(item => {
    // Add segment to progress bar
    const segment = document.createElement("div");
    segment.className = "allocation-bar-segment";
    segment.style.width = `${item.percentage}%`;
    segment.style.backgroundColor = item.color;
    bar.appendChild(segment);
    
    // Add list item
    const row = document.createElement("div");
    row.className = "allocation-item";
    row.innerHTML = `
      <span class="dot" style="background-color: ${item.color}"></span>
      <span class="allocation-name">${item.label}</span>
      <span class="allocation-pct">${item.percentage.toFixed(1)}%</span>
    `;
    list.appendChild(row);
  });
}

function renderAssetsList() {
  const container = document.getElementById("assets-container");
  if (!container) return;
  
  container.innerHTML = "";
  
  if (state.assets.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i data-lucide="wallet"></i>
        <p>尚未建立資產帳戶。<br>點擊右上角「新增資產」按鈕開始記錄吧！</p>
      </div>
    `;
    return;
  }
  
  // Group assets by category
  const categories = {
    cash: { icon: "banknote", colorClass: "text-cash", title: "現金與儲蓄" },
    stock: { icon: "trending-up", colorClass: "text-stock", title: "股票/ETF" },
    crypto: { icon: "coins", colorClass: "text-crypto", title: "加密貨幣" },
    realestate: { icon: "home", colorClass: "text-realestate", title: "房地產" },
    other: { icon: "piggy-bank", colorClass: "text-other", title: "其他資產" }
  };
  
  // Group assets
  const grouped = {};
  state.assets.forEach(asset => {
    const cat = asset.category || "other";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(asset);
  });
  
  // Render
  Object.keys(categories).forEach(catKey => {
    const assets = grouped[catKey];
    if (!assets || assets.length === 0) return;
    
    const catMeta = categories[catKey];
    
    // Category Section Header
    const sectionHeader = document.createElement("div");
    sectionHeader.style.cssText = "font-size: 13px; font-weight:600; color: var(--text-secondary); margin: 15px 0 8px 4px; display:flex; align-items:center; gap:6px;";
    sectionHeader.innerHTML = `<i data-lucide="${catMeta.icon}" class="${catMeta.colorClass}" style="width:14px; height:14px;"></i> ${catMeta.title}`;
    container.appendChild(sectionHeader);
    
    assets.forEach(asset => {
      const card = document.createElement("div");
      card.className = "asset-card";
      card.onclick = () => openAssetDetails(asset.id);
      
      const valInBase = convertCurrency(asset.value, asset.currency, state.baseCurrency);
      const isStock = asset.type === "stock";
      
      card.innerHTML = `
        <div class="asset-icon-wrapper" style="background-color: ${isStock ? "var(--color-blue-bg)" : "rgba(255,255,255,0.04)"}; color: ${isStock ? "var(--color-blue)" : "var(--text-secondary)"};">
          <i data-lucide="${isStock ? "line-chart" : "wallet"}"></i>
        </div>
        <div class="asset-info">
          <div class="asset-name-row">
            <span class="asset-name">${asset.name}</span>
            ${isStock ? `<span class="asset-ticker">${asset.ticker}</span>` : ""}
          </div>
          <div class="asset-meta">
            ${isStock ? `${asset.shares} 股` : ""}
            ${asset.currency !== state.baseCurrency ? `(${asset.currency})` : ""}
          </div>
        </div>
        <div class="asset-values">
          <div class="asset-val-primary">${formatCurrency(valInBase)}</div>
          ${asset.currency !== state.baseCurrency ? `<div class="asset-val-secondary">${formatCurrency(asset.value, asset.currency)}</div>` : ""}
        </div>
      `;
      
      container.appendChild(card);
    });
  });
}

function renderHistoryTimeline() {
  const container = document.getElementById("history-container");
  if (!container) return;
  
  container.innerHTML = "";
  
  // Extract all individual transaction logs across all assets
  let allLogs = [];
  state.assets.forEach(asset => {
    if (asset.history) {
      asset.history.forEach(log => {
        allLogs.push({
          assetId: asset.id,
          assetName: asset.name,
          category: asset.category,
          isStock: asset.type === "stock",
          ticker: asset.ticker,
          shares: asset.shares,
          currency: asset.currency,
          date: log.date,
          value: log.value
        });
      });
    }
  });
  
  if (allLogs.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i data-lucide="clock"></i>
        <p>目前尚無歷史記錄數據。<br>點擊「立即同步」或手動更新資產數值以生成歷史點。</p>
      </div>
    `;
    return;
  }
  
  // Sort logs by date descending
  allLogs.sort((a, b) => b.date.localeCompare(a.date));
  
  // Group logs by asset history (or calculate differences)
  // For each log, find its previous log to calculate change
  allLogs.forEach((log, index) => {
    // Find the log of the SAME asset that is chronologically just before this one
    const assetLogs = allLogs.filter(l => l.assetId === log.assetId).sort((a, b) => a.date.localeCompare(b.date));
    const thisLogIdx = assetLogs.findIndex(l => l.date === log.date);
    
    let diff = 0;
    if (thisLogIdx > 0) {
      diff = log.value - assetLogs[thisLogIdx - 1].value;
    }
    
    const item = document.createElement("div");
    item.className = "log-item";
    
    // Choose bullet dot color
    let dotColor = "var(--text-muted)";
    if (log.category === "cash") dotColor = "var(--color-emerald)";
    else if (log.category === "stock") dotColor = "var(--color-blue)";
    else if (log.category === "crypto") dotColor = "var(--color-gold)";
    else if (log.category === "realestate") dotColor = "var(--color-purple)";
    
    const formattedVal = formatCurrency(log.value, log.currency);
    const formattedDiff = diff !== 0 
      ? (diff > 0 ? `+${formatCurrency(diff, log.currency)}` : `-${formatCurrency(Math.abs(diff), log.currency)}`)
      : "無變動";
    
    const diffColorClass = diff > 0 ? "text-success" : (diff < 0 ? "text-danger" : "text-neutral");
    
    item.innerHTML = `
      <span class="log-dot" style="background-color: ${dotColor}"></span>
      <div class="log-header">
        <span class="log-date">${log.date}</span>
        <span class="log-category">${getCategoryLabel(log.category)}</span>
      </div>
      <div class="log-content-card">
        <div class="log-asset-info">
          <span class="log-asset-name">${log.assetName}</span>
          <span class="log-asset-desc">${log.isStock ? `${log.ticker} • ${log.shares} 股` : "手動記帳"}</span>
        </div>
        <div class="log-asset-value-diff">
          <div class="log-val-current">${formattedVal}</div>
          <div class="log-val-diff ${diffColorClass}">${formattedDiff}</div>
        </div>
      </div>
    `;
    
    container.appendChild(item);
  });
}

function getCategoryLabel(cat) {
  const map = {
    cash: "現金",
    stock: "股票/ETF",
    crypto: "加密貨幣",
    realestate: "房地產",
    other: "其他"
  };
  return map[cat] || "資產";
}

// --- NOTIFICATION & SPINNER ---

function showSyncIndicator(show) {
  const loader = document.getElementById("sync-spinner");
  const syncBtnIcon = document.getElementById("sync-btn-icon");
  if (loader) {
    loader.style.display = show ? "block" : "none";
  }
  if (syncBtnIcon) {
    if (show) {
      syncBtnIcon.classList.add("skeleton");
    } else {
      syncBtnIcon.classList.remove("skeleton");
    }
  }
}

function showNotification(message, type = "success") {
  // Simple elegant iOS banner alert
  const banner = document.createElement("div");
  banner.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%) translateY(-100px);
    width: calc(100% - 40px);
    max-width: 440px;
    background-color: #1c202b;
    border: 1px solid rgba(255,255,255,0.08);
    border-left: 4px solid ${type === "success" ? "var(--color-emerald)" : (type === "warning" ? "var(--color-gold)" : "var(--color-rose)")};
    border-radius: 12px;
    padding: 14px 18px;
    color: #ffffff;
    font-size: 14px;
    font-weight: 500;
    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    z-index: 9999;
    display: flex;
    align-items: center;
    gap: 10px;
    transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    pointer-events: none;
  `;
  
  const icon = type === "success" ? "check-circle" : (type === "warning" ? "alert-triangle" : "x-circle");
  const iconColor = type === "success" ? "text-success" : (type === "warning" ? "text-crypto" : "text-danger");
  
  banner.innerHTML = `
    <i data-lucide="${icon}" class="${iconColor}" style="width:20px; height:20px;"></i>
    <div style="flex:1; white-space: pre-line;">${message}</div>
  `;
  
  document.body.appendChild(banner);
  initLucide();
  
  // Animate in
  setTimeout(() => {
    banner.style.transform = "translateX(-50%) translateY(0)";
  }, 50);
  
  // Remove
  setTimeout(() => {
    banner.style.transform = "translateX(-50%) translateY(-120px)";
    setTimeout(() => banner.remove(), 400);
  }, 3500);
}

// --- MODALS & EVENT HANDLERS ---
let selectedAssetId = null;

function setupEventListeners() {
  // Tab Bar switcher
  const tabs = document.querySelectorAll(".tab-item");
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const viewId = tab.dataset.view;
      switchTab(viewId);
    });
  });
  
  // Dashboard Chart Period Selector
  const periodBtns = document.querySelectorAll(".period-btn");
  periodBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      periodBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.chartPeriod = btn.dataset.period;
      saveState();
      renderCharts();
    });
  });
  
  // Sync Button trigger
  const syncBtn = document.getElementById("sync-assets-btn");
  if (syncBtn) {
    syncBtn.addEventListener("click", () => {
      syncAllPrices(true);
    });
  }
  
  // Asset Form Type selection toggle fields
  const typeSelect = document.getElementById("asset-type");
  if (typeSelect) {
    typeSelect.addEventListener("change", () => {
      const type = typeSelect.value;
      toggleFormFields(type);
    });
  }
  
  // Close Modals on Overlay click
  const overlays = document.querySelectorAll(".modal-overlay");
  overlays.forEach(overlay => {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        closeModal(overlay.id);
      }
    });
  });
}

function switchTab(viewId) {
  // Hide all sections
  document.querySelectorAll(".view-section").forEach(sec => sec.classList.remove("active"));
  // Show target
  const target = document.getElementById(`view-${viewId}`);
  if (target) target.classList.add("active");
  
  // Update Tab active classes
  document.querySelectorAll(".tab-item").forEach(tab => tab.classList.remove("active"));
  const activeTab = document.querySelector(`.tab-item[data-view="${viewId}"]`);
  if (activeTab) activeTab.classList.add("active");
  
  // Force Chart redraw if entering dashboard
  if (viewId === "dashboard") {
    renderCharts();
  }
  
  // Update Page Title
  const titles = {
    dashboard: "Percento",
    assets: "資產帳戶",
    history: "歷史變動",
    settings: "系統設定"
  };
  const titleHeader = document.getElementById("app-header-title");
  if (titleHeader) titleHeader.textContent = titles[viewId] || "Percento";
}

function toggleFormFields(type) {
  const manualOnly = document.querySelectorAll(".manual-only");
  const stockOnly = document.querySelectorAll(".stock-only");
  
  if (type === "stock") {
    manualOnly.forEach(el => el.classList.remove("show"));
    stockOnly.forEach(el => el.classList.add("show"));
  } else {
    manualOnly.forEach(el => el.classList.add("show"));
    stockOnly.forEach(el => el.classList.remove("show"));
  }
}

// Modal open/close utilities
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add("active");
    document.body.style.overflow = "hidden"; // Prevent background scroll
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove("active");
    document.body.style.overflow = "";
    
    // Clear forms inside it if closed
    const form = modal.querySelector("form");
    if (form) form.reset();
    
    selectedAssetId = null;
  }
}

// Open Form to Add Asset
function openAddAssetModal() {
  document.getElementById("asset-form-title").textContent = "新增資產帳戶";
  document.getElementById("delete-asset-btn").style.display = "none";
  selectedAssetId = null;
  
  // Reset quick pills active state
  document.querySelectorAll(".quick-pill").forEach(p => p.classList.remove("active"));
  
  // Set default form values
  document.getElementById("asset-type").value = "manual";
  toggleFormFields("manual");
  
  openModal("assetModal");
}

// Open details of selected asset
function openAssetDetails(assetId) {
  const asset = state.assets.find(a => a.id === assetId);
  if (!asset) return;
  
  selectedAssetId = assetId;
  document.getElementById("asset-form-title").textContent = "編輯資產帳戶";
  document.getElementById("delete-asset-btn").style.display = "block";
  
  // Reset and highlight active pill if matches
  document.querySelectorAll(".quick-pill").forEach(p => p.classList.remove("active"));
  
  // Populate form
  document.getElementById("asset-name").value = asset.name;
  document.getElementById("asset-category").value = asset.category;
  document.getElementById("asset-currency").value = asset.currency;
  document.getElementById("asset-type").value = asset.type;
  
  toggleFormFields(asset.type);
  
  if (asset.type === "stock") {
    document.getElementById("asset-ticker").value = asset.ticker || "";
    document.getElementById("asset-shares").value = asset.shares || "";
    
    // Highlight matching pill if any
    const match = POPULAR_TW_STOCKS.find(s => s.ticker === asset.ticker);
    if (match) {
      document.querySelectorAll(".quick-pill").forEach(pill => {
        if (pill.textContent.includes(match.name)) {
          pill.classList.add("active");
        }
      });
    }
  } else {
    document.getElementById("asset-value").value = asset.value || 0;
  }
  
  openModal("assetModal");
}

// Save or Update Asset
function saveAssetForm(event) {
  event.preventDefault();
  
  const name = document.getElementById("asset-name").value.trim();
  const category = document.getElementById("asset-category").value;
  const currency = document.getElementById("asset-currency").value;
  const type = document.getElementById("asset-type").value;
  
  if (!name) {
    showNotification("請輸入資產名稱", "error");
    return;
  }
  
  let value = 0;
  let ticker = "";
  let shares = 0;
  
  if (type === "stock") {
    ticker = document.getElementById("asset-ticker").value.trim().toUpperCase();
    shares = parseFloat(document.getElementById("asset-shares").value);
    
    if (!ticker) {
      showNotification("請輸入股票代碼 (例如 AAPL)", "error");
      return;
    }
    if (isNaN(shares) || shares <= 0) {
      showNotification("請輸入有效的持股數量", "error");
      return;
    }
  } else {
    value = parseFloat(document.getElementById("asset-value").value);
    if (isNaN(value)) value = 0;
  }
  
  if (selectedAssetId) {
    // EDIT MODE
    const asset = state.assets.find(a => a.id === selectedAssetId);
    if (asset) {
      asset.name = name;
      asset.category = category;
      asset.currency = currency;
      
      const oldType = asset.type;
      asset.type = type;
      
      if (type === "stock") {
        asset.ticker = ticker;
        asset.shares = shares;
        // Keep current value if ticker matches, otherwise it will update on next sync
      } else {
        asset.value = value;
        asset.ticker = undefined;
        asset.shares = undefined;
        updateAssetHistoryLog(asset, value);
      }
      
      saveState();
      closeModal("assetModal");
      renderApp();
      showNotification("帳戶修改完成！", "success");
      
      // Auto-trigger sync if stock configuration changed
      if (type === "stock" && (oldType !== "stock" || asset.ticker !== ticker || asset.shares !== shares)) {
        syncAllPrices(false);
      }
    }
  } else {
    // ADD NEW
    const newAsset = {
      id: "asset-" + Date.now(),
      name,
      category,
      currency,
      type,
      value: type === "stock" ? 0 : value, // will sync later if stock
      history: []
    };
    
    if (type === "stock") {
      newAsset.ticker = ticker;
      newAsset.shares = shares;
    } else {
      newAsset.history.push({ date: getLocalDateString(), value: value });
    }
    
    state.assets.push(newAsset);
    saveState();
    closeModal("assetModal");
    renderApp();
    showNotification("已成功新增資產！", "success");
    
    // Fetch price immediately if it's a stock
    if (type === "stock") {
      syncAllPrices(false);
    }
  }
}

// Delete Selected Asset
function deleteAsset() {
  if (!selectedAssetId) return;
  
  if (confirm("您確定要刪除此資產帳戶嗎？所有歷史記錄將會永久刪除且無法恢復。")) {
    state.assets = state.assets.filter(a => a.id !== selectedAssetId);
    saveState();
    closeModal("assetModal");
    renderApp();
    showNotification("已刪除該資產帳戶", "success");
  }
}

// Set Base Currency from Settings View
function changeBaseCurrency(selectEl) {
  state.baseCurrency = selectEl.value;
  saveState();
  renderApp();
  showNotification(`基準貨幣已變更為 ${state.baseCurrency}`, "success");
}

// Reset entire database
function resetAllData() {
  if (confirm("警告！這將清除所有資產記錄並恢復為預設範例資料。確定要執行嗎？")) {
    localStorage.removeItem("percento_portfolio_state");
    loadState();
    renderApp();
    showNotification("所有資料已重置！", "success");
  }
}

// --- BACKUP & RESTORE ---

// Export JSON file
function exportBackup() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
  const dlAnchorElem = document.createElement('a');
  dlAnchorElem.setAttribute("href", dataStr);
  dlAnchorElem.setAttribute("download", `percento_portfolio_backup_${getLocalDateString()}.json`);
  dlAnchorElem.click();
  showNotification("備份資料已導出！", "success");
}

// Import JSON file
function triggerImport() {
  document.getElementById("backup-file-input").click();
}

function handleImportFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const imported = JSON.parse(e.target.result);
      if (imported && imported.assets && Array.isArray(imported.assets)) {
        state = imported;
        saveState();
        renderApp();
        showNotification("備份還原成功！", "success");
      } else {
        throw new Error("Invalid format");
      }
    } catch (err) {
      showNotification("匯入失敗！請確認檔案格式是否正確。", "error");
    }
  };
  reader.readAsText(file);
  event.target.value = ""; // Reset
}

// Make functions globally accessible
window.initApp = initApp;
window.openAddAssetModal = openAddAssetModal;
window.closeModal = closeModal;
window.saveAssetForm = saveAssetForm;
window.deleteAsset = deleteAsset;
window.changeBaseCurrency = changeBaseCurrency;
window.resetAllData = resetAllData;
window.exportBackup = exportBackup;
window.triggerImport = triggerImport;
window.handleImportFile = handleImportFile;
window.syncAllPrices = () => syncAllPrices(true);
