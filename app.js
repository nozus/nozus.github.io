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

// UI Mapping
const els = {
    marketView: document.getElementById('market-view'),
    portfolioView: document.getElementById('portfolio-view'),
    userDisplay: document.getElementById('user-display'),
    btnAuthTrigger: document.getElementById('btn-auth-trigger'),
    btnLaunchToken: document.getElementById('btn-launch-token'),
    displayUsername: document.getElementById('display-username'),
    displayPoints: document.getElementById('display-points'),
    userInitials: document.getElementById('user-initials'),
    modalAuth: document.getElementById('modal-auth'),
    modalLaunch: document.getElementById('modal-launch'),
    modalTrade: document.getElementById('modal-trade'),
    formAuth: document.getElementById('form-auth'),
    toggleAuth: document.getElementById('toggle-auth'),
    authTitle: document.getElementById('auth-title'),
    tradePrice: document.getElementById('trade-price'),
    tradeTotal: document.getElementById('trade-total'),
    tradeAmount: document.getElementById('trade-amount')
};

// Initialization
async function init() {
    setupEventListeners();
    await checkUser();
    await fetchCurrencies();
    subscribeToUpdates();
}

// Auth Helper: Convert username to internal email for Supabase
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
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
    
    if (data) {
        state.profile = data;
    } else {
        // Fallback or retry logic
        console.error("Profile not found for user", userId);
    }
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
    els.marketView.innerHTML = state.currencies.map(c => `
        <div class="stock-card animate-fade-in">
            <div class="header">
                <div class="token-icon">${c.symbol[0]}</div>
                <div class="text-right">
                    <div class="font-bold">$${c.symbol}</div>
                    <div class="text-sm text-accent">+0.0%</div>
                </div>
            </div>
            <h3>${c.name}</h3>
            <div class="price">${c.current_price} <span class="text-sm text-dim">pts</span></div>
            <div class="stats mb-2">
                <span>Supply: ${c.total_supply}</span>
            </div>
            <button class="btn btn-primary w-full justify-center btn-trade-trigger" 
                data-id="${c.id}" data-name="${c.name}" data-price="${c.current_price}">
                Trade
            </button>
        </div>
    `).join('');
}

function updateAuthUI() {
    if (state.user && state.profile) {
        els.btnAuthTrigger.style.display = 'none';
        els.userDisplay.style.display = 'block';
        els.btnLaunchToken.style.display = 'flex';
        els.displayUsername.innerText = state.profile.username;
        els.displayPoints.innerText = `${state.profile.points} pts`;
        els.userInitials.innerText = state.profile.username[0].toUpperCase();
    } else {
        els.btnAuthTrigger.style.display = 'block';
        els.userDisplay.style.display = 'none';
        els.btnLaunchToken.style.display = 'none';
    }
}

// Events
function setupEventListeners() {
    // Navigation
    document.getElementById('nav-market').onclick = () => switchView('market');
    document.getElementById('nav-portfolio').onclick = () => switchView('portfolio');

    // Modals
    els.btnAuthTrigger.onclick = () => els.modalAuth.style.display = 'flex';
    els.btnLaunchToken.onclick = () => els.modalLaunch.style.display = 'flex';
    
    document.querySelectorAll('.btn-close').forEach(b => {
        b.onclick = () => b.closest('.modal-overlay').style.display = 'none';
    });

    // Auth Toggle
    els.toggleAuth.onclick = () => {
        state.isSignUp = !state.isSignUp;
        els.authTitle.innerText = state.isSignUp ? 'Create Account' : 'Welcome Back';
        els.toggleAuth.innerText = state.isSignUp ? 'Already have an account? Login' : 'Need an account? Sign Up';
    };

    // Auth Submit
    els.formAuth.onsubmit = async (e) => {
        e.preventDefault();
        const username = document.getElementById('auth-username').value;
        const password = document.getElementById('auth-password').value;
        const email = toInternalEmail(username);

        let result;
        if (state.isSignUp) {
            result = await supabase.auth.signUp({ 
                email, 
                password,
                options: { data: { username } }
            });
            // Auto-create profile via trigger or manual insert
            if (!result.error) {
                await supabase.from('profiles').insert([{ id: result.data.user.id, username, points: 1000 }]);
                alert('Account created! Logging in...');
            }
        } else {
            result = await supabase.auth.signInWithPassword({ email, password });
        }

        if (result.error) alert(result.error.message);
        else {
            els.modalAuth.style.display = 'none';
            await checkUser();
        }
    };

    // Logout
    document.getElementById('btn-logout').onclick = async () => {
        await supabase.auth.signOut();
        state.user = null;
        state.profile = null;
        updateAuthUI();
    };

    // Launch Token
    document.getElementById('form-launch').onsubmit = async (e) => {
        e.preventDefault();
        const token = {
            creator_id: state.user.id,
            name: document.getElementById('launch-name').value,
            symbol: document.getElementById('launch-symbol').value.toUpperCase(),
            description: document.getElementById('launch-desc').value,
            current_price: 10
        };
        const { error } = await supabase.from('currencies').insert([token]);
        if (error) alert(error.message);
        else {
            els.modalLaunch.style.display = 'none';
            fetchCurrencies();
        }
    };

    // Trade Triggers
    els.marketView.onclick = (e) => {
        const btn = e.target.closest('.btn-trade-trigger');
        if (btn) {
            if (!state.user) return els.modalAuth.style.display = 'flex';
            const { id, name, price } = btn.dataset;
            els.modalTrade.dataset.currencyId = id;
            els.modalTrade.dataset.price = price;
            document.getElementById('trade-title').innerText = `Trade ${name}`;
            els.tradePrice.innerText = `${price} pts`;
            updateTradeTotal();
            els.modalTrade.style.display = 'flex';
        }
    };

    els.tradeAmount.oninput = updateTradeTotal;

    document.getElementById('btn-buy').onclick = () => handleTrade('buy');
    document.getElementById('btn-sell').onclick = () => handleTrade('sell');
}

function updateTradeTotal() {
    const price = parseInt(els.modalTrade.dataset.price);
    const amount = parseInt(els.tradeAmount.value) || 0;
    els.tradeTotal.innerText = `${price * amount} pts`;
}

async function handleTrade(type) {
    const id = els.modalTrade.dataset.currencyId;
    const price = parseInt(els.modalTrade.dataset.price);
    const amount = parseInt(els.tradeAmount.value);
    const total = price * amount;

    if (type === 'buy' && state.profile.points < total) return alert('Insufficient points');

    // In a real app, use an RPC for atomic transactions
    const newPoints = type === 'buy' ? state.profile.points - total : state.profile.points + total;
    
    const { error } = await supabase.from('profiles').update({ points: newPoints }).eq('id', state.user.id);
    if (error) return alert(error.message);

    await supabase.from('transactions').insert([{
        user_id: state.user.id,
        currency_id: id,
        type: type,
        amount: amount,
        price_at_time: price
    }]);

    els.modalTrade.style.display = 'none';
    await checkUser();
    alert(`Successfully ${type === 'buy' ? 'bought' : 'sold'} ${amount} shares!`);
}

function switchView(view) {
    state.currentView = view;
    document.getElementById('view-title').innerText = view.charAt(0).toUpperCase() + view.slice(1);
    els.marketView.style.display = view === 'market' ? 'grid' : 'none';
    els.portfolioView.style.display = view === 'portfolio' ? 'grid' : 'none';
    
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.id === `nav-${view}`);
    });
}

function subscribeToUpdates() {
    supabase.channel('any').on('postgres_changes', { event: '*', schema: 'public', table: 'currencies' }, fetchCurrencies).subscribe();
}

init();
