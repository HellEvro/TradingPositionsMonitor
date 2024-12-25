class StateManager {
    constructor() {
        this.state = {
            app: {
                currentTab: 'positions',
                theme: localStorage.getItem('theme') || 'dark',
                isUpdating: false,
                error: null,
                lastUpdate: null
            },
            positions: {
                data: null,
                isLoading: false,
                error: null,
                pnlThreshold: parseFloat(localStorage.getItem('pnl_threshold')) || 100,
                reduceLoad: localStorage.getItem('reduceLoad') === 'true',
                filters: {
                    searchQuery: '',
                    currentFilter: 'all'
                },
                sortSettings: {}
            },
            trading: {
                selectedPair: localStorage.getItem('selectedPair'),
                timeframe: localStorage.getItem('selectedTimeframe') || '1d',
                isLoading: false,
                error: null,
                chartData: null,
                indicators: null,
                availablePairs: [],
                blacklist: new Set(JSON.parse(localStorage.getItem('tradingBlacklist') || '[]'))
            },
            statistics: {
                data: null,
                isLoading: false,
                error: null,
                chartData: {
                    labels: [],
                    values: []
                },
                lastUpdate: null
            },
            exchange: {
                current: localStorage.getItem('selectedExchange') || 'bybit',
                isChanging: false,
                error: null,
                availableExchanges: []
            }
        };

        this.listeners = new Map();
        this.persistentKeys = new Set([
            'app.theme',
            'positions.pnlThreshold',
            'positions.reduceLoad',
            'trading.selectedPair',
            'trading.timeframe',
            'trading.blacklist',
            'exchange.current'
        ]);

        Logger.info('STATE', 'StateManager initialized');
    }

    getState(path = '') {
        if (!path) return this.state;
        return path.split('.').reduce((obj, key) => obj?.[key], this.state);
    }

    setState(path, value, notify = true) {
        try {
            const keys = path.split('.');
            const lastKey = keys.pop();
            const target = keys.reduce((obj, key) => obj[key], this.state);
            
            if (target[lastKey] === value) return;
            
            target[lastKey] = value;
            
            // Сохраняем в localStorage если нужно
            if (this.persistentKeys.has(path)) {
                if (value instanceof Set) {
                    localStorage.setItem(path, JSON.stringify([...value]));
                } else {
                    localStorage.setItem(path, JSON.stringify(value));
                }
            }
            
            if (notify) {
                this.notifyListeners(path, value);
            }
            
            Logger.debug('STATE', `State updated: ${path}`, value);
        } catch (error) {
            Logger.error('STATE', `Error updating state at path: ${path}`, error);
            throw error;
        }
    }

    subscribe(path, callback) {
        if (!this.listeners.has(path)) {
            this.listeners.set(path, new Set());
        }
        this.listeners.get(path).add(callback);
        return () => this.unsubscribe(path, callback);
    }

    unsubscribe(path, callback) {
        if (this.listeners.has(path)) {
            this.listeners.get(path).delete(callback);
        }
    }

    notifyListeners(path, value) {
        if (this.listeners.has(path)) {
            this.listeners.get(path).forEach(callback => {
                try {
                    callback(value);
                } catch (error) {
                    Logger.error('STATE', `Error in listener for ${path}:`, error);
                }
            });
        }
    }

    resetState() {
        this.state = this.getInitialState();
        Logger.info('STATE', 'State reset to initial values');
    }
}

// Создаем глобальный экземпляр
window.stateManager = new StateManager(); 