import { supabase } from './supabase-client.js';

// Application State
let state = {
    user: null,
    profile: null,
    currencies: [],
    investments: [],
    isSignUp: false,
    currentView: 'market'
};

// UI Elements
const els = {
    marketTableBody: document.getElementById('market-table-body'),
    portfolioTableBody: document.getElementById('portfolio-table-body'),
    marketView: document.getElementById('market-view'),
    portfolioView: document.getElementById('portfolio-view'),
    authSection: document.getElementById('auth-section'),
    userProfilePill: document.getElementById('user-profile-pill'),
    navUsername: document.getElementById('nav-username'),
    navInitials: document.getElementById('nav-initials'),
    userPointsDisplay: document.getElementById('user-points-display'),
    logoutLink: document.getElementById('logout-link'),
    mainTitle: document.getElementById('main-title'),
    
    // Modals
    modalAuth: document.getElementById('modal-auth'),
    modalLaunch: document.getElementById('modal-launch'),
    modalTrade: document.getElementById('modal-trade'),
    
    // Trade Modal info
    tradeMarketPrice: document.getElementById('trade-market-price'),
    tradeEstimatedTotal: document.getElementById('trade-estimated-total'),
    tradeShares: document.getElementById('trade-shares')
};

// Initialization
async function init() {
    setupEventListeners();
    await checkUser();
    await fetchCurrencies();
    updateTicker();
    subscribeToUpdates();
}

// Auth Helper
const toInternalEmail = (username) => `${username.toLowerCase()}@nozus.internal`;

async function checkUser() {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
        state.user = user;
        await fetchProfile(user.id);
        updateAuthUI();
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
    }
}

// Rendering
function renderMarket() {
    if (!els.marketTableBody) return;
    
    els.marketTableBody.innerHTML = state.currencies.map(c => `
        <tr>
            <td><span class="symbol-tag">$${c.symbol}</span></td>
            <td>${c.name}</td>
            <td class="font-bold">${c.current_price} pts</td>
            <td><span class="trend-up">+0.00%</span></td>
            <td>${Math.floor(Math.random() * 1000)}k</td>
            <td>
                <button class="btn btn-primary btn-sm btn-trade-trigger" 
                    data-id="${c.id}" data-name="${c.name}" data-price="${c.current_price}">
                    Buy
                </button>
            </td>
        </tr>
    `).join('');
}

function updateAuthUI() {
    if (state.user && state.profile) {
        els.authSection.style.display = 'none';
        els.userProfilePill.style.display = 'flex';
        els.logoutLink.style.display = 'flex';
        els.navUsername.innerText = state.profile.username;
        els.navInitials.innerText = state.profile.username[0].toUpperCase();
        els.userPointsDisplay.innerText = `${state.profile.points} pts`;
    } else {
        els.authSection.style.display = 'block';
        els.userProfilePill.style.display = 'none';
        els.logoutLink.style.display = 'none';
    }
}

// Ticker Logic
function updateTicker() {
    const tickerContainer = document.getElementById('ticker-data');
    if (!tickerContainer) return;

    const tickerItems = state.currencies.slice(0, 5).map(c => `
        <div class="ticker-item"><span>$${c.symbol}</span> <span class="trend-up">${c.current_price} (+0.0%)</span></div>
    `).join('');
    
    tickerContainer.innerHTML = tickerItems + tickerItems; // Double for scroll effect
}

// Event Listeners
function setupEventListeners() {
    // Navigation
    document.getElementById('view-market-trigger').onclick = () => switchView('market');
    document.getElementById('view-portfolio-trigger').onclick = () => switchView('portfolio');
    
    // Modal Triggers
    document.getElementById('btn-login-trigger').onclick = () => els.modalAuth.style.display = 'flex';
    document.getElementById('btn-launch-trigger').onclick = () => {
        if (!state.user) return els.modalAuth.style.display = 'flex';
        els.modalLaunch.style.display = 'flex';
    };

    document.querySelectorAll('.btn-close').forEach(btn => {
        btn.onclick = () => btn.closest('.modal-overlay').style.display = 'none';
    });

    // Auth Submit
    document.getElementById('form-auth').onsubmit = async (e) => {
        e.preventDefault();
        const username = document.getElementById('auth-username').value;
        const password = document.getElementById('auth-password').value;
        const email = toInternalEmail(username);

        let res;
        if (state.isSignUp) {
            res = await supabase.auth.signUp({ email, password, options: { data: { username } } });
            if (!res.error) {
                await supabase.from('profiles').insert([{ id: res.data.user.id, username, points: 1000 }]);
            }
        } else {
            res = await supabase.auth.signInWithPassword({ email, password });
        }

        if (res.error) alert(res.error.message);
        else {
            els.modalAuth.style.display = 'none';
            await checkUser();
        }
    };

    document.getElementById('btn-toggle-auth').onclick = () => {
        state.isSignUp = !state.isSignUp;
        document.getElementById('auth-title').innerText = state.isSignUp ? 'Create Account' : 'Sign In to Nozus';
        document.getElementById('btn-toggle-auth').innerText = state.isSignUp ? 'Already have an account?' : 'Create an account';
    };

    els.logoutLink.onclick = async () => {
        await supabase.auth.signOut();
        state.user = null;
        state.profile = null;
        updateAuthUI();
    };

    // Trading
    els.marketTableBody.onclick = (e) => {
        const btn = e.target.closest('.btn-trade-trigger');
        if (btn) {
            if (!state.user) return els.modalAuth.style.display = 'flex';
            const { id, name, price } = btn.dataset;
            els.modalTrade.dataset.currencyId = id;
            els.modalTrade.dataset.price = price;
            document.getElementById('trade-title').innerText = `Buy ${name}`;
            els.tradeMarketPrice.innerText = `${price} pts`;
            updateTradeEstimated();
            els.modalTrade.style.display = 'flex';
        }
    };

    els.tradeShares.oninput = updateTradeEstimated;

    document.getElementById('btn-confirm-trade').onclick = handleTrade;
}

function updateTradeEstimated() {
    const price = parseInt(els.modalTrade.dataset.price) || 0;
    const shares = parseInt(els.tradeShares.value) || 0;
    els.tradeEstimatedTotal.innerText = `${price * shares} pts`;
}

async function handleTrade() {
    const id = els.modalTrade.dataset.currencyId;
    const price = parseInt(els.modalTrade.dataset.price);
    const shares = parseInt(els.tradeShares.value);
    const total = price * shares;

    if (state.profile.points < total) return alert('Insufficient points');

    const { error: pError } = await supabase.from('profiles')
        .update({ points: state.profile.points - total })
        .eq('id', state.user.id);

    if (pError) return alert(pError.message);

    await supabase.from('transactions').insert([{
        user_id: state.user.id,
        currency_id: id,
        type: 'buy',
        amount: shares,
        price_at_time: price
    }]);

    els.modalTrade.style.display = 'none';
    await checkUser();
    alert('Transaction successful!');
}

function switchView(view) {
    state.currentView = view;
    els.mainTitle.innerText = view === 'market' ? 'Market Summary' : 'My Portfolio';
    els.marketView.style.display = view === 'market' ? 'block' : 'none';
    els.portfolioView.style.display = view === 'portfolio' ? 'block' : 'none';
    
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.toggle('active', link.id === `view-${view}-trigger`);
    });
}

function subscribeToUpdates() {
    supabase.channel('public:currencies').on('postgres_changes', { event: '*', schema: 'public', table: 'currencies' }, () => {
        fetchCurrencies();
        updateTicker();
    }).subscribe();
}

init();
