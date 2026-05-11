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
    selectedRange: '1M',
    tradeAction: 'buy',
    chart: null,
    chartSeries: null,
    holdings: {}
};

// ============================
// DOM REFS
// ============================
const $ = (id) => document.getElementById(id);

// ============================
// SEEDED PRNG (Mulberry32)
// ============================
function mulberry32(a) {
    return function () {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

function hashStr(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = ((h << 5) - h) + s.charCodeAt(i);
        h |= 0;
    }
    return Math.abs(h);
}

// ============================
// PRICE SIMULATION
// ============================
function generatePriceData(currency, range) {
    const seed = hashStr(currency.id);
    const rangeSeed = hashStr(currency.id + range);
    const rng = mulberry32(rangeSeed);

    const configs = {
        '1D': { interval: 300, count: 288 },
        '1W': { interval: 1800, count: 336 },
        '1M': { interval: 7200, count: 360 },
        '3M': { interval: 86400, count: 90 },
        '1Y': { interval: 86400, count: 365 }
    };

    const { interval, count } = configs[range] || configs['1M'];
    const now = Math.floor(Date.now() / 1000);
    const startTime = now - (count * interval);

    // Generate raw walk
    const rawPrices = [10];
    for (let i = 1; i < count; i++) {
        const volatility = range === '1D' ? 0.008 : 0.025;
        const drift = 0.0001;
        const change = (rng() - 0.48) * volatility + drift;
        rawPrices.push(Math.max(0.5, rawPrices[i - 1] * (1 + change)));
    }

    // Scale so the walk ends at current_price
    const rawEnd = rawPrices[rawPrices.length - 1];
    const targetEnd = currency.current_price || 10;
    const scale = targetEnd / rawEnd;

    return rawPrices.map((p, i) => ({
        time: startTime + (i * interval),
        value: parseFloat((p * scale).toFixed(2))
    }));
}

// Real change calculation: current price vs IPO price (10)
function getRealChange(currency) {
    const ipo = 10;
    const current = currency.current_price;
    return {
        change: parseFloat((current - ipo).toFixed(2)),
        pct: parseFloat((((current - ipo) / ipo) * 100).toFixed(2))
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
    const { data } = await supabase.from('holdings').select('*').eq('user_id', state.user.id);
    state.holdings = {};
    if (data) data.forEach(h => { state.holdings[h.currency_id] = h.shares; });
}

async function refreshData() {
    try {
        const { data: c } = await supabase.from('currencies').select('*').order('created_at', { ascending: false });
        if (c) { state.currencies = c; renderMarket(); updateTicker(); }

        const { data: l } = await supabase.from('profiles').select('*').order('points', { ascending: false }).limit(10);
        if (l) { state.leaderboard = l; renderLeaderboard(); }
    } catch (err) {
        console.error("Data refresh failed:", err.message);
    }
}

// ============================
// SPARKLINE (Canvas)
// ============================
function drawSparkline(canvas, data, isPositive) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width; const h = canvas.height;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr; canvas.height = h * dpr;
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    if (data.length < 2) return;

    const vals = data.map(d => d.value);
    const min = Math.min(...vals); const max = Math.max(...vals);
    const range = max - min || 1;

    ctx.beginPath();
    ctx.strokeStyle = isPositive ? '#10b981' : '#ef4444';
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';

    vals.forEach((v, i) => {
        const x = (i / (vals.length - 1)) * w;
        const y = h - ((v - min) / range) * (h - 6) - 3;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Gradient fill
    const lastX = w; const lastY = h - ((vals[vals.length - 1] - min) / range) * (h - 6) - 3;
    ctx.lineTo(lastX, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, isPositive ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fill();
}

// ============================
// RENDER: MARKET TABLE
// ============================
function renderMarket() {
    const body = $('market-body');
    if (!body) return;
    if (state.currencies.length === 0) {
        body.innerHTML = `<tr><td colspan="6" class="text-center py-2 text-muted">No currencies active. Be the first to launch!</td></tr>`;
        return;
    }
    body.innerHTML = state.currencies.map(c => {
        const { change, pct } = getRealChange(c);
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
            <td style="text-align:center"><canvas class="sparkline-canvas" width="120" height="40" data-cid="${c.id}"></canvas></td>
        </tr>`;
    }).join('');

    // Draw sparklines
    requestAnimationFrame(() => {
        state.currencies.forEach(c => {
            const canvas = document.querySelector(`canvas[data-cid="${c.id}"]`);
            if (canvas) {
                const data = generatePriceData(c, '1M');
                const sampled = data.filter((_, i) => i % 6 === 0);
                const { change } = getRealChange(c);
                drawSparkline(canvas, sampled, change >= 0);
            }
        });
    });
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
}

// ============================
// RENDER: DETAIL VIEW + CHART
// ============================
function openDetail(currencyId) {
    const c = state.currencies.find(x => x.id === currencyId);
    if (!c) return;
    state.selectedCurrency = c;
    state.selectedRange = '1M';

    $('detail-symbol').innerText = c.symbol;
    $('detail-name').innerText = c.name;
    $('detail-price').innerText = c.current_price.toFixed(2);
    $('trade-pps').innerText = c.current_price.toFixed(2) + ' pts';
    $('stat-ipo').innerText = '10.00';

    const { change, pct } = getRealChange(c);
    const pos = change >= 0;
    const el = $('detail-change');
    el.innerText = `${pos ? '+' : ''}${change.toFixed(2)} (${pos ? '+' : ''}${pct.toFixed(2)}%)`;
    el.className = 'price-change ' + (pos ? 'text-positive' : 'text-negative');

    // Holdings
    const shares = state.holdings[c.id] || 0;
    $('trade-holdings').innerText = shares + ' shares';

    // Range buttons
    document.querySelectorAll('.range-btn').forEach(b => b.classList.toggle('active', b.dataset.range === '1M'));

    setView('detail');
    renderChart();
    updateTradeTotal();
}

function renderChart() {
    const container = $('chart-container');
    container.innerHTML = '';

    const c = state.selectedCurrency;
    if (!c) return;

    const data = generatePriceData(c, state.selectedRange);
    const { change } = getRealChange(c);
    const pos = change >= 0;
    const lineColor = pos ? '#10b981' : '#ef4444';
    const topColor = pos ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.2)';

    const chart = LightweightCharts.createChart(container, {
        width: container.clientWidth,
        height: 420,
        layout: {
            background: { type: 'solid', color: '#ffffff' },
            textColor: '#64748b',
            fontFamily: "'Plus Jakarta Sans', sans-serif"
        },
        grid: {
            vertLines: { visible: false },
            horzLines: { color: '#f1f5f9' }
        },
        crosshair: {
            mode: LightweightCharts.CrosshairMode.Normal,
            vertLine: { color: '#6366f1', width: 1, style: 2, labelBackgroundColor: '#6366f1' },
            horzLine: { color: '#6366f1', width: 1, style: 2, labelBackgroundColor: '#6366f1' }
        },
        rightPriceScale: { borderColor: '#f1f5f9' },
        timeScale: {
            borderColor: '#f1f5f9',
            timeVisible: state.selectedRange === '1D' || state.selectedRange === '1W'
        },
        handleScroll: true,
        handleScale: true
    });

    const series = chart.addAreaSeries({
        lineColor: lineColor,
        topColor: topColor,
        bottomColor: 'rgba(0,0,0,0)',
        lineWidth: 2,
        priceLineVisible: true,
        lastValueVisible: true,
        priceFormat: { type: 'price', precision: 2, minMove: 0.01 }
    });

    series.setData(data);
    chart.timeScale().fitContent();

    state.chart = chart;
    state.chartSeries = series;

    // Stats — real data only
    $('stat-ipo').innerText = '10.00';
    $('stat-price').innerText = c.current_price.toFixed(2);
    const { pct } = getRealChange(c);
    const returnEl = $('stat-return');
    returnEl.innerText = (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%';
    returnEl.style.color = pct >= 0 ? 'var(--accent)' : 'var(--danger)';
    $('stat-holdings').innerText = (state.holdings[c.id] || 0) + ' shares';

    // Resize
    const resizeObserver = new ResizeObserver(() => {
        chart.applyOptions({ width: container.clientWidth });
    });
    resizeObserver.observe(container);
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
    const shares = parseInt($('trade-shares').value) || 0;
    $('trade-total').innerText = (shares * c.current_price).toFixed(2) + ' pts';
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
            // Deduct points
            await supabase.from('profiles').update({ points: state.profile.points - cost }).eq('id', state.user.id);
            // Record transaction
            await supabase.from('transactions').insert([{
                user_id: state.user.id, currency_id: c.id, type: 'buy', amount: shares, price_at_time: c.current_price
            }]);
            // Update holdings
            const current = state.holdings[c.id] || 0;
            if (current > 0) {
                await supabase.from('holdings').update({ shares: current + shares }).eq('user_id', state.user.id).eq('currency_id', c.id);
            } else {
                await supabase.from('holdings').insert([{ user_id: state.user.id, currency_id: c.id, shares: shares }]);
            }
            // Bump price slightly (demand)
            const newPrice = Math.round((c.current_price * (1 + shares * 0.005)) * 100) / 100;
            await supabase.from('currencies').update({ current_price: newPrice }).eq('id', c.id);

            notify(`Bought ${shares} shares of ${c.symbol}!`, 'success');
            await postTradeRefresh(c.id);
        } catch (err) { notify(err.message, 'error'); }
    } else {
        // Sell
        const owned = state.holdings[c.id] || 0;
        if (owned < shares) return notify(`You only own ${owned} shares`, 'error');

        try {
            await supabase.from('profiles').update({ points: state.profile.points + cost }).eq('id', state.user.id);
            await supabase.from('transactions').insert([{
                user_id: state.user.id, currency_id: c.id, type: 'sell', amount: shares, price_at_time: c.current_price
            }]);
            await supabase.from('holdings').update({ shares: owned - shares }).eq('user_id', state.user.id).eq('currency_id', c.id);
            // Drop price slightly (supply)
            const newPrice = Math.max(0.01, Math.round((c.current_price * (1 - shares * 0.005)) * 100) / 100);
            await supabase.from('currencies').update({ current_price: newPrice }).eq('id', c.id);

            notify(`Sold ${shares} shares of ${c.symbol}!`, 'success');
            await postTradeRefresh(c.id);
        } catch (err) { notify(err.message, 'error'); }
    }
}

async function postTradeRefresh(currencyId) {
    await fetchProfile(state.user.id);
    await fetchHoldings();
    await refreshData();
    updateUserUI();
    // Re-open detail if still viewing
    if (state.view === 'detail' && state.selectedCurrency) {
        const updated = state.currencies.find(x => x.id === currencyId);
        if (updated) {
            state.selectedCurrency = updated;
            $('detail-price').innerText = updated.current_price.toFixed(2);
            $('trade-pps').innerText = updated.current_price.toFixed(2) + ' pts';
            $('trade-holdings').innerText = (state.holdings[currencyId] || 0) + ' shares';
            updateTradeTotal();
            renderChart();
        }
    }
}

// ============================
// VIEWS
// ============================
function setView(v) {
    state.view = v;
    $('market-view').style.display = v === 'market' ? 'block' : 'none';
    $('detail-view').style.display = v === 'detail' ? 'block' : 'none';
    $('leaderboard-view').style.display = v === 'leaderboard' ? 'block' : 'none';

    document.querySelectorAll('.nav-link').forEach(l => {
        l.classList.toggle('active', l.id === `view-${v}`);
    });
}

// ============================
// LISTENERS
// ============================
function setupListeners() {
    // Navigation
    $('view-market')?.addEventListener('click', () => setView('market'));
    $('view-leaderboard')?.addEventListener('click', () => setView('leaderboard'));
    $('btn-back')?.addEventListener('click', () => setView('market'));

    // Logout
    $('btn-logout')?.addEventListener('click', async () => {
        await supabase.auth.signOut();
        window.location.href = 'auth.html';
    });

    // Launch modal
    $('btn-launch')?.addEventListener('click', () => { $('modal-launch').style.display = 'flex'; });
    document.querySelectorAll('.btn-close').forEach(b => {
        b.onclick = () => b.closest('.modal-overlay').style.display = 'none';
    });

    // Launch form
    const launchForm = $('form-launch');
    if (launchForm) {
        launchForm.onsubmit = async (e) => {
            e.preventDefault();
            const name = $('launch-name').value.trim();
            const symbol = $('launch-symbol').value.trim().toUpperCase();
            if (!/^[A-Z]{4}$/.test(symbol)) return notify("Ticker must be exactly 4 letters (A-Z).", 'error');

            try {
                const { error } = await supabase.from('currencies').insert([{
                    creator_id: state.user.id, name, symbol, current_price: 10
                }]).select();
                if (error) throw error;
                notify(`${symbol} launched successfully!`, 'success');
                $('modal-launch').style.display = 'none';
                launchForm.reset();
                await refreshData();
            } catch (err) { notify(err.message, 'error'); }
        };
    }

    // Market row click -> detail
    $('market-body')?.addEventListener('click', (e) => {
        const row = e.target.closest('.market-row');
        if (row) openDetail(row.dataset.id);
    });

    // Range buttons
    $('range-selector')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.range-btn');
        if (btn) {
            state.selectedRange = btn.dataset.range;
            document.querySelectorAll('.range-btn').forEach(b => b.classList.toggle('active', b === btn));
            renderChart();
        }
    });

    // Trade tabs
    document.addEventListener('click', (e) => {
        const tab = e.target.closest('.trade-tab');
        if (tab) {
            state.tradeAction = tab.dataset.action;
            document.querySelectorAll('.trade-tab').forEach(t => t.classList.toggle('active', t === tab));
            $('btn-execute-trade').innerText = state.tradeAction === 'buy' ? 'Place Buy Order' : 'Place Sell Order';
            $('btn-execute-trade').className = state.tradeAction === 'buy'
                ? 'btn btn-primary w-full'
                : 'btn btn-sell w-full';
        }
    });

    // Trade shares input
    $('trade-shares')?.addEventListener('input', updateTradeTotal);

    // Execute trade
    $('btn-execute-trade')?.addEventListener('click', executeTrade);
}

// ============================
// REALTIME
// ============================
function subscribe() {
    supabase.channel('any').on('postgres_changes', { event: '*', schema: 'public', table: 'currencies' }, refreshData).subscribe();
}

// ============================
// GO
// ============================
init();
