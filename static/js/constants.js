// CSS классы
const CSS_CLASSES = {
    POSITIVE: 'positive',
    NEGATIVE: 'negative',
    HIGH_PNL: 'high-pnl',
    HIGH_ROI: 'high-roi',
    HIGH_LOSS: 'high-loss'
};

// API эндпоинты
const API_ENDPOINTS = {
    GET_POSITIONS: '/get_positions',
    GET_CLOSED_PNL: '/get_closed_pnl',
    GET_SYMBOL_CHART: '/get_symbol_chart'
};

// DOM элементы
const DOM_IDS = {
    UPDATE_TIME: 'update-time',
    GROWTH_MULTIPLIER: 'growth-multiplier',
    RAPID_GROWTH_CONTAINER: 'rapid-growth-container',
    RAPID_GROWTH_POSITIONS: 'rapid-growth-positions',
    PNL_FILTER_INPUT: 'pnl-filter-input',
    PNL_CHART: 'pnlChart',
    CLOSED_PNL_CONTAINER: 'closedPnlContainer'
};

// Конфигурация блоков позиций
const POSITION_BLOCKS = {
    HIGH_PROFITABLE: {
        id: 'high-profitable-positions',
        sortId: 'sort-high-profitable-positions'
    },
    PROFITABLE: {
        id: 'profitable-positions',
        sortId: 'sort-profitable-positions'
    },
    LOSING: {
        id: 'losing-positions',
        sortId: 'sort-losing-positions'
    }
};