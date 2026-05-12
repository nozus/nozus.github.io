// ============================
// NOZUS ICON SYSTEM
// simplified minimalist icons
// ============================

export const ICONS = {
    'nozus_default': { name: 'nozus.', rarity: 'common', bg: '#000', symbol: 'n.', color: '#fff', free: true },
    'chart_up': { name: 'chart master', rarity: 'common', bg: '#fff', symbol: '📈', color: '#000', free: true },
    'midnight': { name: 'midnight', rarity: 'common', bg: '#000', symbol: '🌙', color: '#fff', free: true },
    'sunset': { name: 'sunset', rarity: 'common', bg: '#fff', symbol: '🌅', color: '#000', free: true },
    'fire_trader': { name: 'fire trader', rarity: 'rare', bg: '#000', symbol: '🔥', color: '#fff', free: false },
    'ice_cold': { name: 'ice cold', rarity: 'rare', bg: '#fff', symbol: '❄️', color: '#000', free: false },
    'toxic': { name: 'toxic', rarity: 'rare', bg: '#000', symbol: '☢️', color: '#fff', free: false },
    'diamond_hands': { name: 'diamond hands', rarity: 'epic', bg: '#000', symbol: '💎', color: '#fff', free: false },
    'phantom': { name: 'phantom', rarity: 'epic', bg: '#fff', symbol: '👻', color: '#000', free: false },
    'golden_bull': { name: 'golden bull', rarity: 'legendary', bg: '#fff', symbol: '🐂', color: '#000', free: false },
    'nozus_elite': { name: 'nozus. elite', rarity: 'legendary', bg: '#000', symbol: 'n.', color: '#fff', free: false },
    'void': { name: 'void', rarity: 'legendary', bg: '#000', symbol: '🕳️', color: '#fff', free: false },
};

export const RARITY_COLORS = {
    common: '#000000',
    rare: '#000000',
    epic: '#000000',
    legendary: '#000000'
};

export const RARITY_LABELS = {
    common: 'common',
    rare: 'rare',
    epic: 'epic',
    legendary: 'legendary'
};

/**
 * Render an icon element as HTML string.
 */
export function renderIcon(iconId, size = 48, locked = false) {
    const icon = ICONS[iconId] || ICONS['nozus_default'];
    const isText = !icon.symbol.match(/[\u{1F000}-\u{1FFFF}]/u) && icon.symbol.length <= 3;
    const fontSize = isText ? (size * 0.5) + 'px' : (size * 0.4) + 'px';

    return `<div class="player-icon" style="width:${size}px; height:${size}px; background:${icon.bg}; font-size:${fontSize}; color:${icon.color};">
        ${icon.symbol}
        ${locked ? '<div class="icon-lock">🔒</div>' : ''}
    </div>`;
}
