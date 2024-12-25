class ExchangeManager {
    constructor() {
        this.exchangeSelect = document.getElementById('exchange-select');
        this.selectedExchange = localStorage.getItem('selectedExchange') || 'bybit';
        this.initializeExchanges();
    }

    async initializeExchanges() {
        try {
            const response = await fetch('/api/exchanges');
            const data = await response.json();
            
            this.exchangeSelect.innerHTML = data.exchanges.map(exchange => {
                if (exchange.active) {
                    this.selectedExchange = exchange.name.toLowerCase();
                    localStorage.setItem('selectedExchange', this.selectedExchange);
                }
                return `
                    <option value="${exchange.name}" 
                            ${!exchange.enabled ? 'disabled' : ''} 
                            ${exchange.active ? 'selected' : ''}>
                        ${exchange.name}${!exchange.enabled ? ' (disabled)' : ''}
                    </option>
                `;
            }).join('');
            
            this.exchangeSelect.addEventListener('change', (e) => this.switchExchange(e.target.value));
            console.log('Current exchange:', this.selectedExchange);
        } catch (error) {
            console.error('Error initializing exchanges:', error);
        }
    }

    async switchExchange(exchangeName) {
        try {
            console.log('Starting exchange switch to:', exchangeName);
            const response = await fetch('/api/exchange', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ exchange: exchangeName })
            });
            
            const data = await response.json();
            console.log('Server response:', data);

            if (data.success) {
                this.selectedExchange = exchangeName.toLowerCase();
                localStorage.setItem('selectedExchange', this.selectedExchange);
                console.log('Switched to exchange:', this.selectedExchange);
                
                const message = languageUtils.getTranslation('SWITCHED_TO_EXCHANGE', {
                    exchangeName: exchangeName
                });
                console.log('Success message to show:', message);
                
                this.showSuccessMessage(message);
                
                console.log('Setting reload timeout...');
                setTimeout(() => {
                    console.log('Reloading page...');
                    window.location.reload();
                }, 1500);
            } else {
                console.log('Switch failed:', data.error);
                const errorMessage = data.error || languageUtils.getTranslation('switchError');
                console.log('Error message to show:', errorMessage);
                this.showErrorMessage(errorMessage);
            }
        } catch (error) {
            console.error('Error switching exchange:', error);
            const errorMessage = languageUtils.getTranslation('switchError');
            console.log('Error message to show:', errorMessage);
            this.showErrorMessage(errorMessage);
        }
    }

    async fetchTicker(symbol) {
        try {
            const response = await fetch(`/api/ticker/${symbol}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            return data;
        } catch (error) {
            console.error(`Error fetching ticker for ${symbol}:`, error);
            throw error;
        }
    }

    async createOrder(orderData) {
        try {
            const response = await fetch('/api/order', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(orderData)
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Error creating order:', error);
            throw error;
        }
    }

    showSuccessMessage(message) {
        console.log('Showing success message:', message);
        const notification = document.createElement('div');
        notification.className = 'notification success';
        notification.textContent = message;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 3000);
    }

    showErrorMessage(message) {
        console.log('Showing error message:', message);
        const notification = document.createElement('div');
        notification.className = 'notification error';
        notification.textContent = message;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 3000);
    }

    getSelectedExchange() {
        return this.selectedExchange.toLowerCase();
    }

    setSelectedExchange(exchange) {
        this.selectedExchange = exchange;
        // Обновить интерфейс и другие компоненты при необходимости
    }

    async fetchClosedPnl(sortBy = 'time') {
        try {
            console.log(`Fetching closed PNL, sort by: ${sortBy}`);
            const response = await fetch(`/api/closed_pnl?sort=${sortBy}`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            console.log(`Received ${data.closed_pnl?.length || 0} closed positions`);
            
            if (!data.success) {
                throw new Error(data.error || 'Failed to fetch closed PNL');
            }
            
            return data.closed_pnl || [];
        } catch (error) {
            console.error('Error fetching closed PNL:', error);
            this.showErrorMessage('Failed to load closed positions');
            return [];
        }
    }

    async getAllPairs() {
        try {
            const response = await fetch('/api/pairs');
            const data = await response.json();
            return data.pairs || [];
        } catch (error) {
            console.error('Error getting pairs:', error);
            return [];
        }
    }

    async getChartData(symbol, timeframe = '1h', period = '1w') {
        try {
            console.log(`[EXCHANGE] Getting chart data for ${symbol} with timeframe ${timeframe}`);
            const response = await fetch(`/api/chart/${symbol}?timeframe=${timeframe}&period=${period}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            console.log(`[EXCHANGE] Received raw chart data:`, JSON.stringify(data, null, 2));

            // Проверяем успешность ответа
            if (!data.success || !data.data || !data.data.candles) {
                console.error('[EXCHANGE] Invalid response format:', JSON.stringify(data, null, 2));
                console.error('[EXCHANGE] Expected format: { success: true, data: { candles: [...] } }');
                throw new Error('Invalid response format');
            }

            // Проверяем структуру данных
            const firstCandle = data.data.candles[0];
            console.log(`[EXCHANGE] First candle structure:`, JSON.stringify(firstCandle, null, 2));

            // Преобразуем данные в нужный формат
            const transformedData = {
                success: true,
                data: {
                    times: [],
                    open: [],
                    high: [],
                    low: [],
                    close: [],
                    volume: []
                }
            };

            // Проверяем и преобразуем каждую свечу
            data.data.candles.forEach((candle, index) => {
                // Проверяем наличие всех необходимых полей
                if (!candle.time && !candle.timestamp) {
                    console.warn(`[EXCHANGE] Missing time data in candle ${index}:`, JSON.stringify(candle, null, 2));
                    return;
                }

                if (typeof candle.open !== 'number' && typeof candle.open !== 'string' ||
                    typeof candle.high !== 'number' && typeof candle.high !== 'string' ||
                    typeof candle.low !== 'number' && typeof candle.low !== 'string' ||
                    typeof candle.close !== 'number' && typeof candle.close !== 'string' ||
                    typeof candle.volume !== 'number' && typeof candle.volume !== 'string') {
                    console.warn(`[EXCHANGE] Invalid price/volume data in candle ${index}:`, JSON.stringify(candle, null, 2));
                    return;
                }

                // Определяем временную метку
                let timestamp;
                if (typeof candle.time === 'number') {
                    timestamp = candle.time;
                } else if (typeof candle.time === 'string') {
                    timestamp = new Date(candle.time).getTime();
                } else if (typeof candle.timestamp === 'number') {
                    timestamp = candle.timestamp;
                } else if (typeof candle.timestamp === 'string') {
                    timestamp = new Date(candle.timestamp).getTime();
                } else {
                    console.warn(`[EXCHANGE] Unable to determine timestamp for candle ${index}:`, JSON.stringify(candle, null, 2));
                    return;
                }

                // Добавляем данные в массивы
                transformedData.data.times.push(timestamp);
                transformedData.data.open.push(parseFloat(candle.open));
                transformedData.data.high.push(parseFloat(candle.high));
                transformedData.data.low.push(parseFloat(candle.low));
                transformedData.data.close.push(parseFloat(candle.close));
                transformedData.data.volume.push(parseFloat(candle.volume));
            });

            // Проверяем, что у нас есть данные после преобразования
            if (transformedData.data.times.length === 0) {
                console.error('[EXCHANGE] No valid candles after transformation');
                throw new Error('No valid candles');
            }

            // Сортируем данные по времени
            const sortedIndexes = transformedData.data.times
                .map((time, index) => ({ time, index }))
                .sort((a, b) => a.time - b.time)
                .map(item => item.index);

            // Применяем сортировку ко всем массивам
            transformedData.data = {
                times: sortedIndexes.map(i => transformedData.data.times[i]),
                open: sortedIndexes.map(i => transformedData.data.open[i]),
                high: sortedIndexes.map(i => transformedData.data.high[i]),
                low: sortedIndexes.map(i => transformedData.data.low[i]),
                close: sortedIndexes.map(i => transformedData.data.close[i]),
                volume: sortedIndexes.map(i => transformedData.data.volume[i])
            };

            console.log('[EXCHANGE] Transformed data:', {
                candleCount: transformedData.data.times.length,
                timeRange: {
                    start: new Date(transformedData.data.times[0]).toISOString(),
                    end: new Date(transformedData.data.times[transformedData.data.times.length - 1]).toISOString()
                }
            });

            return transformedData;
        } catch (error) {
            console.error(`[EXCHANGE] Error getting chart data for ${symbol}:`, error);
            throw error;
        }
    }

    async getIndicators(symbol, timeframe = '1h') {
        try {
            console.log(`[EXCHANGE] Getting indicators for ${symbol} with timeframe ${timeframe}`);
            
            // Формируем URL с параметрами
            const url = new URL(`/api/indicators/${symbol}`, window.location.origin);
            url.searchParams.append('timeframe', timeframe);
            
            console.log(`[EXCHANGE] Request URL: ${url.toString()}`);
            
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            console.log(`[EXCHANGE] Received indicators:`, data);
            
            if (!data.success) {
                throw new Error('Failed to get indicators');
            }
            
            return data;
        } catch (error) {
            console.error(`[EXCHANGE] Error getting indicators for ${symbol}:`, error);
            throw error;
        }
    }
} 