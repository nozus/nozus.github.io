// ============================
// NOZUS ICON SYSTEM
// Brawl Stars-style collectible player icons
// ============================

export const ICONS = {
    'nozus_default': { name: 'nozus. OG', rarity: 'common', bg: 'linear-gradient(135deg, #6366f1, #818cf8)', symbol: 'n.', color: '#fff', free: true },
    'chart_up': { name: 'Chart Master', rarity: 'common', bg: 'linear-gradient(135deg, #10b981, #34d399)', symbol: '📈', color: '#fff', free: true },
    'midnight': { name: 'Midnight', rarity: 'common', bg: 'linear-gradient(135deg, #1e293b, #334155)', symbol: '🌙', color: '#fff', free: true },
    'sunset': { name: 'Sunset', rarity: 'common', bg: 'linear-gradient(135deg, #f97316, #fbbf24)', symbol: '🌅', color: '#fff', free: true },
    'fire_trader': { name: 'Fire Trader', rarity: 'rare', bg: 'linear-gradient(135deg, #ef4444, #f97316)', symbol: '🔥', color: '#fff', free: false },
    'ice_cold': { name: 'Ice Cold', rarity: 'rare', bg: 'linear-gradient(135deg, #06b6d4, #67e8f9)', symbol: '❄️', color: '#fff', free: false },
    'toxic': { name: 'Toxic', rarity: 'rare', bg: 'linear-gradient(135deg, #22c55e, #a3e635)', symbol: '☢️', color: '#fff', free: false },
    'diamond_hands': { name: 'Diamond Hands', rarity: 'epic', bg: 'linear-gradient(135deg, #3b82f6, #6366f1)', symbol: '💎', color: '#fff', free: false },
    'phantom': { name: 'Phantom', rarity: 'epic', bg: 'linear-gradient(135deg, #7c3aed, #a855f7)', symbol: '👻', color: '#fff', free: false },
    'golden_bull': { name: 'Golden Bull', rarity: 'legendary', bg: 'linear-gradient(135deg, #f59e0b, #fbbf24)', symbol: '🐂', color: '#fff', free: false },
    'nozus_elite': { name: 'nozus. Elite', rarity: 'legendary', bg: 'linear-gradient(135deg, #ec4899, #f59e0b)', symbol: 'n.', color: '#fff', free: false },
    'void': { name: 'Void', rarity: 'legendary', bg: 'linear-gradient(135deg, #0f172a, #7c3aed)', symbol: '🕳️', color: '#fff', free: false },
};

export const RARITY_COLORS = {
    common: '#94a3b8',
    rare: '#3b82f6',
    epic: '#a855f7',
    legendary: '#f59e0b'
};

export const RARITY_LABELS = {
    common: 'Common',
    rare: 'Rare',
    epic: 'Epic',
    legendary: 'Legendary'
};

/**
 * Render an icon element as HTML string.
 * @param {string} iconId - Key from ICONS
 * @param {number} size - Pixel size (square)
 * @param {boolean} locked - Show lock overlay
 */
export function renderIcon(iconId, size = 48, locked = false) {
    const icon = ICONS[iconId] || ICONS['nozus_default'];
    const r = RARITY_COLORS[icon.rarity] || RARITY_COLORS.common;
    const isText = !icon.symbol.match(/[\u{1F000}-\u{1FFFF}]/u) && icon.symbol.length <= 3;
    const fontSize = isText ? (size * 0.4) + 'px' : (size * 0.45) + 'px';
    const fontWeight = isText ? '800' : '400';
    const fontFamily = isText ? "'JetBrains Mono', monospace" : 'inherit';

    return `<div class="player-icon rarity-${icon.rarity}" style="
        width:${size}px; height:${size}px; background:${icon.bg};
        border-color:${r}; font-size:${fontSize}; font-weight:${fontWeight};
        font-family:${fontFamily}; color:${icon.color};
    ">${icon.symbol}${locked ? '<div class="icon-lock">🔒</div>' : ''}</div>`;
}
