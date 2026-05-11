import { supabase } from './supabase-client.js';

// Application State
let state = {
    user: null,
    profile: null,
    currencies: [],
    leaderboard: [],
    currentView: 'market'
};

// UI Mapping
const els = {
    marketTableBody: document.getElementById('market-table-body'),
    portfolioTableBody: document.getElementById('portfolio-table-body'),
    leaderboardTableBody: document.getElementById('leaderboard-table-body'),
    trendingList: document.getElementById('trending-list'),
    marketView: document.getElementById('market-view'),
    portfolioView: document.getElementById('portfolio-view'),
    leaderboardView: document.getElementById('leaderboard-view'),
    authSection: document.getElementById('auth-section'),
    balancePanel: document.getElementById('balance-panel'),
    userProfilePill: document.getElementById('user-profile-pill'),
    navUsername: document.getElementById('nav-username'),
    navAvatar: document.getElementById('nav-avatar'),
    navInitials: document.getElementById('nav-initials'),
    userPointsDisplay: document.getElementById('user-points-display'),
    logoutLink: document.getElementById('logout-link'),
    mainTitle: document.getElementById('main-title'),
    mainSubtitle: document.getElementById('main-subtitle'),
    
    // Modals
    modalLaunch: document.getElementById('modal-launch'),
    modalTrade: document.getElementById('modal-trade'),
    modalSettings: document.getElementById('modal-settings'),
    
    // Trade Modal
    tradeMarketPrice: document.getElementById('trade-market-price'),
    tradeShares: document.getElementById('trade-shares')
};

// Initialization
async function init() {
    setupEventListeners();
    await checkUser();
    await fetchCurrencies();
    await fetchLeaderboard();
    subscribeToUpdates();
}

async function checkUser() {
    try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) throw error;
        
        if (user) {
            state.user = user;
            await fetchProfile(user.id);
            updateAuthUI();
        }
    } catch (err) {
        console.error("Auth check failed:", err.message);
    }
}

async function fetchProfile(userId) {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (data) state.profile = data;
}

async function fetchCurrencies() {
    try {
        const { data, error } = await supabase.from('currencies').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        if (data) {
            state.currencies = data;
            renderMarket();
            renderTrending();
            updateTicker();
        }
    } catch (err) {
        console.error("Failed to fetch currencies:", err.message);
        if (els.marketTableBody) els.marketTableBody.innerHTML = `<tr><td colspan="4" class="text-center py-2 text-accent-red">Error: ${err.message}. Check your Supabase config.</td></tr>`;
    }
}

async function fetchLeaderboard() {
    const { data } = await supabase.from('profiles').select('username, points, avatar_url').order('points', { ascending: false }).limit(10);
    if (data) {
        state.leaderboard = data;
        renderLeaderboard();
    }
}

// Rendering
function renderMarket() {
    if (!els.marketTableBody) return;
    if (state.currencies.length === 0) {
        els.marketTableBody.innerHTML = '<tr><td colspan="4" class="text-center py-2 text-dim">No tokens active. Be the first!</td></tr>';
        return;
    }
    els.marketTableBody.innerHTML = state.currencies.map(c => `
        <tr>
            <td><span class="symbol-tag">$${c.symbol}</span></td>
            <td>${c.name}</td>
            <td class="font-bold">${c.current_price} pts</td>
            <td>
                <button class="btn btn-secondary btn-sm btn-trade-trigger" 
                    data-id="${c.id}" data-name="${c.name}" data-price="${c.current_price}">
                    Trade
                </button>
            </td>
        </tr>
    `).join('');
}

function renderLeaderboard() {
    if (!els.leaderboardTableBody) return;
    els.leaderboardTableBody.innerHTML = state.leaderboard.map((u, i) => `
        <tr>
            <td><span class="font-bold">#${i + 1}</span></td>
            <td>
                <div class="flex align-center gap-1">
                    ${u.avatar_url ? `<img src="${u.avatar_url}" style="width: 24px; height: 24px; border-radius: 50%;">` : `<div class="avatar" style="width: 24px; height: 24px; font-size: 10px;">${u.username[0].toUpperCase()}</div>`}
                    <span>${u.username}</span>
                </div>
            </td>
            <td class="font-bold">${u.points} pts</td>
        </tr>
    `).join('');
}

function renderTrending() {
    if (!els.trendingList) return;
    const trending = state.currencies.slice(0, 3);
    if (trending.length === 0) {
        els.trendingList.innerHTML = '<p class="text-dim text-sm">Nothing trending.</p>';
        return;
    }
    els.trendingList.innerHTML = trending.map(c => `
        <div class="flex justify-between align-center py-1" style="border-bottom: 1px solid var(--border-light);">
            <div class="flex align-center gap-1">
                <span class="symbol-tag">$${c.symbol}</span>
                <span class="text-sm">${c.name}</span>
            </div>
            <span class="trend-up">+0.0%</span>
        </div>
    `).join('');
}

function updateTicker() {
    const tickerContainer = document.getElementById('ticker-data');
    if (!tickerContainer || state.currencies.length === 0) return;
    const items = state.currencies.slice(0, 5).map(c => `
        <div class="ticker-item"><span>$${c.symbol}</span> <span class="trend-up">${c.current_price} (+0.0%)</span></div>
    `).join('');
    tickerContainer.innerHTML = items + items;
}

function updateAuthUI() {
    if (state.user && state.profile) {
        els.authSection.style.display = 'none';
        els.balancePanel.style.display = 'block';
        els.userProfilePill.style.display = 'flex';
        els.logoutLink.style.display = 'flex';
        els.navUsername.innerText = state.profile.username;
        els.userPointsDisplay.innerText = `${state.profile.points} pts`;
        
        if (state.profile.avatar_url) {
            els.navAvatar.src = state.profile.avatar_url;
            els.navAvatar.style.display = 'block';
            els.navInitials.style.display = 'none';
        } else {
            els.navAvatar.style.display = 'none';
            els.navInitials.style.display = 'flex';
            els.navInitials.innerText = state.profile.username[0].toUpperCase();
        }
    }
}

// Redirection helper
function requireAuth() {
    if (!state.user) {
        window.location.href = 'auth.html';
        return false;
    }
    return true;
}

// Events
function setupEventListeners() {
    document.getElementById('view-market-trigger').onclick = () => switchView('market');
    document.getElementById('view-portfolio-trigger').onclick = () => switchView('portfolio');
    document.getElementById('view-leaderboard-trigger').onclick = () => switchView('leaderboard');
    
    document.getElementById('btn-launch-trigger').onclick = () => {
        if (requireAuth()) els.modalLaunch.style.display = 'flex';
    };
    
    document.getElementById('btn-settings-trigger').onclick = () => {
        if (requireAuth()) {
            document.getElementById('settings-avatar').value = state.profile.avatar_url || '';
            document.getElementById('settings-banner').value = state.profile.banner_url || '';
            document.getElementById('settings-bio').value = state.profile.bio || '';
            els.modalSettings.style.display = 'flex';
        }
    };

    document.querySelectorAll('.btn-close').forEach(btn => {
        btn.onclick = () => btn.closest('.modal-overlay').style.display = 'none';
    });

    document.getElementById('form-settings').onsubmit = async (e) => {
        e.preventDefault();
        const updates = {
            avatar_url: document.getElementById('settings-avatar').value,
            banner_url: document.getElementById('settings-banner').value,
            bio: document.getElementById('settings-bio').value
        };
        const { error } = await supabase.from('profiles').update(updates).eq('id', state.user.id);
        if (!error) { els.modalSettings.style.display = 'none'; await checkUser(); }
    };

    els.logoutLink.onclick = async () => {
        await supabase.auth.signOut();
        window.location.reload();
    };

    // Trade Triggers
    if (els.marketTableBody) {
        els.marketTableBody.onclick = (e) => {
            const btn = e.target.closest('.btn-trade-trigger');
            if (btn) {
                if (requireAuth()) {
                    const { id, name, price } = btn.dataset;
                    els.modalTrade.dataset.currencyId = id;
                    els.modalTrade.dataset.price = price;
                    document.getElementById('trade-title').innerText = `Invest in ${name}`;
                    els.tradeMarketPrice.innerText = `${price} pts`;
                    els.modalTrade.style.display = 'flex';
                }
            }
        };
    }

    document.getElementById('btn-confirm-trade').onclick = async () => {
        const id = els.modalTrade.dataset.currencyId;
        const price = parseInt(els.modalTrade.dataset.price);
        const shares = parseInt(els.tradeShares.value);
        const total = price * shares;
        
        if (state.profile.points < total) return alert('Insufficient points');

        const { error } = await supabase.from('profiles').update({ points: state.profile.points - total }).eq('id', state.user.id);
        if (!error) {
            await supabase.from('transactions').insert([{ user_id: state.user.id, currency_id: id, type: 'buy', amount: shares, price_at_time: price }]);
            els.modalTrade.style.display = 'none';
            await checkUser();
            alert('Investment successful!');
        }
    };

    document.getElementById('form-launch').onsubmit = async (e) => {
        e.preventDefault();
        const token = {
            creator_id: state.user.id,
            name: document.getElementById('launch-name').value,
            symbol: document.getElementById('launch-symbol').value.toUpperCase(),
            current_price: 10
        };
        const { error } = await supabase.from('currencies').insert([token]);
        if (!error) { els.modalLaunch.style.display = 'none'; await fetchCurrencies(); }
        else alert(error.message);
    };
}

function switchView(view) {
    state.currentView = view;
    els.marketView.style.display = view === 'market' ? 'block' : 'none';
    els.portfolioView.style.display = view === 'portfolio' ? 'block' : 'none';
    els.leaderboardView.style.display = view === 'leaderboard' ? 'block' : 'none';
    els.mainTitle.innerText = view === 'market' ? 'Market Summary' : view === 'portfolio' ? 'My Portfolio' : 'Global Leaderboard';
    
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.toggle('active', link.id === `view-${view}-trigger`);
    });
}

function subscribeToUpdates() {
    supabase.channel('public:currencies').on('postgres_changes', { event: '*', schema: 'public', table: 'currencies' }, fetchCurrencies).subscribe();
}

init();
