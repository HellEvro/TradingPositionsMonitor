class ApiService {
    static async request(endpoint, options = {}) {
        try {
            const exchange = stateManager.getState('exchange.current');
            const headers = {
                'Content-Type': 'application/json',
                'X-Exchange': exchange
            };

            const response = await fetch(endpoint, {
                ...options,
                headers: {
                    ...headers,
                    ...options.headers
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
            Logger.error('API', `Request failed: ${endpoint}`, error);
            throw error;
        }
    }

    static async get(endpoint, params = {}) {
        const queryString = new URLSearchParams(params).toString();
        const url = queryString ? `${endpoint}?${queryString}` : endpoint;
        return this.request(url, { method: 'GET' });
    }

    static async post(endpoint, data = {}) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    // Trading API methods
    static async getChartData(symbol, timeframe = '1d') {
        return this.get(`/api/chart/${symbol}`, { timeframe });
    }

    static async getIndicators(symbol, timeframe = '1d') {
        return this.get(`/api/indicators/${symbol}`, { timeframe });
    }

    static async getPositions(params = {}) {
        return this.get('/api/positions', params);
    }

    static async closePosition(data) {
        return this.post('/api/close_position', data);
    }
}

window.ApiService = ApiService; 