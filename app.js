import { supabase } from './supabase-client.js';
import { renderIcon } from './icons.js';

// ============================
// STATE
// ============================
let state = {
    user: null,
    profile: null,
    currencies: [],
    leaderboard: [],
    view: 'market',
    selectedCurrency: null,
    tradeAction: 'buy',
    chart: null,
    chartSeries: null,
    holdings: {},
    marketRange: '1d',
    chartRange: '1d',
    chartType: 'area'
};

const $ = (id) => document.getElementById(id);

// ============================
// REAL CHANGE (vs base price)
// ============================
function getRealChange(currency, timeframe = 'live') {
    const current = currency.current_price;
    let base = 10; // IPO default

    if (timeframe !== 'live' && currency.history_at_range) {
        base = currency.history_at_range;
    }

    return {
        change: parseFloat((current - base).toFixed(2)),
        pct: parseFloat((((current - base) / base) * 100).toFixed(2))
    };
}

// ============================
// NOTIFICATIONS
// ============================
function notify(msg, type = 'info') {
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed; 
        bottom: 2rem; 
        right: 2rem; 
        background: ${type === 'error' ? '#EF4444' : '#10B981'}; 
        color: #fff; 
        padding: 1rem 2rem; 
        border-radius: 8px;
        font-weight: 600; 
        z-index: 10001; 
        box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);
    `;
    toast.innerText = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ============================
// INIT
// ============================
async function init() {
    setupListeners();
    await checkSession();
    await refreshData();
    subscribe();
}

async function checkSession() {
    try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) throw error;
        if (user) {
            state.user = user;
            await fetchProfile(user.id);
            await fetchHoldings();
            updateUserUI();
        } else {
            window.location.href = 'auth.html';
        }
    } catch (e) {
        console.error("Auth check failed:", e.message);
    }
}

async function fetchProfile(uid) {
    let { data } = await supabase.from('profiles').select('*').eq('id', uid).single();
    if (!data && state.user) {
        const username = state.user.user_metadata?.username || 'user_' + uid.substring(0, 8);
        const { data: np } = await supabase.from('profiles')
            .insert([{ id: uid, username: username, points: 1000 }]).select().single();
        data = np;
    }
    if (data) state.profile = data;
}

async function fetchHoldings() {
    if (!state.user) return;
    const { data } = await supabase.from('holdings').select('*').eq('user_id', state.user.id);
    state.holdings = {};
    if (data) data.forEach(h => { state.holdings[h.currency_id] = h.shares; });
}

async function refreshData() {
    try {
        const { data: c, error } = await supabase.from('currencies').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        
        if (c) {
            // Fetch base prices for the selected timeframe
            if (state.marketRange !== 'live') {
                const interval = getIntervalSeconds(state.marketRange);
                const startTime = new Date(Date.now() - interval * 1000).toISOString();

                for (let curr of c) {
                    const { data: hist } = await supabase
                        .from('price_history')
                        .select('price')
                        .eq('currency_id', curr.id)
                        .lte('recorded_at', startTime)
                        .order('recorded_at', { ascending: false })
                        .limit(1);
                    curr.history_at_range = hist && hist[0] ? parseFloat(hist[0].price) : 10;
                }
            }
            state.currencies = c;
            renderMarket();
            updateTicker();
        }

        const { data: l } = await supabase.from('profiles').select('*').order('points', { ascending: false }).limit(10);
        if (l) { state.leaderboard = l; }
    } catch (err) {
        console.error("Data refresh failed:", err.message);
    }
}

function getIntervalSeconds(range) {
    switch (range) {
        case '1h': return 3600;
        case '1d': return 86400;
        case '1m': return 2592000;
        case '1y': return 31536000;
        default: return 0;
    }
}

// ============================
// FETCH REAL PRICE HISTORY
// ============================
async function fetchPriceHistory(currencyId, range = '1d') {
    let query = supabase
        .from('price_history')
        .select('price, recorded_at')
        .eq('currency_id', currencyId)
        .order('recorded_at', { ascending: true });

    if (range !== 'all') {
        const seconds = getIntervalSeconds(range);
        const startTime = new Date(Date.now() - seconds * 1000).toISOString();
        query = query.gte('recorded_at', startTime);
    }

    const { data, error } = await query;
    if (error || !data) return [];

    return data.map(d => ({
        time: Math.floor(new Date(d.recorded_at).getTime() / 1000),
        value: parseFloat(d.price)
    }));
}

// ============================
// RECORD PRICE
// ============================
let lastRecordTime = 0;
async function recordPrice(currencyId, price) {
    let now = Math.floor(Date.now() / 1000);
    if (now <= lastRecordTime) {
        now = lastRecordTime + 1;
    }
    lastRecordTime = now;

    await supabase.from('price_history').insert([{
        currency_id: currencyId,
        price: price,
        recorded_at: new Date(now * 1000).toISOString()
    }]);
}

async function getAdvancedStats(currencyId) {
    const { data: pData } = await supabase.from('price_history').select('price').eq('currency_id', currencyId);
    let high = 10, low = 10, prev = 10;
    if (pData && pData.length > 0) {
        const prices = pData.map(d => d.price);
        high = Math.max(...prices);
        low = Math.min(...prices);
        if (pData.length > 1) {
            prev = pData[pData.length - 2].price;
        } else {
            prev = prices[0];
        }
    }
    
    // Total Volume
    const { data: tData } = await supabase.from('transactions').select('amount').eq('currency_id', currencyId);
    const volume = (tData || []).reduce((sum, t) => sum + t.amount, 0);

    // Market Cap (Shares outstanding * current price)
    const { data: hData } = await supabase.from('holdings').select('shares').eq('currency_id', currencyId);
    const totalShares = (hData || []).reduce((sum, h) => sum + h.shares, 0);
    const cap = state.selectedCurrency ? state.selectedCurrency.current_price * totalShares : 0;
    
    return { high, low, prev, cap, volume };
}

// ============================
// RENDER: MARKET TABLE
// ============================
function renderMarket() {
    const body = $('market-body');
    if (!body) return;
    
    const searchInput = $('search-input');
    const filter = searchInput ? searchInput.value.toLowerCase() : '';

    const filtered = state.currencies.filter(c => 
        c.symbol.toLowerCase().includes(filter) || c.name.toLowerCase().includes(filter)
    );

    if (filtered.length === 0) {
        body.innerHTML = `<tr><td colspan="5" class="text-center py-2 text-muted">No currencies found.</td></tr>`;
        return;
    }
    
    body.innerHTML = filtered.map(c => {
        const { change, pct } = getRealChange(c, state.marketRange);
        const pos = change >= 0;
        const cls = pos ? 'text-positive' : 'text-negative';
        const sign = pos ? '+' : '';
        return `
        <tr class="market-row" data-id="${c.id}">
            <td><span class="symbol-pill">${c.symbol}</span></td>
            <td class="font-bold">${c.name}</td>
            <td class="font-bold text-right">${c.current_price.toFixed(2)}</td>
            <td class="${cls} text-right">${sign}${change.toFixed(2)}</td>
            <td class="${cls} text-right font-bold">${sign}${pct.toFixed(2)}%</td>
        </tr>`;
    }).join('');
    if (window.lucide) window.lucide.createIcons();
}

// ============================
// DETAIL VIEW
// ============================
async function openDetail(currencyId) {
    const c = state.currencies.find(x => x.id === currencyId);
    if (!c) return;
    state.selectedCurrency = c;

    $('detail-symbol').innerText = c.symbol;
    $('detail-name').innerText = c.name;
    
    $('detail-price').innerText = c.current_price.toFixed(2);

    const { change, pct } = getRealChange(c);
    const pos = change >= 0;
    const el = $('detail-change');
    if (el) {
        const icon = pos ? '<i data-lucide="trending-up"></i>' : '<i data-lucide="trending-down"></i>';
        el.innerHTML = `${pos ? '+' : ''}${change.toFixed(2)} (${pos ? '+' : ''}${pct.toFixed(2)}%) ${icon}`;
        el.className = 'stock-change-huge ' + (pos ? 'text-positive' : 'text-negative');
    }

    const stats = await getAdvancedStats(c.id);
    $('stat-ipo').innerText = '10.00';
    $('stat-prev').innerText = stats.prev.toFixed(2);
    $('stat-vol').innerText = stats.volume.toLocaleString();
    $('stat-cap').innerText = stats.cap.toLocaleString(undefined, { maximumFractionDigits: 0 }) + ' pts';
    $('stat-range').innerText = `${stats.low.toFixed(2)} - ${stats.high.toFixed(2)}`;
    $('stat-52wk').innerText = `${stats.low.toFixed(2)} - ${stats.high.toFixed(2)}`;
    
    // Trade panel
    const tradeHoldings = $('trade-holdings');
    const tradeFunds = $('trade-funds');
    if (tradeHoldings) tradeHoldings.innerText = (state.holdings[c.id] || 0) + ' shares';
    if (tradeFunds && state.profile) tradeFunds.innerText = state.profile.points.toLocaleString() + ' pts';

    // Show delete button if owner
    const deleteBtn = $('btn-delete-currency');
    if (deleteBtn) {
        deleteBtn.style.display = (c.creator_id === state.user.id) ? 'flex' : 'none';
    }

    setView('detail');
    renderChart();
    renderHistoryTable();
    updateTradeTotal();
    if (window.lucide) window.lucide.createIcons();
}

// ============================
// RENDER: CHART
// ============================
async function renderChart() {
    const container = $('chart-container');
    if (!container) return;
    container.innerHTML = '';

    const c = state.selectedCurrency;
    if (!c) return;

    const data = await fetchPriceHistory(c.id, state.chartRange);

    const style = getComputedStyle(document.body);
    const accentColor = style.getPropertyValue('--accent').trim() || '#8B5CF6';
    const textColor = style.getPropertyValue('--text-main').trim() || '#111827';

    const chart = LightweightCharts.createChart(container, {
        width: container.clientWidth,
        height: 400,
        layout: {
            background: { type: 'solid', color: 'transparent' },
            textColor: textColor,
            fontFamily: "Inter, sans-serif"
        },
        grid: { 
            vertLines: { color: '#F3F4F6' }, 
            horzLines: { color: '#F3F4F6' } 
        },
        crosshair: {
            mode: LightweightCharts.CrosshairMode.Normal,
        },
        rightPriceScale: { borderColor: '#E5E7EB' },
        timeScale: { 
            borderColor: '#E5E7EB', 
            timeVisible: true,
        }
    });

    let series;
    if (state.chartType === 'candle') {
        series = chart.addCandlestickSeries({
            upColor: '#10B981', downColor: '#EF4444', borderVisible: false,
            wickUpColor: '#10B981', wickDownColor: '#EF4444'
        });
        const ohlc = convertToOHLC(data);
        if (ohlc.length === 0) {
            const now = Math.floor(Date.now() / 1000);
            series.setData([{ time: now, open: c.current_price, high: c.current_price, low: c.current_price, close: c.current_price }]);
        } else {
            series.setData(ohlc);
        }
    } else {
        series = chart.addAreaSeries({ 
            lineColor: accentColor, 
            topColor: 'rgba(139, 92, 246, 0.4)', 
            bottomColor: 'rgba(139, 92, 246, 0.0)' 
        });
        if (data.length === 0) {
            series.setData([{ time: Math.floor(Date.now() / 1000), value: c.current_price }]);
        } else {
            series.setData(data);
        }
    }

    chart.timeScale().fitContent();
    state.chart = chart;
    state.chartSeries = series;

    const resizeObserver = new ResizeObserver(() => { chart.applyOptions({ width: container.clientWidth }); });
    resizeObserver.observe(container);
}

function convertToOHLC(data) {
    if (data.length === 0) return [];
    const interval = 60; // 1-minute candles
    const candles = [];
    let currentCandle = null;

    data.forEach(p => {
        const bucket = Math.floor(p.time / interval) * interval;
        if (!currentCandle || currentCandle.time !== bucket) {
            if (currentCandle) candles.push(currentCandle);
            currentCandle = {
                time: bucket,
                open: p.value,
                high: p.value,
                low: p.value,
                close: p.value
            };
        } else {
            currentCandle.high = Math.max(currentCandle.high, p.value);
            currentCandle.low = Math.min(currentCandle.low, p.value);
            currentCandle.close = p.value;
        }
    });
    if (currentCandle) candles.push(currentCandle);
    return candles;
}

// ============================
// HISTORY TABLE
// ============================
async function renderHistoryTable() {
    const body = $('history-body');
    if (!body || !state.selectedCurrency) return;

    const { data, error } = await supabase
        .from('price_history')
        .select('*')
        .eq('currency_id', state.selectedCurrency.id)
        .order('recorded_at', { ascending: false })
        .limit(10);

    if (error || !data || data.length === 0) {
        body.innerHTML = `<tr><td colspan="2" class="text-center py-2 text-muted">No trades recorded yet.</td></tr>`;
        return;
    }

    body.innerHTML = data.map(d => {
        const date = new Date(d.recorded_at);
        const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        
        return `
        <tr>
            <td class="text-muted">${date.toLocaleDateString()} ${timeStr}</td>
            <td class="font-bold text-right">${parseFloat(d.price).toFixed(2)}</td>
        </tr>`;
    }).join('');
}

async function deleteCurrency() {
    $('modal-confirm-delete').classList.add('active');
}

async function executeDelete() {
    const c = state.selectedCurrency;
    if (!c) return;
    
    try {
        const { error } = await supabase.from('currencies').delete().eq('id', c.id);
        if (error) throw error;
        
        state.currencies = state.currencies.filter(curr => curr.id !== c.id);
        state.selectedCurrency = null;
        
        notify(`${c.symbol} deleted successfully.`, 'success');
        setView('market');
        renderMarket();
        $('modal-confirm-delete').classList.remove('active');
        await refreshData();
    } catch (err) {
        notify("Delete failed: " + err.message, 'error');
        $('modal-confirm-delete').classList.remove('active');
    }
}

// ============================
// TICKER
// ============================
function updateTicker() {
    const el = $('global-ticker');
    if (!el) return;
    if (state.currencies.length === 0) {
        el.innerHTML = '<span class="ticker-item">No active markets</span>';
        return;
    }
    
    const items = state.currencies.map(c => {
        const { change } = getRealChange(c, '1d');
        const pos = change >= 0;
        const color = pos ? '#10B981' : '#EF4444';
        const sign = pos ? '+' : '';
        return `<span class="ticker-item">${c.symbol} <b>${c.current_price.toFixed(2)}</b> <span style="color:${color}">${sign}${change.toFixed(2)}</span></span>`;
    }).join('');
    
    el.innerHTML = items + items + items; // Duplicate for smooth infinite scroll
}

// ============================
// USER UI
// ============================
function updateUserUI() {
    if (!state.profile) return;
    const userDisplay = $('user-display');
    if (userDisplay) userDisplay.style.display = 'block';
    
    const navUsername = $('nav-username');
    if (navUsername) navUsername.innerText = state.profile.username;
    
    const userPoints = $('user-points');
    if (userPoints) userPoints.innerText = `${state.profile.points.toLocaleString()} pts`;
    
    const iconSlot = $('nav-icon-slot');
    if (iconSlot) {
        iconSlot.innerHTML = renderIcon(state.profile.equipped_icon || 'nozus_default', 24);
    }
}

// ============================
// TRADE
// ============================
function updateTradeTotal() {
    const c = state.selectedCurrency;
    if (!c) return;
    const sharesEl = $('trade-shares');
    const totalEl = $('trade-total');
    if (!sharesEl || !totalEl) return;
    
    const shares = parseInt(sharesEl.value) || 0;
    const isBuy = state.tradeAction === 'buy';
    const unitPrice = isBuy ? c.current_price * 1.001 : c.current_price * 0.999;
    
    totalEl.innerText = (shares * unitPrice).toFixed(2) + ' pts';
    totalEl.className = 'font-bold text-lg';
    
    const pps = $('trade-pps');
    if (pps) pps.innerText = unitPrice.toFixed(2) + ' pts';
}

async function executeTrade() {
    const c = state.selectedCurrency;
    if (!c) return;
    const shares = parseInt($('trade-shares').value) || 0;
    if (shares <= 0) return notify("Enter a valid number of shares", 'error');
    const cost = shares * c.current_price;

    if (state.tradeAction === 'buy') {
        try {
            // SLIPPAGE: Base spread (0.1%) + Volume impact (0.5% per share)
            const spreadPrice = parseFloat(c.current_price) * 1.001;
            const avgPrice = spreadPrice * (1 + (shares * 0.0025)); 
            const totalCost = shares * avgPrice;
            
            const currentPoints = parseFloat(state.profile.points);
            if (currentPoints < totalCost) return notify("Insufficient points", 'error');

            const { error: pError } = await supabase.from('profiles').update({ points: Math.floor(currentPoints - totalCost) }).eq('id', state.user.id);
            if (pError) throw pError;
            
            await supabase.from('transactions').insert([{
                user_id: state.user.id, currency_id: c.id, type: 'buy', amount: shares, price_at_time: avgPrice
            }]);
            
            const current = state.holdings[c.id] || 0;
            const { error: hError } = await supabase.from('holdings')
                .upsert([{ 
                    user_id: state.user.id, 
                    currency_id: c.id, 
                    shares: current + shares 
                }], { onConflict: 'user_id,currency_id' });
            
            if (hError) throw hError;

            // Bump price
            const newPrice = Math.round((c.current_price * (1 + shares * 0.005)) * 100) / 100;
            await supabase.from('currencies').update({ current_price: newPrice }).eq('id', c.id);
            await recordPrice(c.id, newPrice);

            notify(`Filled: Bought ${shares} shares of ${c.symbol}`, 'success');
            await postTradeRefresh(c.id);
        } catch (err) { 
            notify("Trade failed: " + (err.message || "Unknown error"), 'error'); 
        }
    } else {
        const owned = state.holdings[c.id] || 0;
        if (owned < shares) return notify(`You only own ${owned} shares`, 'error');

        try {
            const spreadPrice = parseFloat(c.current_price) * 0.999;
            const avgPrice = spreadPrice * (1 - (shares * 0.0025));
            const totalCredit = shares * avgPrice;

            const currentPoints = parseFloat(state.profile.points);
            const { error: pError } = await supabase.from('profiles').update({ points: Math.floor(currentPoints + totalCredit) }).eq('id', state.user.id);
            if (pError) throw pError;
            
            await supabase.from('transactions').insert([{
                user_id: state.user.id, currency_id: c.id, type: 'sell', amount: shares, price_at_time: avgPrice
            }]);
            
            const { error: hError } = await supabase.from('holdings')
                .update({ shares: owned - shares })
                .eq('user_id', state.user.id)
                .eq('currency_id', c.id);
            
            if (hError) throw hError;

            const newPrice = Math.max(0.01, Math.round((c.current_price * (1 - shares * 0.005)) * 100) / 100);
            await supabase.from('currencies').update({ current_price: newPrice }).eq('id', c.id);
            await recordPrice(c.id, newPrice);

            notify(`Filled: Sold ${shares} shares of ${c.symbol}`, 'success');
            await postTradeRefresh(c.id);
        } catch (err) { notify(err.message, 'error'); }
    }
}

async function postTradeRefresh(currencyId) {
    await fetchProfile(state.user.id);
    await fetchHoldings();
    
    const { data: updatedCurr } = await supabase.from('currencies').select('*').eq('id', currencyId).single();
    if (updatedCurr) {
        const idx = state.currencies.findIndex(x => x.id === currencyId);
        if (idx !== -1) state.currencies[idx] = updatedCurr;
        if (state.selectedCurrency?.id === currencyId) state.selectedCurrency = updatedCurr;
    }

    await refreshData();
    updateUserUI();
    if (state.view === 'detail' && state.selectedCurrency) {
        openDetail(currencyId);
    }
}

// ============================
// VIEWS
// ============================
function setView(v) {
    state.view = v;
    const marketView = $('market-view');
    const detailView = $('detail-view');
    const rightPanel = $('right-panel');
    const mainContainer = $('main-container');
    
    if (marketView) marketView.style.display = v === 'market' ? 'block' : 'none';
    if (detailView) detailView.style.display = v === 'detail' ? 'block' : 'none';
    
    if (v === 'detail') {
        if (rightPanel) rightPanel.style.display = 'block';
        if (mainContainer) mainContainer.classList.add('detail-layout');
    } else {
        if (rightPanel) rightPanel.style.display = 'none';
        if (mainContainer) mainContainer.classList.remove('detail-layout');
    }

    document.querySelectorAll('.nav-item').forEach(l => {
        l.classList.toggle('active', l.id === `view-${v}`);
    });
}

// ============================
// LISTENERS
// ============================
function setupListeners() {
    $('view-market')?.addEventListener('click', () => setView('market'));
    $('btn-back')?.addEventListener('click', () => setView('market'));

    $('btn-launch')?.addEventListener('click', () => { $('modal-launch').classList.add('active'); });

    $('btn-logout')?.addEventListener('click', async () => {
        await supabase.auth.signOut();
        window.location.href = 'auth.html';
    });

    document.querySelectorAll('.btn-close').forEach(b => {
        b.onclick = () => {
            const modal = b.closest('.modal-overlay');
            if (modal) modal.classList.remove('active');
        };
    });

    const launchForm = $('form-launch');
    if (launchForm) {
        launchForm.onsubmit = async (e) => {
            e.preventDefault();
            const name = $('launch-name').value.trim();
            const symbol = $('launch-symbol').value.trim().toUpperCase();
            
            // STRICT 1-4 letter validation
            if (!/^[A-Z]{1,4}$/.test(symbol)) return notify("Ticker must be 1 to 4 letters (A-Z).", 'error');

            try {
                const { data, error } = await supabase.from('currencies').insert([{
                    creator_id: state.user.id, name, symbol, current_price: 10
                }]).select();
                if (error) throw error;
                // Record IPO price
                if (data && data[0]) {
                    await recordPrice(data[0].id, 10);
                }
                notify(`${symbol} successfully launched!`, 'success');
                $('modal-launch').classList.remove('active');
                launchForm.reset();
                await refreshData();
            } catch (err) { notify(err.message, 'error'); }
        };
    }

    $('market-body')?.addEventListener('click', (e) => {
        const row = e.target.closest('.market-row');
        if (row) openDetail(row.dataset.id);
    });

    $('search-input')?.addEventListener('input', renderMarket);

    // Trade tabs
    document.addEventListener('click', (e) => {
        const tab = e.target.closest('.trade-toggle-btn');
        if (tab) {
            state.tradeAction = tab.dataset.action;
            document.querySelectorAll('.trade-toggle-btn').forEach(t => t.classList.toggle('active', t === tab));
            
            const btn = $('btn-execute-trade');
            if (btn) {
                btn.innerText = state.tradeAction === 'buy' ? 'Place Buy Order' : 'Place Sell Order';
                btn.className = state.tradeAction === 'buy' ? 'btn btn-buy w-full' : 'btn btn-sell w-full';
            }
            updateTradeTotal();
        }
    });

    $('trade-shares')?.addEventListener('input', updateTradeTotal);
    $('btn-execute-trade')?.addEventListener('click', executeTrade);
    $('btn-delete-currency')?.addEventListener('click', deleteCurrency);

    // Market range tabs
    $('market-tabs')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.range-btn');
        if (btn) {
            state.marketRange = btn.dataset.range;
            document.querySelectorAll('#market-tabs .range-btn').forEach(b => b.classList.toggle('active', b === btn));
            refreshData();
        }
    });

    // Chart range tabs
    $('chart-tabs')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.range-btn');
        if (btn) {
            state.chartRange = btn.dataset.range;
            document.querySelectorAll('#chart-tabs .range-btn').forEach(b => b.classList.toggle('active', b === btn));
            renderChart();
        }
    });

    $('chart-type-tabs')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.range-btn');
        if (btn) {
            state.chartType = btn.dataset.type;
            document.querySelectorAll('#chart-type-tabs .range-btn').forEach(b => b.classList.toggle('active', b === btn));
            renderChart();
        }
    });

    $('btn-confirm-delete-yes')?.addEventListener('click', executeDelete);
}

// ============================
// REALTIME
// ============================
function subscribe() {
    supabase.channel('any').on('postgres_changes', { event: '*', schema: 'public', table: 'currencies' }, refreshData).subscribe();
}

init();
