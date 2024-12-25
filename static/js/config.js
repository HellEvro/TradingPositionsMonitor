// Добавляем в начало файла config.js
const TRANSLATIONS = {
    ru: {
        theme: '🌓 Сменить тему',
        reduceLoad: 'Снизить нагрузку',
        positions: 'Позиции',
        closedPnl: 'Закрытые PNL',
        searchPlaceholder: 'Поиск тикера...',
        statistics: 'Статистика',
        totalPnl: 'Общая прибыль + убыток',
        profit: 'Прибыль по позициям',
        loss: 'Убыток по позициям',
        totalTrades: 'Всего сделок',
        highProfitableTrades: '- высокоприбыльных сделок',
        profitableTrades: '- прибыльных сделок',
        losingTrades: '- убыточных сделок',
        topProfitable: 'TOP-3 Прибыльных',
        topLosing: 'TOP-3 Убыточных',
        rapidGrowth: 'Быстрорастущие позиции',
        clear: 'Очистить',
        noPositions: 'Нет позиций',
        noMatches: 'Нет совпадений',
        closedPositions: 'Закрытые позиции',
        showPerPage: 'Показывать по',
        contracts: 'Контракты',
        quantity: 'Кол-во',
        entryPrice: 'Цена входа',
        exitPrice: 'Цена выхода',
        realizedPnl: 'Реализ. P&L',
        tradingTime: 'Время торговли',
        sortNew: 'От нового к старому',
        sortPnl: 'По размеру PNL',
        prevPage: '< Назад',
        nextPage: 'Вперед >',
        page: 'Страница',
        from: 'с',
        to: 'до',
        losingPositions: 'Убыточные позиции',
        switchExchange: 'Переключение биржи',
        confirmSwitch: 'Вы уверены, что хотите переключиться на',
        yes: 'Да',
        no: 'Нет',
        switchedTo: 'Переключено на {exchange}',
        switchError: 'Ошибка при переключении биржи',
        disabled: 'отключено',
        close_positions_confirm_title: 'Подтверждение закрытия позиций',
        close_positions_confirm_text: 'Вы действительно хотите закрыть {count} позиций?',
        position_type_high_profitable: 'Высокоприбыльные',
        position_type_profitable: 'Прибыльные',
        position_type_losing: 'Убыточные',
        positions_count: 'Количество позиций',
        position_type: 'Тип позиций',
        'SWITCHED_TO_EXCHANGE': 'Переключение на биржу {exchangeName}',
        'switchError': 'Ошибка при переключении биржи',
        menu: 'Меню',
        'sort_pnl_desc': 'PNL (макс-мин)',
        'sort_pnl_asc': 'PNL (мин-макс)',
        'sort_roi_desc': 'ROI (макс-мин)',
        'sort_roi_asc': 'ROI (мин-макс)',
        'sort_alphabet_asc': 'A-Z',
        'sort_alphabet_desc': 'Z-A',
        'trading': 'Торговля',
        'availablePairs': 'Доступные пары',
        'noAvailablePairs': 'Нет доступных пар',
        close_positions_menu_title: 'Закрытие позиций',
        close_positions_cancel: 'Отмена',
        close_positions_limit: 'Лимитным ордером',
        close_positions_market: 'Рыночным ордером',
        close_positions_success: 'Успешно закрыто позиций',
        close_positions_errors: 'Ошибки закрытия',
        order_type: 'Тип ордера',
        market_order: 'Рыночный',
        limit_order: 'Лимитный',
        total_pnl: 'Общий PnL',
        totalWalletBalance: 'Общий баланс',
        totalAvailableBalance: 'Доступные средства',
        cumulativeRealizedPnL: 'Общий P&L'
    },
    en: {
        theme: '🌓 Toggle Theme',
        reduceLoad: 'Reduce Load',
        positions: 'Positions',
        closedPnl: 'Closed PNL',
        searchPlaceholder: 'Search ticker...',
        statistics: 'Statistics',
        totalPnl: 'Total PnL',
        profit: 'Total Profit',
        loss: 'Total Loss',
        totalTrades: 'Total Trades',    
        highProfitableTrades: '- high profitable trades',
        profitableTrades: '- profitable trades',
        losingTrades: '- losing trades',
        topProfitable: 'TOP-3 Profitable',
        topLosing: 'TOP-3 Losing',
        rapidGrowth: 'Rapid Growth Positions',
        clear: 'Clear',
        noPositions: 'No positions',
        noMatches: 'No matches',
        closedPositions: 'Closed Positions',
        showPerPage: 'Show per page',
        contracts: 'Contracts',
        quantity: 'Quantity',
        entryPrice: 'Entry Price',
        exitPrice: 'Exit Price',
        realizedPnl: 'Realized P&L',
        tradingTime: 'Trading Time',
        sortNew: 'Newest to Oldest',
        sortPnl: 'By PNL Size',
        prevPage: '< Previous',
        nextPage: 'Next >',
        page: 'Page',
        from: 'from',
        to: 'to',
        losingPositions: 'Losing Positions',
        switchExchange: 'Switch Exchange',
        confirmSwitch: 'Are you sure you want to switch to',
        yes: 'Yes',
        no: 'No',
        switchedTo: 'Switched to {exchange}',
        switchError: 'Failed to switch exchange',
        disabled: 'disabled',
        close_positions_confirm_title: 'Confirm Positions Closure',
        close_positions_confirm_text: 'Do you really want to close {count} positions?',
        position_type_high_profitable: 'Highly Profitable',
        position_type_profitable: 'Profitable',
        position_type_losing: 'Losing',
        positions_count: 'Positions count',
        position_type: 'Position type',
        'SWITCHED_TO_EXCHANGE': 'Switched to {exchangeName}',
        'switchError': 'Failed to switch exchange',
        menu: 'Menu',
        'sort_pnl_desc': 'PNL (max-min)',
        'sort_pnl_asc': 'PNL (min-max)',
        'sort_roi_desc': 'ROI (max-min)',
        'sort_roi_asc': 'ROI (min-max)',
        'sort_alphabet_asc': 'A-Z',
        'sort_alphabet_desc': 'Z-A',
        'trading': 'Trading',
        'availablePairs': 'Available Pairs',
        'noAvailablePairs': 'No available pairs',
        close_positions_menu_title: 'Close Positions',
        close_positions_cancel: 'Cancel',
        close_positions_limit: 'Limit Order',
        close_positions_market: 'Market Order',
        close_positions_success: 'Successfully closed',
        close_positions_errors: 'Close errors',
        order_type: 'Order type',
        market_order: 'Market',
        limit_order: 'Limit',
        total_pnl: 'Total PnL',
        totalWalletBalance: 'Total Balance',
        totalAvailableBalance: 'Available Balance',
        cumulativeRealizedPnL: 'Total P&L'
    }
};

// Интервалы обновления
const UPDATE_INTERVAL = 2000;  // Интервал обновления основных данных (2 секунды)
const CHART_UPDATE_INTERVAL = 60000;  // Интервал обновления графика (1 минута)
const CLOSED_PNL_UPDATE_INTERVAL = 10000;  // Интервал обновления закрытых позиций (10 секунд)

// График
const CHART_CONFIG = {
    MAX_DATA_POINTS: 30,  // Максимальное количество точек на графике
    TIME_FORMAT: {
        hour: '2-digit',
        minute: '2-digit'
    },
    DEFAULT_COLOR: {
        POSITIVE: {
            BORDER: '#4CAF50',
            BACKGROUND: 'rgba(74, 175, 80, 0.2)'
        },
        NEGATIVE: {
            BORDER: '#f44336',
            BACKGROUND: 'rgba(244, 67, 54, 0.2)'
        }
    }
};

// Настройки графиков для разных тем
const CHART_THEMES = {
    DARK: {
        UPTREND: '#4CAF50',    // Зеленый для роста
        DOWNTREND: '#f44336',  // Красный для падения
        LINE_WIDTH: 1,
        BACKGROUND: '#2d2d2d'
    },
    LIGHT: {
        UPTREND: '#4CAF50',    // Зеленый для роста
        DOWNTREND: '#f44336',  // Красный для падения
        LINE_WIDTH: 1,
        BACKGROUND: '#ffffff'
    }
};

// Значения по умолчанию
const DEFAULTS = {
    PNL_THRESHOLD: 100,
    SORT_ORDER: 'pnl_desc',
    PAGE_SIZE: 10
}; 