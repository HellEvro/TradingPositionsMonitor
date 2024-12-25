// Компонент фильтров для страницы торговли
class TradingFilters {
    constructor() {
        this.tickersData = new Map();
        this.currentFilter = 'все';
        this.initializeFilterButtons();
    }

    initializeFilterButtons() {
        const filterButtons = document.querySelectorAll('.filter-button');
        console.log('[FILTERS] Initializing filter buttons:', filterButtons.length);

        filterButtons.forEach(button => {
            button.onclick = (e) => {
                e.preventDefault();
                const filter = button.dataset.filter;
                console.log('[FILTERS] Filter clicked:', filter);
                
                // Убираем активный класс у всех кнопок
                filterButtons.forEach(btn => btn.classList.remove('active'));
                // Добавляем активный класс нажатой кнопке
                button.classList.add('active');
                
                this.currentFilter = filter;
                // Применяем фильтр
                this.applyFilter(filter);
            };
        });
    }

    // Добавляем метод проверки фильтра
    checkFilter(symbol, filter) {
        const analysis = this.tickersData.get(symbol);
        if (!analysis) return false;
        
        const { trend, state, positionPercent, indicators } = analysis;
        const { rsi, volumeStrength } = indicators;
        
        switch (filter) {
            case 'рост':
                return (trend === 'рост' && volumeStrength > 1.0) || 
                       (state === 'рост' && positionPercent > 10 && rsi < 70);
            case 'падение':
                return (trend === 'падение' && volumeStrength > 1.0) || 
                       (state === 'падение' && positionPercent > 10 && rsi > 30);
            case 'флэт':
                return trend === 'флэт' && 
                       positionPercent > 10 && 
                       positionPercent < 90 && 
                       rsi >= 30 && 
                       rsi <= 70;
            case 'дно рынка':
                return state === 'дно рынка' && 
                       positionPercent <= 10 && 
                       rsi < 30 && 
                       (trend === 'флэт' || trend === 'рост');
            case 'хай рынка':
                return state === 'хай рынка' && 
                       positionPercent >= 90 && 
                       rsi > 70 && 
                       trend === 'флэт';
            default:
                return true;
        }
    }

    applyFilter(filter) {
        console.log('[FILTERS] Applying filter:', filter);
        const tickersList = document.getElementById('availablePairsList');
        if (!tickersList) {
            console.error('[FILTERS] Tickers list not found');
            return;
        }
        
        const allTickers = Array.from(tickersList.children);
        let visibleCount = 0;
        
        allTickers.forEach(ticker => {
            const symbol = ticker.dataset.symbol;
            let visible = filter === 'все' ? true : this.checkFilter(symbol, filter);
            
            // Проверяем глобальный поиск, если он активен
            const searchInput = document.querySelector('.search-input');
            if (searchInput && searchInput.value) {
                const matchesSearch = symbol.toLowerCase().includes(searchInput.value.toLowerCase());
                visible = visible && matchesSearch;
            }
            
            ticker.style.display = visible ? '' : 'none';
            if (visible) visibleCount++;
        });
        
        // Обновляем счетчики
        const totalPairsElement = document.getElementById('totalPairs');
        const filteredPairsElement = document.getElementById('filteredPairs');
        
        if (totalPairsElement) {
            totalPairsElement.textContent = allTickers.length;
        }
        if (filteredPairsElement) {
            filteredPairsElement.textContent = visibleCount;
        }
        
        console.log(`[FILTERS] Filter applied: ${visibleCount} of ${allTickers.length} visible`);
    }

    analyzeTicker(symbol, candles) {
        try {
            // Проверка на пустой массив свечей
            if (!candles || candles.length === 0) {
                console.log(`[FILTERS] No candles data for ${symbol}`);
                return null;
            }

            const prices = candles.map(c => ({
                low: parseFloat(c.low),
                high: parseFloat(c.high),
                close: parseFloat(c.close),
                volume: parseFloat(c.volume)
            }));

            // Базовые расчеты
            const minPrice = Math.min(...prices.map(p => p.low));
            const maxPrice = Math.max(...prices.map(p => p.high));
            const currentPrice = prices[prices.length - 1].close;
            const priceRange = maxPrice - minPrice;
            
            if (priceRange === 0) return null;
            
            const positionPercent = ((currentPrice - minPrice) / priceRange) * 100;

            // Проверка на достаточное количество свечей для расчета RSI
            if (prices.length < 14) {
                console.log(`[FILTERS] Insufficient data for ${symbol} (${prices.length} candles)`);
                return null;
            }

            // Рассчитываем RSI (14 периодов)
            const rsi = this.calculateRSI(prices.map(p => p.close), 14);
            const currentRSI = rsi[rsi.length - 1];

            // Анализируем объемы
            const volumeMA = this.calculateVolumeMA(prices.map(p => p.volume), 20);
            const currentVolume = prices[prices.length - 1].volume;
            let volumeStrength = currentVolume / volumeMA[volumeMA.length - 1];

            // Проверка на бесконечность или NaN
            if (!isFinite(volumeStrength) || isNaN(volumeStrength)) {
                console.log(`[FILTERS] Invalid volume for ${symbol}, using default value`);
                volumeStrength = 1.0;
            }

            // Определяем тренд с учетом RSI и объема
            const period = 14;
            const recentPrices = prices.slice(-period).map(p => p.close);
            
            // Проверка на достаточное количество цен для расчета тренда
            if (recentPrices.length < period) {
                console.log(`[FILTERS] Insufficient recent prices for ${symbol}`);
                return null;
            }

            // Добавляем начальное значение 0 в reduce
            const firstHalf = recentPrices.slice(0, period/2).reduce((a, b) => a + b, 0) / (period/2);
            const secondHalf = recentPrices.slice(period/2).reduce((a, b) => a + b, 0) / (period/2);

            let trend;
            // Определяем базовое направление
            if (secondHalf > firstHalf * 1.02) {
                trend = 'рост';
            } else if (firstHalf > secondHalf * 1.02) {
                trend = 'падение';
            } else {
                trend = 'флэт';
            }

            // Корректируем тренд с учетом RSI и объема
            if (trend === 'рост') {
                if (currentRSI > 70 && volumeStrength < 0.8) {
                    trend = 'флэт'; // Перекупленность с низким объемом
                } else if (currentRSI > 70 && volumeStrength > 1.5) {
                    trend = 'рост'; // Сильный тренд с высоким объемом
                }
            } else if (trend === 'падение') {
                if (currentRSI < 30 && volumeStrength < 0.8) {
                    trend = 'флэт'; // Перепроданность с низким объемом
                } else if (currentRSI < 30 && volumeStrength > 1.5) {
                    trend = 'падение'; // Сильный тренд с высоким объемом
                }
            }

            // Определяем состояние с учетом всех факторов
            let state;
            if (positionPercent <= 10) {
                if (trend === 'падение' && volumeStrength > 1.2) {
                    state = 'падение';
                } else if (currentRSI < 30) {
                    state = 'дно рынка';
                } else {
                    state = trend;
                }
            } else if (positionPercent >= 90) {
                if (trend === 'рост' && volumeStrength > 1.2) {
                    state = 'рост';
                } else if (currentRSI > 70) {
                    state = 'хай рынка';
                } else {
                    state = trend;
                }
            } else {
                state = trend;
            }

            const analysis = {
                trend,
                positionPercent,
                state,
                indicators: {
                    rsi: currentRSI,
                    volumeStrength
                }
            };

            // Сохраняем результат анализа
            this.tickersData.set(symbol, analysis);
            console.log(`[FILTERS] Analysis for ${symbol}: trend=${trend}, state=${state}, position=${positionPercent.toFixed(2)}%, RSI=${currentRSI.toFixed(2)}, Volume=${volumeStrength.toFixed(2)}`);

            // Применяем текущий фильтр
            this.applyFilter(this.currentFilter);

            return analysis;

        } catch (error) {
            console.error(`[FILTERS] Error analyzing ${symbol}:`, error);
            return null;
        }
    }

    // Добавляем метод расчета RSI
    calculateRSI(prices, period = 14) {
        const changes = [];
        for (let i = 1; i < prices.length; i++) {
            changes.push(prices[i] - prices[i - 1]);
        }

        const gains = changes.map(change => change > 0 ? change : 0);
        const losses = changes.map(change => change < 0 ? -change : 0);

        const avgGain = gains.slice(0, period).reduce((a, b) => a + b) / period;
        const avgLoss = losses.slice(0, period).reduce((a, b) => a + b) / period;

        const rsi = [100 - (100 / (1 + avgGain / avgLoss))];

        for (let i = period; i < changes.length; i++) {
            const gain = gains[i];
            const loss = losses[i];

            const newAvgGain = (avgGain * (period - 1) + gain) / period;
            const newAvgLoss = (avgLoss * (period - 1) + loss) / period;

            rsi.push(100 - (100 / (1 + newAvgGain / newAvgLoss)));
        }

        return rsi;
    }

    // Добавляем метод расчета скользящей средней объема
    calculateVolumeMA(volumes, period = 20) {
        const ma = [];
        for (let i = 0; i < volumes.length; i++) {
            if (i < period - 1) {
                ma.push(null);
                continue;
            }
            const sum = volumes.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
            ma.push(sum / period);
        }
        return ma;
    }
}

// Создаем экземпляр при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    console.log('[FILTERS] Creating instance...');
    window.tradingFilters = new TradingFilters();
}); 