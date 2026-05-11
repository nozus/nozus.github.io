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
    marketRange: 'live',
    chartRange: '1d',
    chartType: 'area'
};

const $ = (id) => document.getElementById(id);

// ============================
// REAL CHANGE (vs IPO price of 10)
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
    toast.className = `toast toast-${type}`;
    toast.innerText = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 500); }, 4000);
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
        const { data: c } = await supabase.from('currencies').select('*').order('created_at', { ascending: false });
        if (c) {
            // If timeframe is not live, we need to fetch base prices
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
        if (l) { state.leaderboard = l; renderLeaderboard(); }
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
// RECORD PRICE (after trades)
// ============================
let lastRecordTime = 0;
async function recordPrice(currencyId, price) {
    let now = Math.floor(Date.now() / 1000);
    // Ensure unique timestamp for LightweightCharts
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

// ============================
// RENDER: MARKET TABLE
// ============================
function renderMarket() {
    const body = $('market-body');
    if (!body) return;
    if (state.currencies.length === 0) {
        body.innerHTML = `<tr><td colspan="5" class="text-center py-2 text-muted">No currencies active. Be the first to launch!</td></tr>`;
        return;
    }
    body.innerHTML = state.currencies.map(c => {
        const { change, pct } = getRealChange(c, state.marketRange);
        const pos = change >= 0;
        const cls = pos ? 'text-positive' : 'text-negative';
        const sign = pos ? '+' : '';
        return `
        <tr class="market-row" data-id="${c.id}" style="cursor:pointer">
            <td><span class="symbol-pill">${c.symbol}</span></td>
            <td class="currency-name">${c.name}</td>
            <td class="font-bold" style="text-align:right">${c.current_price.toFixed(2)}</td>
            <td class="${cls}" style="text-align:right">${sign}${change.toFixed(2)}</td>
            <td class="${cls}" style="text-align:right">${sign}${pct.toFixed(2)}%</td>
        </tr>`;
    }).join('');
    if (window.lucide) window.lucide.createIcons();
}

// ============================
// RENDER: LEADERBOARD
// ============================
function renderLeaderboard() {
    const body = $('leaderboard-body');
    if (!body) return;
    body.innerHTML = state.leaderboard.map((u, i) => `
        <tr>
            <td><span class="rank-badge rank-${i < 3 ? i + 1 : 'other'}">#${i + 1}</span></td>
            <td>
                <div class="flex align-center gap-1">
                    ${renderIcon(u.equipped_icon || 'nozus_default', 32)}
                    <span class="font-bold">${u.username}</span>
                </div>
            </td>
            <td class="font-bold" style="text-align:right">${u.points.toLocaleString()} pts</td>
        </tr>
    `).join('');
    if (window.lucide) window.lucide.createIcons();
}

// ============================
// DETAIL VIEW
// ============================
function openDetail(currencyId) {
    const c = state.currencies.find(x => x.id === currencyId);
    if (!c) return;
    state.selectedCurrency = c;

    $('detail-symbol').innerText = c.symbol;
    $('detail-name').innerText = c.name;
    
    // Real market feel: Show Bid/Ask spread
    const bid = (c.current_price * 0.999).toFixed(2);
    const ask = (c.current_price * 1001 / 1000).toFixed(2);
    $('detail-price').innerText = c.current_price.toFixed(2);
    $('trade-pps').innerText = ask + ' pts'; // Buy at Ask

    const { change, pct } = getRealChange(c);
    const pos = change >= 0;
    const el = $('detail-change');
    el.innerText = `${pos ? '+' : ''}${change.toFixed(2)} (${pos ? '+' : ''}${pct.toFixed(2)}%)`;
    el.className = 'price-change ' + (pos ? 'text-positive' : 'text-negative');

    // Stats — real data only
    const ipoEl = $('stat-ipo');
    const priceEl = $('stat-price');
    const returnEl = $('stat-return');
    const holdingsEl = $('stat-holdings');
    if (ipoEl) ipoEl.innerText = '10.00';
    if (priceEl) priceEl.innerText = c.current_price.toFixed(2);
    if (returnEl) {
        returnEl.innerText = (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%';
        returnEl.style.color = pct >= 0 ? 'var(--accent)' : 'var(--danger)';
    }
    if (holdingsEl) {
        const shares = state.holdings[c.id] || 0;
        const val = (shares * c.current_price).toFixed(2);
        holdingsEl.innerText = `${shares} shares (${val} pts)`;
    }

    // Trade panel
    const tradeHoldings = $('trade-holdings');
    if (tradeHoldings) tradeHoldings.innerText = (state.holdings[c.id] || 0) + ' shares';

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
// RENDER: CHART (real data only)
// ============================
async function renderChart() {
    const container = $('chart-container');
    if (!container) return;
    container.innerHTML = '';

    const c = state.selectedCurrency;
    if (!c) return;

    const data = await fetchPriceHistory(c.id, state.chartRange);

    const { change, pct } = getRealChange(c, state.chartRange);
    const pos = change >= 0;
    const color = pos ? '#10b981' : '#ef4444';

    // Update floating badge
    const badge = $('chart-percentage-badge');
    if (badge) {
        badge.innerText = (pos ? '+' : '') + pct.toFixed(2) + '%';
        badge.style.color = color;
        badge.style.background = pos ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)';
    }

    const style = getComputedStyle(document.body);
    const bgColor = style.getPropertyValue('--bg-card').trim();
    const textColor = style.getPropertyValue('--text-muted').trim();
    const borderColor = style.getPropertyValue('--border').trim();

    const chart = LightweightCharts.createChart(container, {
        width: container.clientWidth,
        height: 420,
        layout: {
            background: { type: 'solid', color: bgColor },
            textColor: textColor,
            fontFamily: "'Plus Jakarta Sans', sans-serif"
        },
        grid: { vertLines: { color: borderColor }, horzLines: { color: borderColor } },
        crosshair: {
            mode: LightweightCharts.CrosshairMode.Normal,
            vertLine: { color: '#6366f1', width: 1, style: 2, labelBackgroundColor: '#6366f1' },
            horzLine: { color: '#6366f1', width: 1, style: 2, labelBackgroundColor: '#6366f1' }
        },
        rightPriceScale: { borderColor: borderColor },
        timeScale: { 
            borderColor: borderColor, 
            timeVisible: true,
            secondsVisible: false,
            tickMarkFormatter: (time, tickMarkType, locale) => {
                const date = new Date(time * 1000);
                const hrs = date.getHours();
                const mins = date.getMinutes();
                const ampm = hrs >= 12 ? 'p.m.' : 'a.m.';
                const h12 = hrs % 12 || 12;
                return `${h12}:${mins.toString().padStart(2,'0')} ${ampm}`;
            }
        },
        localization: {
            timeFormatter: timestamp => {
                const date = new Date(timestamp * 1000);
                const ampm = date.getHours() >= 12 ? 'p.m.' : 'a.m.';
                const h12 = date.getHours() % 12 || 12;
                return `${date.toLocaleDateString()} ${h12}:${date.getMinutes().toString().padStart(2,'0')} ${ampm}`;
            },
        },
        handleScroll: true,
        handleScale: true
    });

    let series;
    const type = state.chartType;

    if (type === 'candle' || type === 'bar') {
        const ohlcData = convertToOHLC(data);
        series = type === 'candle' 
            ? chart.addCandlestickSeries({ upColor: '#10b981', downColor: '#ef4444', borderVisible: false, wickUpColor: '#10b981', wickDownColor: '#ef4444' })
            : chart.addBarSeries({ upColor: '#10b981', downColor: '#ef4444' });
        series.setData(ohlcData);
    } else if (type === 'baseline') {
        series = chart.addBaselineSeries({ 
            baseValue: { type: 'price', price: data[0]?.value || 10 },
            topLineColor: '#10b981', topFillColor1: 'rgba(16,185,129,0.2)', topFillColor2: 'rgba(16,185,129,0.0)',
            bottomLineColor: '#ef4444', bottomFillColor1: 'rgba(239,68,68,0.0)', bottomFillColor2: 'rgba(239,68,68,0.2)'
        });
        series.setData(data);
    } else if (type === 'line') {
        series = chart.addLineSeries({ color: color, lineWidth: 2 });
        series.setData(data);
    } else {
        // Area (Mountain)
        series = chart.addAreaSeries({
            lineColor: color,
            topColor: pos ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)',
            bottomColor: 'rgba(16,185,129,0.0)',
            lineWidth: 3,
        });
        series.setData(data);
    }

    if (data.length === 0) {
        const now = Math.floor(Date.now() / 1000);
        const val = c.current_price;
        if (type === 'candle' || type === 'bar') {
            series.setData([{ time: now, open: val, high: val, low: val, close: val }]);
        } else {
            series.setData([{ time: now, value: val }]);
        }
    } else {
        // Ensure the chart has a starting point at the beginning of the data set
        // to prevent it looking like a single floating dot
        if (data.length === 1) {
            const first = data[0];
            data.unshift({ time: first.time - 3600, value: first.value });
        }
        series.setData(data);
    }

    chart.timeScale().fitContent();
    state.chart = chart;
    state.chartSeries = series;

    const resizeObserver = new ResizeObserver(() => { chart.applyOptions({ width: container.clientWidth }); });
    resizeObserver.observe(container);
}

function convertToOHLC(data) {
    if (data.length === 0) return [];
    
    // Using a 5-second interval for testing so users see movement quickly
    const interval = 5; 
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
        .limit(20);

    if (error || !data || data.length === 0) {
        body.innerHTML = `<tr><td colspan="3" class="text-center py-2 text-muted">No trades recorded yet.</td></tr>`;
        return;
    }

    body.innerHTML = data.map(d => {
        const date = new Date(d.recorded_at);
        // Explicitly format to local time to avoid UTC confusion
        const dateStr = date.toLocaleDateString();
        const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
        
        return `
        <tr>
            <td class="text-muted">${dateStr} ${timeStr}</td>
            <td class="font-bold" style="text-align:right">${parseFloat(d.price).toFixed(2)}</td>
            <td style="text-align:right"><span class="text-xs uppercase font-bold text-dim">Trade</span></td>
        </tr>`;
    }).join('');
    if (window.lucide) window.lucide.createIcons();
}

async function deleteCurrency() {
    $('modal-confirm-delete').style.display = 'flex';
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
        $('modal-confirm-delete').style.display = 'none';
        await refreshData();
    } catch (err) {
        notify("Delete failed: " + err.message, 'error');
        console.error("Deletion error details:", err);
        $('modal-confirm-delete').style.display = 'none';
    }
}

// ============================
// TICKER
// ============================
function updateTicker() {
    const container = $('ticker-data');
    if (!container) return;
    const items = state.currencies.slice(0, 8).map(c => {
        const { change } = getRealChange(c);
        const pos = change >= 0;
        const color = pos ? 'var(--accent)' : 'var(--danger)';
        return `<span style="margin-right: 2rem;">${c.symbol} <b style="color: ${color}">${c.current_price.toFixed(2)}</b></span>`;
    }).join('');
    container.innerHTML = items + items;
}

// ============================
// USER UI
// ============================
function updateUserUI() {
    if (!state.profile) return;
    $('user-display').style.display = 'flex';
    $('nav-username').innerText = state.profile.username;
    $('user-points').innerText = `${state.profile.points.toLocaleString()} pts`;
    const iconSlot = $('nav-icon-slot');
    if (iconSlot) {
        iconSlot.innerHTML = renderIcon(state.profile.equipped_icon || 'nozus_default', 32);
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
}

async function executeTrade() {
    const c = state.selectedCurrency;
    if (!c) return;
    const shares = parseInt($('trade-shares').value) || 0;
    if (shares <= 0) return notify("Enter a valid number of shares", 'error');
    const cost = shares * c.current_price;

    if (state.tradeAction === 'buy') {
        if (state.profile.points < cost) return notify("Insufficient points", 'error');

        try {
            // SLIPPAGE: Base spread (0.1%) + Volume impact (0.5% per share for visibility)
            const spreadPrice = parseFloat(c.current_price) * 1.001;
            const avgPrice = spreadPrice * (1 + (shares * 0.0025)); 
            const totalCost = shares * avgPrice;
            
            const currentPoints = parseFloat(state.profile.points);
            if (currentPoints < totalCost) return notify("Insufficient points", 'error');

            const { error: pError } = await supabase.from('profiles').update({ points: currentPoints - totalCost }).eq('id', state.user.id);
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

            // Bump price (demand) - 0.5% impact per share
            const newPrice = Math.round((c.current_price * (1 + shares * 0.005)) * 100) / 100;
            await supabase.from('currencies').update({ current_price: newPrice }).eq('id', c.id);
            // Record real price point
            await recordPrice(c.id, newPrice);

            notify(`Bought ${shares} shares of ${c.symbol}!`, 'success');
            await postTradeRefresh(c.id);
        } catch (err) { 
            console.error("Buy error:", err);
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
            const { error: pError } = await supabase.from('profiles').update({ points: currentPoints + totalCredit }).eq('id', state.user.id);
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

            notify(`Sold ${shares} shares of ${c.symbol}!`, 'success');
            await postTradeRefresh(c.id);
        } catch (err) { notify(err.message, 'error'); }
    }
}

async function postTradeRefresh(currencyId) {
    await fetchProfile(state.user.id);
    await fetchHoldings();
    
    // Explicitly update current currency in state before refreshData
    const { data: updatedCurr } = await supabase.from('currencies').select('*').eq('id', currencyId).single();
    if (updatedCurr) {
        const idx = state.currencies.findIndex(x => x.id === currencyId);
        if (idx !== -1) state.currencies[idx] = updatedCurr;
        if (state.selectedCurrency?.id === currencyId) state.selectedCurrency = updatedCurr;
    }

    await refreshData();
    updateUserUI();
    if (state.view === 'detail' && state.selectedCurrency) {
        renderHistoryTable();
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
    const leaderboardView = $('leaderboard-view');
    const settingsView = $('settings-view');
    if (marketView) marketView.style.display = v === 'market' ? 'block' : 'none';
    if (detailView) detailView.style.display = v === 'detail' ? 'block' : 'none';
    if (leaderboardView) leaderboardView.style.display = v === 'leaderboard' ? 'block' : 'none';
    if (settingsView) settingsView.style.display = v === 'settings' ? 'block' : 'none';

    document.querySelectorAll('.nav-link').forEach(l => {
        l.classList.toggle('active', l.id === `view-${v}`);
    });
}

// ============================
// LISTENERS
// ============================
function setupListeners() {
    $('view-market')?.addEventListener('click', () => setView('market'));
    $('view-leaderboard')?.addEventListener('click', () => setView('leaderboard'));
    $('view-settings')?.addEventListener('click', () => setView('settings'));
    $('btn-back')?.addEventListener('click', () => setView('market'));

    $('btn-launch')?.addEventListener('click', () => { $('modal-launch').style.display = 'flex'; });
    $('btn-launch-mobile')?.addEventListener('click', () => { $('modal-launch').style.display = 'flex'; });

    $('btn-logout')?.addEventListener('click', async () => {
        await supabase.auth.signOut();
        window.location.href = 'auth.html';
    });

    document.querySelectorAll('.btn-close').forEach(b => {
        b.onclick = () => b.closest('.modal-overlay').style.display = 'none';
    });

    const launchForm = $('form-launch');
    if (launchForm) {
        launchForm.onsubmit = async (e) => {
            e.preventDefault();
            const name = $('launch-name').value.trim();
            const symbol = $('launch-symbol').value.trim().toUpperCase();
            if (!/^[A-Z]{4}$/.test(symbol)) return notify("Ticker must be exactly 4 letters (A-Z).", 'error');

            try {
                const { data, error } = await supabase.from('currencies').insert([{
                    creator_id: state.user.id, name, symbol, current_price: 10
                }]).select();
                if (error) throw error;
                // Record IPO price as first price point
                if (data && data[0]) {
                    await recordPrice(data[0].id, 10);
                }
                notify(`${symbol} launched successfully!`, 'success');
                $('modal-launch').style.display = 'none';
                launchForm.reset();
                await refreshData();
            } catch (err) { notify(err.message, 'error'); }
        };
    }

    $('market-body')?.addEventListener('click', (e) => {
        const row = e.target.closest('.market-row');
        if (row) openDetail(row.dataset.id);
    });

    // Trade tabs
    document.addEventListener('click', (e) => {
        const tab = e.target.closest('.trade-tab');
        if (tab) {
            state.tradeAction = tab.dataset.action;
            document.querySelectorAll('.trade-tab').forEach(t => t.classList.toggle('active', t === tab));
            const btn = $('btn-execute-trade');
            if (btn) {
                btn.innerText = state.tradeAction === 'buy' ? 'Place Buy Order' : 'Place Sell Order';
                btn.className = state.tradeAction === 'buy' ? 'btn btn-primary w-full' : 'btn btn-sell w-full';
            }
            updateTradeTotal();
            const pps = $('trade-pps');
            if (pps && state.selectedCurrency) {
                const isBuy = state.tradeAction === 'buy';
                const price = isBuy ? state.selectedCurrency.current_price * 1.001 : state.selectedCurrency.current_price * 0.999;
                pps.innerText = price.toFixed(2) + ' pts';
            }
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

    $('btn-toggle-theme')?.addEventListener('click', () => {
        const isDark = document.body.classList.toggle('dark-theme');
        const icon = $('btn-toggle-theme').querySelector('i');
        if (icon) {
            icon.setAttribute('data-lucide', isDark ? 'sun' : 'moon');
            if (window.lucide) window.lucide.createIcons();
        }
        // Force chart re-render to pick up new theme colors
        if (state.view === 'detail') renderChart();
    });
}

// ============================
// REALTIME
// ============================
function subscribe() {
    supabase.channel('any').on('postgres_changes', { event: '*', schema: 'public', table: 'currencies' }, refreshData).subscribe();
}

init();
