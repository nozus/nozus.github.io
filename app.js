import { supabase } from './supabase-client.js';

// Application State
let state = {
    user: null,
    profile: null,
    currencies: [],
    investments: []
};

// UI Elements
const els = {
    marketGrid: document.getElementById('market-grid'),
    userInfo: document.getElementById('user-info'),
    navActions: document.getElementById('nav-actions'),
    btnLogin: document.getElementById('btn-login'),
    btnCreate: document.getElementById('btn-create'),
    userPoints: document.getElementById('user-points'),
    modalAuth: document.getElementById('modal-auth'),
    modalCreate: document.getElementById('modal-create'),
    modalTrade: document.getElementById('modal-trade'),
    formAuth: document.getElementById('form-auth'),
    formCreate: document.getElementById('form-create')
};

// Initialization
async function init() {
    setupEventListeners();
    await checkUser();
    await fetchCurrencies();
    subscribeToUpdates();
}

// Auth Logic
async function checkUser() {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
        state.user = user;
        await fetchProfile(user.id);
        updateUI();
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
        // Create profile if it doesn't exist
        const { data: newProfile } = await supabase
            .from('profiles')
            .insert([{ id: userId, username: state.user.email.split('@')[0], points: 1000 }])
            .select()
            .single();
        state.profile = newProfile;
    }
}

// Data Fetching
async function fetchCurrencies() {
    const { data, error } = await supabase
        .from('currencies')
        .select('*')
        .order('created_at', { ascending: false });
    
    if (data) {
        state.currencies = data;
        renderMarket();
    }
}

function renderMarket() {
    els.marketGrid.innerHTML = state.currencies.map(c => `
        <div class="glass-card stock-card animate-fade-in">
            <div class="flex justify-between align-start">
                <div>
                    <span class="symbol">$${c.symbol}</span>
                    <h3>${c.name}</h3>
                </div>
                <div class="trend-up font-bold">+0.00%</div>
            </div>
            <div class="price">${c.current_price} <span class="text-sm text-muted">pts</span></div>
            <p class="text-sm text-muted mb-1">${c.description || 'No description available.'}</p>
            <button class="btn btn-primary w-full btn-trade" data-id="${c.id}" data-name="${c.name}" data-price="${c.current_price}">
                Invest Now
            </button>
        </div>
    `).join('');

    // Re-initialize icons in cards if needed
    if (window.lucide) lucide.createIcons();
}

// Real-time Subscriptions
function subscribeToUpdates() {
    supabase
        .channel('public:currencies')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'currencies' }, payload => {
            console.log('Change received!', payload);
            fetchCurrencies(); // Refresh for now, can optimize later
        })
        .subscribe();
}

// UI Interactions
function updateUI() {
    if (state.user && state.profile) {
        els.btnLogin.style.display = 'none';
        els.userInfo.style.display = 'flex';
        els.userPoints.innerHTML = `<i data-lucide="coins"></i> ${state.profile.points} pts`;
        if (window.lucide) lucide.createIcons();
    }
}

function setupEventListeners() {
    els.btnLogin.onclick = () => els.modalAuth.style.display = 'flex';
    els.btnCreate.onclick = () => els.modalCreate.style.display = 'flex';
    
    document.querySelectorAll('.btn-close').forEach(btn => {
        btn.onclick = (e) => {
            e.target.closest('.modal-overlay').style.display = 'none';
        };
    });

    els.formAuth.onsubmit = async (e) => {
        e.preventDefault();
        const email = document.getElementById('auth-email').value;
        const password = document.getElementById('auth-password').value;
        
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        
        if (error) {
            // If sign in fails, try sign up (simple demo flow)
            const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password });
            if (signUpError) alert(signUpError.message);
            else alert('Check your email for confirmation!');
        } else {
            els.modalAuth.style.display = 'none';
            checkUser();
        }
    };

    els.formCreate.onsubmit = async (e) => {
        e.preventDefault();
        if (!state.user) return alert('Please sign in first');

        const tokenData = {
            creator_id: state.user.id,
            name: document.getElementById('token-name').value,
            symbol: document.getElementById('token-symbol').value.toUpperCase(),
            description: document.getElementById('token-desc').value,
            initial_price: 10,
            current_price: 10
        };

        const { error } = await supabase.from('currencies').insert([tokenData]);
        if (error) alert(error.message);
        else {
            els.modalCreate.style.display = 'none';
            els.formCreate.reset();
        }
    };

    els.marketGrid.onclick = (e) => {
        const tradeBtn = e.target.closest('.btn-trade');
        if (tradeBtn) {
            const { id, name, price } = tradeBtn.dataset;
            document.getElementById('trade-token-name').innerText = `Invest in ${name}`;
            document.getElementById('trade-current-price').innerText = `${price} pts`;
            els.modalTrade.dataset.currencyId = id;
            els.modalTrade.dataset.price = price;
            els.modalTrade.style.display = 'flex';
        }
    };

    document.getElementById('btn-confirm-trade').onclick = async () => {
        if (!state.user) return alert('Please sign in first');
        
        const currencyId = els.modalTrade.dataset.currencyId;
        const price = parseInt(els.modalTrade.dataset.price);
        const amount = parseInt(document.getElementById('trade-amount').value);
        const totalCost = price * amount;

        if (state.profile.points < totalCost) return alert('Insufficient points!');

        // Start transaction (simplified for demo)
        // 1. Deduct points
        const { error: pError } = await supabase
            .from('profiles')
            .update({ points: state.profile.points - totalCost })
            .eq('id', state.user.id);

        if (pError) return alert(pError.message);

        // 2. Create investment record (simplified upsert logic)
        // In a real app, this should be an RPC to ensure atomicity
        const { error: iError } = await supabase
            .from('transactions')
            .insert([{
                user_id: state.user.id,
                currency_id: currencyId,
                type: 'buy',
                amount: amount,
                price_at_time: price
            }]);

        if (iError) alert('Logged transaction, but portfolio update requires backend triggers.');
        
        els.modalTrade.style.display = 'none';
        await checkUser(); // Refresh points
    };
}

init();
