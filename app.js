import { supabase } from './supabase-client.js';

// Application State
let state = {
    user: null,
    profile: null,
    currencies: [],
    leaderboard: [],
    isSignUp: false,
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
    userProfilePill: document.getElementById('user-profile-pill'),
    navUsername: document.getElementById('nav-username'),
    navInitials: document.getElementById('nav-initials'),
    navAvatar: document.getElementById('nav-avatar'),
    userPointsDisplay: document.getElementById('user-points-display'),
    logoutLink: document.getElementById('logout-link'),
    mainTitle: document.getElementById('main-title'),
    mainSubtitle: document.getElementById('main-subtitle'),
    
    // Modals
    modalAuth: document.getElementById('modal-auth'),
    modalLaunch: document.getElementById('modal-launch'),
    modalTrade: document.getElementById('modal-trade'),
    modalSettings: document.getElementById('modal-settings'),
    
    // Forms
    formSettings: document.getElementById('form-settings'),
    
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

const toInternalEmail = (username) => `${username.toLowerCase()}@nozus.internal`;

async function checkUser() {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
        state.user = user;
        await fetchProfile(user.id);
        updateAuthUI();
        updateSettingsUI();
    }
}

async function fetchProfile(userId) {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (data) state.profile = data;
}

async function fetchCurrencies() {
    const { data } = await supabase.from('currencies').select('*').order('created_at', { ascending: false });
    if (data) {
        state.currencies = data;
        renderMarket();
        renderTrending();
        updateTicker();
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
        els.marketTableBody.innerHTML = '<tr><td colspan="4" class="text-center py-2 text-dim">No currencies yet. Launch one!</td></tr>';
        return;
    }
    els.marketTableBody.innerHTML = state.currencies.map(c => `
        <tr>
            <td><span class="symbol-tag">$${c.symbol}</span></td>
            <td>${c.name}</td>
            <td class="font-bold">${c.current_price} pts</td>
            <td>
                <button class="btn btn-primary btn-sm btn-trade-trigger" 
                    data-id="${c.id}" data-name="${c.name}" data-price="${c.current_price}">
                    Buy
                </button>
            </td>
        </tr>
    `).join('');
}

function renderLeaderboard() {
    if (!els.leaderboardTableBody) return;
    els.leaderboardTableBody.innerHTML = state.leaderboard.map((u, i) => `
        <tr>
            <td>#${i + 1}</td>
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
        els.trendingList.innerHTML = '<p class="text-dim text-sm">No tokens active.</p>';
        return;
    }
    els.trendingList.innerHTML = trending.map(c => `
        <div class="trending-item">
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
    } else {
        els.authSection.style.display = 'block';
        els.userProfilePill.style.display = 'none';
        els.logoutLink.style.display = 'none';
    }
}

function updateSettingsUI() {
    if (!state.profile) return;
    document.getElementById('settings-avatar').value = state.profile.avatar_url || '';
    document.getElementById('settings-banner').value = state.profile.banner_url || '';
    document.getElementById('settings-bio').value = state.profile.bio || '';
    
    document.getElementById('preview-username').innerText = state.profile.username;
    if (state.profile.avatar_url) document.getElementById('preview-avatar').src = state.profile.avatar_url;
    if (state.profile.banner_url) document.getElementById('preview-banner').style.backgroundImage = `url(${state.profile.banner_url})`;
}

// Events
function setupEventListeners() {
    document.getElementById('view-market-trigger').onclick = () => switchView('market');
    document.getElementById('view-portfolio-trigger').onclick = () => switchView('portfolio');
    document.getElementById('view-leaderboard-trigger').onclick = () => switchView('leaderboard');
    
    document.getElementById('btn-login-trigger').onclick = () => els.modalAuth.style.display = 'flex';
    document.getElementById('btn-launch-trigger').onclick = () => {
        if (!state.user) return els.modalAuth.style.display = 'flex';
        els.modalLaunch.style.display = 'flex';
    };
    document.getElementById('btn-settings-trigger').onclick = () => {
        if (!state.user) return els.modalAuth.style.display = 'flex';
        updateSettingsUI();
        els.modalSettings.style.display = 'flex';
    };

    document.querySelectorAll('.btn-close').forEach(btn => {
        btn.onclick = () => btn.closest('.modal-overlay').style.display = 'none';
    });

    els.formSettings.onsubmit = async (e) => {
        e.preventDefault();
        const updates = {
            avatar_url: document.getElementById('settings-avatar').value,
            banner_url: document.getElementById('settings-banner').value,
            bio: document.getElementById('settings-bio').value
        };
        const { error } = await supabase.from('profiles').update(updates).eq('id', state.user.id);
        if (error) alert(error.message);
        else {
            els.modalSettings.style.display = 'none';
            await checkUser();
        }
    };

    // Auth & Trade logic remains similar but updated for new UI
    document.getElementById('form-auth').onsubmit = async (e) => {
        e.preventDefault();
        const username = document.getElementById('auth-username').value;
        const password = document.getElementById('auth-password').value;
        const email = toInternalEmail(username);

        let res;
        if (state.isSignUp) {
            res = await supabase.auth.signUp({ email, password, options: { data: { username } } });
            if (!res.error) await supabase.from('profiles').insert([{ id: res.data.user.id, username, points: 1000 }]);
        } else {
            res = await supabase.auth.signInWithPassword({ email, password });
        }

        if (res.error) alert(res.error.message);
        else { els.modalAuth.style.display = 'none'; await checkUser(); }
    };

    document.getElementById('btn-toggle-auth').onclick = () => {
        state.isSignUp = !state.isSignUp;
        document.getElementById('auth-title').innerText = state.isSignUp ? 'Create Account' : 'Sign In to Nozus';
    };

    els.logoutLink.onclick = async () => {
        await supabase.auth.signOut();
        state.user = null;
        state.profile = null;
        updateAuthUI();
    };

    els.marketTableBody.onclick = (e) => {
        const btn = e.target.closest('.btn-trade-trigger');
        if (btn) {
            if (!state.user) return els.modalAuth.style.display = 'flex';
            const { id, price } = btn.dataset;
            els.modalTrade.dataset.currencyId = id;
            els.modalTrade.dataset.price = price;
            els.tradeMarketPrice.innerText = `${price} pts`;
            els.modalTrade.style.display = 'flex';
        }
    };

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
            alert('Bought!');
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
    };
}

function switchView(view) {
    state.currentView = view;
    els.marketView.style.display = view === 'market' ? 'block' : 'none';
    els.portfolioView.style.display = view === 'portfolio' ? 'block' : 'none';
    els.leaderboardView.style.display = view === 'leaderboard' ? 'block' : 'none';
    
    els.mainTitle.innerText = view === 'market' ? 'Market Summary' : view === 'portfolio' ? 'My Portfolio' : 'Leaderboard';
    els.mainSubtitle.innerText = view === 'leaderboard' ? 'Top ranked investors by points' : 'Track the performance of user-created currencies.';
    
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.toggle('active', link.id === `view-${view}-trigger`);
    });
}

function subscribeToUpdates() {
    supabase.channel('any').on('postgres_changes', { event: '*', schema: 'public', table: 'currencies' }, fetchCurrencies).subscribe();
    supabase.channel('any').on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, fetchLeaderboard).subscribe();
}

init();
