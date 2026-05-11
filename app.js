import { supabase } from './supabase-client.js';

// App State
let state = {
    user: null,
    profile: null,
    currencies: [],
    leaderboard: [],
    view: 'market'
};

const els = {
    marketBody: document.getElementById('market-body'),
    portfolioBody: document.getElementById('portfolio-body'),
    leaderboardBody: document.getElementById('leaderboard-body'),
    userDisplay: document.getElementById('user-display'),
    navUsername: document.getElementById('nav-username'),
    navAvatar: document.getElementById('nav-avatar'),
    navInitials: document.getElementById('nav-initials'),
    userPoints: document.getElementById('user-points'),
    mainTitle: document.getElementById('main-title'),
    mainSubtitle: document.getElementById('main-subtitle'),
    
    // Areas
    marketArea: document.getElementById('market-area'),
    portfolioArea: document.getElementById('portfolio-area'),
    leaderboardArea: document.getElementById('leaderboard-area'),
    
    // Modals
    modalSettings: document.getElementById('modal-settings'),
    modalLaunch: document.getElementById('modal-launch'),
    modalTrade: document.getElementById('modal-trade')
};

async function init() {
    console.log("Initializing Nozus App...");
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
            updateUI();
        } else {
            console.warn("No user session found. Redirecting...");
            window.location.href = 'auth.html';
        }
    } catch (e) {
        console.error("Auth check failed:", e.message);
    }
}

async function fetchProfile(uid) {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', uid).single();
    if (data) state.profile = data;
    else if (error) console.error("Profile fetch error:", error);
}

async function refreshData() {
    try {
        const { data: c, error: cError } = await supabase.from('currencies').select('*').order('created_at', { ascending: false });
        if (cError) throw cError;
        if (c) {
            state.currencies = c;
            renderMarket();
            updateTicker();
        }

        const { data: l, error: lError } = await supabase.from('profiles').select('*').order('points', { ascending: false }).limit(10);
        if (lError) throw lError;
        if (l) {
            state.leaderboard = l;
            renderLeaderboard();
        }
    } catch (err) {
        console.error("Data refresh failed:", err.message);
        if (els.marketBody) {
            els.marketBody.innerHTML = `<tr><td colspan="4" class="text-center py-2 text-danger">Connection Error: ${err.message}. Please check your Supabase keys.</td></tr>`;
        }
    }
}

// Rendering
function renderMarket() {
    if (!els.marketBody) return;
    els.marketBody.innerHTML = state.currencies.map(c => `
        <tr>
            <td><span class="font-bold text-primary">$${c.symbol}</span></td>
            <td>${c.name}</td>
            <td class="font-bold">${c.current_price} pts</td>
            <td>
                <button class="btn btn-primary btn-trade-trigger" data-id="${c.id}" data-name="${c.name}" data-price="${c.current_price}">Trade</button>
            </td>
        </tr>
    `).join('');
}

function renderLeaderboard() {
    if (!els.leaderboardBody) return;
    els.leaderboardBody.innerHTML = state.leaderboard.map((u, i) => `
        <tr>
            <td>#${i+1}</td>
            <td>${u.username}</td>
            <td class="font-bold">${u.points} pts</td>
        </tr>
    `).join('');
}

function updateTicker() {
    const container = document.getElementById('ticker-data');
    if (!container) return;
    const items = state.currencies.slice(0, 6).map(c => `
        <span style="margin-right: 2rem;">$${c.symbol} <b style="color: var(--accent)">${c.current_price}</b></span>
    `).join('');
    container.innerHTML = items + items;
}

function updateUI() {
    if (state.profile) {
        els.userDisplay.style.display = 'flex';
        els.navUsername.innerText = state.profile.username;
        els.userPoints.innerText = `${state.profile.points} pts`;
        if (state.profile.avatar_url) {
            els.navAvatar.src = state.profile.avatar_url;
            els.navAvatar.style.display = 'block';
            els.navInitials.style.display = 'none';
        }
    }
}

// Events
function setupListeners() {
    document.getElementById('view-market').onclick = () => setView('market');
    document.getElementById('view-portfolio').onclick = () => setView('portfolio');
    document.getElementById('view-leaderboard').onclick = () => setView('leaderboard');
    
    document.getElementById('btn-launch').onclick = () => els.modalLaunch.style.display = 'flex';
    document.getElementById('btn-settings').onclick = () => {
        if (state.profile) {
            document.getElementById('set-avatar').value = state.profile.avatar_url || '';
            document.getElementById('set-banner').value = state.profile.banner_url || '';
            els.modalSettings.style.display = 'flex';
        }
    };
    
    document.getElementById('btn-logout').onclick = async () => {
        await supabase.auth.signOut();
        window.location.href = 'auth.html';
    };

    document.querySelectorAll('.btn-close').forEach(b => {
        b.onclick = () => b.closest('.modal-overlay').style.display = 'none';
    });

    document.getElementById('form-settings').onsubmit = async (e) => {
        e.preventDefault();
        const updates = {
            avatar_url: document.getElementById('set-avatar').value,
            banner_url: document.getElementById('set-banner').value
        };
        const { error } = await supabase.from('profiles').update(updates).eq('id', state.user.id);
        if (!error) {
            els.modalSettings.style.display = 'none';
            await checkSession();
        }
    };

    els.marketBody.onclick = (e) => {
        const btn = e.target.closest('.btn-trade-trigger');
        if (btn) {
            const { id, name, price } = btn.dataset;
            document.getElementById('trade-title').innerText = `Invest in ${name}`;
            document.getElementById('trade-price').innerText = `${price} pts`;
            els.modalTrade.dataset.id = id;
            els.modalTrade.dataset.price = price;
            els.modalTrade.style.display = 'flex';
        }
    };

    document.getElementById('btn-confirm-trade').onclick = async () => {
        const id = els.modalTrade.dataset.id;
        const price = parseInt(els.modalTrade.dataset.price);
        const amount = parseInt(document.getElementById('trade-amount').value);
        const cost = price * amount;

        if (state.profile.points < cost) return alert("Insufficient points");

        const { error } = await supabase.from('profiles').update({ points: state.profile.points - cost }).eq('id', state.user.id);
        if (!error) {
            await supabase.from('transactions').insert([{ user_id: state.user.id, currency_id: id, type: 'buy', amount, price_at_time: price }]);
            els.modalTrade.style.display = 'none';
            await refreshData();
            await checkSession();
            alert("Success!");
        }
    };

    document.getElementById('form-launch').onsubmit = async (e) => {
        e.preventDefault();
        const t = {
            creator_id: state.user.id,
            name: document.getElementById('launch-name').value,
            symbol: document.getElementById('launch-symbol').value.toUpperCase(),
            current_price: 10
        };
        const { error } = await supabase.from('currencies').insert([t]);
        if (!error) { els.modalLaunch.style.display = 'none'; refreshData(); }
    };
}

function setView(v) {
    state.view = v;
    els.marketArea.style.display = v === 'market' ? 'block' : 'none';
    els.portfolioArea.style.display = v === 'portfolio' ? 'block' : 'none';
    els.leaderboardArea.style.display = v === 'leaderboard' ? 'block' : 'none';
    
    els.mainTitle.innerText = v.charAt(0).toUpperCase() + v.slice(1);
    document.querySelectorAll('.nav-link').forEach(l => l.classList.toggle('active', l.id === `view-${v}`));
}

function subscribe() {
    supabase.channel('any').on('postgres_changes', { event: '*', schema: 'public', table: 'currencies' }, refreshData).subscribe();
}

init();
