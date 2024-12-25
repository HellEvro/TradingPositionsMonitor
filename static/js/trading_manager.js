class TradingManager {
    constructor() {
        Logger.info('TRADING', 'Initializing TradingManager');
        
        // Подписываемся на изменения состояния
        this.unsubscribers = [
            stateManager.subscribe('trading.selectedPair', this.handlePairChange.bind(this)),
            stateManager.subscribe('trading.timeframe', this.handleTimeframeChange.bind(this)),
            stateManager.subscribe('app.theme', this.handleThemeChange.bind(this))
        ];

        // Инициализируем состояние
        const state = stateManager.getState('trading');
        this.selectedPair = state.selectedPair || localStorage.getItem('selectedPair');
        this.timeframe = state.timeframe || localStorage.getItem('selectedTimeframe') || '1d';

        // Сохраняем начальное состояние
        stateManager.setState('trading.selectedPair', this.selectedPair);
        stateManager.setState('trading.timeframe', this.timeframe);
        stateManager.setState('trading.isLoading', false);

        // Инициализируем компоненты
        this.initializeComponents();
        
        // Добавляем throttled обработчик изменения размера
        this.resizeHandler = this.throttle(this.handleResize.bind(this), 100);
        window.addEventListener('resize', this.resizeHandler);
    }

    async handlePairChange(newPair) {
        if (!newPair || newPair === this.selectedPair) return;
        
        Logger.info('TRADING', `Loading data for pair: ${newPair}`);
        stateManager.setState('trading.isLoading', true);

        try {
            await this.loadPairData(newPair);
            this.selectedPair = newPair;
            localStorage.setItem('selectedPair', newPair);
        } catch (error) {
            Logger.error('TRADING', `Error loading pair data: ${newPair}`, error);
            NotificationManager.error('Error loading pair data');
        } finally {
            stateManager.setState('trading.isLoading', false);
        }
    }

    async handleTimeframeChange(newTimeframe) {
        if (!this.selectedPair || newTimeframe === this.timeframe) return;
        
        Logger.info('TRADING', `Timeframe changed to: ${newTimeframe}`);
        stateManager.setState('trading.isLoading', true);

        try {
            await this.loadPairData(this.selectedPair, newTimeframe);
            this.timeframe = newTimeframe;
            localStorage.setItem('selectedTimeframe', newTimeframe);
        } catch (error) {
            Logger.error('TRADING', 'Error updating timeframe data:', error);
            NotificationManager.error('Error updating chart data');
        } finally {
            stateManager.setState('trading.isLoading', false);
        }
    }

    handleThemeChange(newTheme) {
        if (!this.chart) return;
        this.chart.options.theme = newTheme;
        this.chart.updateThemeColors();
        this.chart.render();
    }

    async loadPairData(pair, timeframe = null) {
        try {
            const tf = timeframe || this.timeframe;
            
            // Загружаем данные графика
            const chartData = await ApiService.getChartData(pair, tf);
            if (chartData.success) {
                this.updateChart(chartData.data);
            }

            // Загружаем индикаторы
            const indicators = await ApiService.getIndicators(pair, tf);
            if (indicators.success) {
                this.updateIndicators(indicators.data);
            }

            stateManager.setState('trading.lastUpdate', new Date().toISOString());
        } catch (error) {
            Logger.error('TRADING', 'Error loading pair data:', error);
            throw error;
        }
    }

    initializeComponents() {
        // Инициализация графика с сохраненным таймфреймом
        const savedTimeframe = localStorage.getItem('selectedTimeframe') || '1d';
        console.log('Initializing chart with timeframe:', savedTimeframe);
        
        this.chart = new CanvasTradingChart('tradingChart', {
            theme: document.body.getAttribute('data-theme') === 'light' ? 'light' : 'dark',
            timeframe: savedTimeframe,
            period: '1y',
            width: document.getElementById('tradingChart').clientWidth,
            height: document.getElementById('tradingChart').clientHeight
        });

        // Добавляем глобальный слушатель изменения таймфрейма
        document.addEventListener('timeframeChanged', async (e) => {
            console.log('Received timeframeChanged event:', e.detail);
            const { timeframe, chartId } = e.detail;
            if (chartId === 'tradingChart' && this.selectedPair) {
                try {
                    console.log('Loading new data for pair:', this.selectedPair);
                    const loader = document.getElementById('pairInfoLoader');
                    if (loader) loader.classList.remove('hidden');

                    // Загружаем новые данные
                    const chartResponse = await fetch(`/api/chart_data/${this.selectedPair}?timeframe=${timeframe}`);
                    const chartData = await chartResponse.json();

                    const indicatorsResponse = await fetch(`/api/indicators/${this.selectedPair}?timeframe=${timeframe}`);
                    const indicatorsData = await indicatorsResponse.json();

                    if (chartData.success && indicatorsData.success) {
                        console.log('New data loaded, updating chart and indicators');
                        this.chart.updateData(chartData.data);
                        this.updateIndicators(indicatorsData.data);
                    } else {
                        throw new Error('Failed to load data');
                    }

                    if (loader) loader.classList.add('hidden');
                } catch (error) {
                    console.error('Error updating data after timeframe change:', error);
                    this.showError('Failed to update data for new timeframe');
                }
            }
        });

        // Инициализация кнопок автоторговли
        this.initializeAutoTrading();
        
        // Инициализация поиска
        this.initializeSearch();
        
        // Инициализация списка пар
        this.loadAvailablePairs();
        
        // Инициализация обработчиков кнопок торговли
        this.initializeTradingButtons();

        // Обработчик изменения темы
        document.body.addEventListener('themeChanged', (e) => {
            this.chart.options.theme = e.detail.theme;
            this.chart.updateThemeColors();
            this.chart.render();
        });
    }

    async handleTimeframeChange(timeframe) {
        console.log('handleTimeframeChange called with:', timeframe);
        if (this.selectedPair) {
            try {
                console.log('Loading new data for pair:', this.selectedPair);
                // Показываем индикатор загрузки
                const loader = document.getElementById('pairInfoLoader');
                if (loader) {
                    loader.classList.remove('hidden');
                }
                
                // Загружаем новые данные
                const [chartData, indicators] = await Promise.all([
                    this.loadChartData(this.selectedPair),
                    this.loadIndicators(this.selectedPair)
                ]);

                console.log('New data loaded, updating chart and indicators');
                // Обновляем график и индикаторы
                this.chart.updateChartData(chartData);
                this.updateIndicators(indicators);

                // Скрываем индикатор загрузки
                if (loader) {
                    loader.classList.add('hidden');
                }
            } catch (error) {
                console.error('Error updating data after timeframe change:', error);
                this.showError('Failed to update data for new timeframe');
            }
        } else {
            console.log('No pair selected, skipping data update');
        }
    }

    initializeAutoTrading() {
        const startBtn = document.getElementById('startAutoTrading');
        const stopBtn = document.getElementById('stopAutoTrading');
        const statusDot = document.querySelector('.status-dot');
        const statusText = document.querySelector('.status-text');

        startBtn.addEventListener('click', () => {
            this.isAutoTrading = true;
            startBtn.disabled = true;
            stopBtn.disabled = false;
            statusDot.classList.add('active');
            statusText.textContent = languageUtils.translate('tradingStatusActive');
            this.startAutoTradingStrategy();
        });

        stopBtn.addEventListener('click', () => {
            this.isAutoTrading = false;
            startBtn.disabled = false;
            stopBtn.disabled = true;
            statusDot.classList.remove('active');
            statusText.textContent = languageUtils.translate('tradingStatusStopped');
            this.stopAutoTradingStrategy();
        });
    }

    async loadAvailablePairs() {
        try {
            const pairs = await window.app.exchangeManager.getAllPairs();
            const filteredPairs = pairs.filter(pair => !this.blacklist.has(pair));
            this.renderPairsList(filteredPairs);
        } catch (error) {
            console.error('Error loading pairs:', error);
        }
    }

    renderPairsList(pairs) {
        const container = document.getElementById('availablePairsList');
        if (!container) return;

        container.innerHTML = pairs.map(pair => `
            <div class="pair-item" data-pair="${pair}">
                ${pair}
            </div>
        `).join('');

        // Добавляем обработчики клика
        container.querySelectorAll('.pair-item').forEach(item => {
            item.addEventListener('click', () => {
                this.selectPair(item.dataset.pair);
            });
        });

        // Автоматически выбираем первую пару
        if (pairs.length > 0) {
            const firstPair = pairs[0];
            const firstPairElement = container.querySelector(`[data-pair="${firstPair}"]`);
            if (firstPairElement) {
                console.log('Auto-selecting first pair:', firstPair);
                // Добавляем небольшую задержку для уверенности, что все элементы загружены
                setTimeout(() => {
                    this.selectPair(firstPair);
                    firstPairElement.classList.add('selected');
                }, 100);
            }
        }
    }

    async selectPair(pair) {
        // Обновляем выделение
        document.querySelectorAll('.pair-item').forEach(item => {
            item.classList.remove('selected');
            if (item.dataset.pair === pair) {
                item.classList.add('selected');
            }
        });

        this.selectedPair = pair;
        
        // Показываем прелоадер
        document.getElementById('pairInfoLoader').classList.remove('hidden');
        document.getElementById('pairInfoContent').classList.add('hidden');

        try {
            // Загружаем данные
            await this.loadPairData(pair);
            
            // Обновляем интерфейс
            document.getElementById('selectedPairName').textContent = pair;
            document.getElementById('pairInfoLoader').classList.add('hidden');
            document.getElementById('pairInfoContent').classList.remove('hidden');
        } catch (error) {
            console.error('Error loading pair data:', error);
            // Показываем ошибку пользователю
        }
    }

    async loadPairData(pair) {
        try {
            console.log('Loading data for pair:', pair);
            document.getElementById('pairInfoLoader').classList.remove('hidden');
            document.getElementById('pairInfoContent').classList.add('hidden');

            // Загружаем все данные параллельно
            const [chartResponse, indicatorsResponse] = await Promise.all([
                fetch(`/api/chart_data/${pair}`).then(r => r.json()),
                fetch(`/api/indicators/${pair}`).then(r => r.json())
            ]);

            console.log('Received chart data:', chartResponse);
            console.log('Received indicators:', indicatorsResponse);

            if (!chartResponse.success || !indicatorsResponse.success) {
                throw new Error('Failed to load data');
            }

            // Обновляем график
            if (this.chart) {
                console.log('Updating chart...');
                this.chart.updateData(chartResponse.data);
            } else {
                console.error('Chart not initialized');
            }
            
            // Обновляем индикаторы
            this.updateIndicators(indicatorsResponse.data);
            
            // Обновляем рекомендации
            const analysis = await this.analyzePair(pair);
            this.updateRecommendations(analysis);

            // Показываем контент
            document.getElementById('pairInfoLoader').classList.add('hidden');
            document.getElementById('pairInfoContent').classList.remove('hidden');

        } catch (error) {
            console.error('Error loading pair data:', error);
            document.getElementById('pairInfoLoader').classList.add('hidden');
            // Показываем ошибку пользователю
            this.showError('Failed to load pair data');
        }
    }

    showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;
        document.getElementById('pairInfoContent').appendChild(errorDiv);
        setTimeout(() => errorDiv.remove(), 3000);
    }

    // Методы для работы с черным списком
    loadBlacklist() {
        return new Set(JSON.parse(localStorage.getItem('tradingBlacklist') || '[]'));
    }

    saveBlacklist() {
        localStorage.setItem('tradingBlacklist', JSON.stringify([...this.blacklist]));
    }

    addToBlacklist(pair) {
        this.blacklist.add(pair);
        this.saveBlacklist();
        this.loadAvailablePairs(); // Перезагружаем список пар
    }

    removeFromBlacklist(pair) {
        this.blacklist.delete(pair);
        this.saveBlacklist();
        this.loadAvailablePairs(); // Перезагружаем список пар
    }

    // Методы для автоторговли
    startAutoTradingStrategy() {
        this.autoTradingInterval = setInterval(() => {
            this.analyzeAllPairs();
        }, 60000); // Анализируем каждую минуту
    }

    stopAutoTradingStrategy() {
        if (this.autoTradingInterval) {
            clearInterval(this.autoTradingInterval);
        }
    }

    async analyzeAllPairs() {
        const pairs = await window.app.exchangeManager.getAllPairs();
        for (const pair of pairs) {
            if (this.blacklist.has(pair)) continue;
            
            const analysis = await this.analyzePair(pair);
            if (analysis.shouldTrade) {
                this.executeTrade(pair, analysis);
            }
        }
    }

    async analyzePair(pair) {
        try {
            const [chartData, indicators] = await Promise.all([
                this.loadChartData(pair),
                this.loadIndicators(pair)
            ]);

            // Анализ тренда
            const trend = this.analyzeTrend(chartData);
            
            // Анализ RSI на 4-часовом графике
            const rsi = indicators.rsi4h;
            const isRsiValid = rsi < 30; // Для покупки
            
            // Анализ MFI
            const mfi = indicators.mfi;
            const isMfiValid = mfi < 20; // Для покупки
            
            // Анализ DMI
            const dmi = indicators.dmi;
            const isDmiValid = dmi.plus > dmi.minus;
            
            // Анализ MACD
            const macd = indicators.macd;
            const isMacdValid = macd.histogram > 0 && macd.macd > macd.signal;

            // Определение дна
            const isBottom = this.detectBottom(chartData);

            // Принятие решения
            const shouldTrade = trend.isUptrend && 
                              isRsiValid && 
                              isMfiValid && 
                              isDmiValid && 
                              isMacdValid && 
                              isBottom;

            return {
                shouldTrade,
                trend,
                indicators: {
                    rsi,
                    mfi,
                    dmi,
                    macd
                },
                isBottom
            };

        } catch (error) {
            console.error(`Error analyzing ${pair}:`, error);
            return {
                shouldTrade: false,
                error: error.message
            };
        }
    }

    analyzeTrend(chartData) {
        // Анализ тренда на основе SMA и EMA
        const sma200 = this.calculateSMA(chartData.close, 200);
        const ema50 = this.calculateEMA(chartData.close, 50);
        const ema20 = this.calculateEMA(chartData.close, 20);

        const currentPrice = chartData.close[chartData.close.length - 1];
        
        // Определяем силу тренда
        const trendStrength = this.calculateTrendStrength(chartData);

        return {
            isUptrend: currentPrice > sma200 && ema20 > ema50,
            strength: trendStrength,
            direction: currentPrice > sma200 ? 'UP' : 'DOWN'
        };
    }

    detectBottom(chartData) {
        // Паттерн двойного дна
        const isDoubleButtom = this.checkDoubleButtomPattern(chartData);
        
        // Дивергенция RSI
        const hasRsiDivergence = this.checkRsiDivergence(chartData);
        
        // Уровни поддержки
        const atSupportLevel = this.checkSupportLevel(chartData);

        return isDoubleButtom || hasRsiDivergence || atSupportLevel;
    }

    async executeTrade(pair, analysis) {
        try {
            // Получаем текущую цену
            const ticker = await window.app.exchangeManager.fetchTicker(pair);
            if (!ticker) return;

            // Рассчитываем размер позиции
            const position = this.calculatePosition(ticker.last);

            // Размещаем ордер
            const order = await window.app.exchangeManager.createOrder({
                symbol: pair,
                side: 'BUY',
                type: 'LIMIT',
                price: ticker.last * 0.999, // Чуть ниже текущей цены
                quantity: position.size,
                leverage: position.leverage
            });

            console.log(`Order placed for ${pair}:`, order);

        } catch (error) {
            console.error(`Error executing trade for ${pair}:`, error);
        }
    }

    calculatePosition(price) {
        // Здесь можно реализовать свою логику расчета размера позиции
        return {
            size: 0.01, // Минимальный размер
            leverage: 1  // Без плеча
        };
    }

    // Вспомогательные методы для технического анализа
    calculateSMA(data, period) {
        const result = [];
        for (let i = period - 1; i < data.length; i++) {
            const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
            result.push(sum / period);
        }
        return result;
    }

    calculateEMA(data, period) {
        const k = 2 / (period + 1);
        const result = [data[0]];
        
        for (let i = 1; i < data.length; i++) {
            result.push(data[i] * k + result[i - 1] * (1 - k));
        }
        
        return result;
    }

    calculateTrendStrength(chartData) {
        // Используем ADX для определения силы тренда
        const adx = this.calculateADX(chartData);
        const lastADX = adx[adx.length - 1];

        if (lastADX > 50) return 'STRONG';
        if (lastADX > 25) return 'MODERATE';
        return 'WEAK';
    }

    // Методы для обновления UI
    updateChart(data) {
        if (this.chart) {
            this.chart.updateData(data);
        }
    }

    updateIndicators(indicators) {
        // Обновляем значения индикаторов на странице
        const elements = {
            rsi: document.getElementById('rsiValue'),
            macd: document.getElementById('macdValue'),
            mfi: document.getElementById('mfiValue'),
            dmi: document.getElementById('dmiValue')
        };

        if (elements.rsi) {
            elements.rsi.innerHTML = `
                <div class="indicator-value ${indicators.rsi < 30 ? 'oversold' : indicators.rsi > 70 ? 'overbought' : ''}">
                    ${indicators.rsi.toFixed(2)}
                </div>
                <div class="indicator-4h">4H: ${indicators.rsi4h.toFixed(2)}</div>
            `;
        }

        if (elements.macd) {
            elements.macd.innerHTML = `
                <div class="macd-line">MACD: ${indicators.macd.macd.toFixed(2)}</div>
                <div class="signal-line">Signal: ${indicators.macd.signal.toFixed(2)}</div>
                <div class="histogram ${indicators.macd.histogram > 0 ? 'positive' : 'negative'}">
                    Hist: ${indicators.macd.histogram.toFixed(2)}
                </div>
            `;
        }

        if (elements.mfi) {
            elements.mfi.innerHTML = `
                <div class="indicator-value ${indicators.mfi < 20 ? 'oversold' : indicators.mfi > 80 ? 'overbought' : ''}">
                    ${indicators.mfi.toFixed(2)}
                </div>
            `;
        }

        if (elements.dmi) {
            elements.dmi.innerHTML = `
                <div class="dmi-lines">
                    <div class="plus-di ${indicators.dmi.plus > indicators.dmi.minus ? 'dominant' : ''}">
                        +DI: ${indicators.dmi.plus.toFixed(2)}
                    </div>
                    <div class="minus-di ${indicators.dmi.minus > indicators.dmi.plus ? 'dominant' : ''}">
                        -DI: ${indicators.dmi.minus.toFixed(2)}
                    </div>
                </div>
            `;
        }
    }

    updateRecommendations(analysis) {
        const elements = {
            trend: document.getElementById('trendStrength'),
            direction: document.getElementById('trendDirection'),
            position: document.getElementById('positionRecommendation'),
            strategy: document.getElementById('smartMoneyStrategy'),
            bottom: document.getElementById('bottomLevel'),
            top: document.getElementById('topLevel')
        };

        if (elements.trend) {
            elements.trend.innerHTML = `
                <div class="trend-strength ${analysis.trend.strength.toLowerCase()}">
                    ${languageUtils.translate('strength')}: ${analysis.trend.strength}
                </div>
            `;
        }

        if (elements.direction) {
            elements.direction.innerHTML = `
                <div class="trend-direction ${analysis.trend.direction.toLowerCase()}">
                    ${languageUtils.translate('direction')}: ${analysis.trend.direction}
                </div>
            `;
        }

        if (elements.position) {
            const recommendation = this.getPositionRecommendation(analysis);
            elements.position.innerHTML = `
                <div class="position-recommendation ${recommendation.toLowerCase()}">
                    ${languageUtils.translate(recommendation)}
                </div>
            `;
        }

        if (elements.strategy) {
            const strategy = this.getSmartMoneyStrategy(analysis);
            elements.strategy.innerHTML = `
                <div class="smart-money-strategy ${strategy.toLowerCase()}">
                    ${languageUtils.translate(strategy)}
                </div>
            `;
        }

        if (elements.bottom && elements.top) {
            elements.bottom.textContent = `${languageUtils.translate('bottomPrice')}: ${analysis.bottomPrice?.toFixed(2) || 'N/A'}`;
            elements.top.textContent = `${languageUtils.translate('topPrice')}: ${analysis.topPrice?.toFixed(2) || 'N/A'}`;
        }
    }

    // Добавляем методы для анализа паттернов
    checkDoubleButtomPattern(chartData) {
        // Реализация поиска паттерна двойного дна
        const lows = chartData.low;
        const tolerance = 0.002; // 0.2% tolerance
        
        for (let i = lows.length - 1; i >= 20; i--) {
            for (let j = i - 5; j >= 10; j--) {
                if (Math.abs(lows[i] - lows[j]) / lows[i] < tolerance) {
                    return true;
                }
            }
        }
        return false;
    }

    checkRsiDivergence(chartData) {
        const rsi = this.calculateRSI(chartData.close, 14);
        const lows = chartData.low;
        
        // Ищем бычью дивергенцию
        let priceDowntrend = false;
        let rsiUptrend = false;
        
        for (let i = lows.length - 10; i < lows.length; i++) {
            if (lows[i] < lows[i-1]) priceDowntrend = true;
            if (rsi[i] > rsi[i-1]) rsiUptrend = true;
        }
        
        return priceDowntrend && rsiUptrend;
    }

    checkSupportLevel(chartData) {
        const lows = chartData.low;
        const currentPrice = chartData.close[chartData.close.length - 1];
        const supportLevels = this.findSupportLevels(lows);
        
        // Проверяем, находится ли цена около уровня поддержки
        return supportLevels.some(level => 
            Math.abs(currentPrice - level) / currentPrice < 0.01
        );
    }

    findSupportLevels(prices) {
        const levels = [];
        const tolerance = 0.005; // 0.5%
        
        for (let i = 20; i < prices.length - 20; i++) {
            if (this.isLocalMinimum(prices, i)) {
                const level = prices[i];
                if (!levels.some(l => Math.abs(l - level) / l < tolerance)) {
                    levels.push(level);
                }
            }
        }
        
        return levels;
    }

    isLocalMinimum(prices, index) {
        const range = 5;
        const current = prices[index];
        
        for (let i = index - range; i <= index + range; i++) {
            if (i !== index && prices[i] < current) return false;
        }
        return true;
    }

    calculateADX(chartData, period = 14) {
        const tr = this.calculateTR(chartData);
        const plusDM = this.calculatePlusDM(chartData);
        const minusDM = this.calculateMinusDM(chartData);
        
        const atr = this.calculateATR(tr, period);
        const plusDI = this.calculateDI(plusDM, atr);
        const minusDI = this.calculateDI(minusDM, atr);
        
        return this.calculateADXLine(plusDI, minusDI, period);
    }

    getPositionRecommendation(analysis) {
        if (!analysis.shouldTrade) return 'HOLD';
        
        if (analysis.trend.isUptrend && analysis.trend.strength === 'STRONG') {
            return 'LONG';
        }
        
        if (!analysis.trend.isUptrend && analysis.trend.strength === 'STRONG') {
            return 'SHORT';
        }
        
        return 'HOLD';
    }

    getSmartMoneyStrategy(analysis) {
        const {trend, indicators, isBottom} = analysis;
        
        if (isBottom && indicators.rsi < 30 && trend.isUptrend) {
            return 'ACCUMULATION_ZONE';
        }
        
        if (trend.strength === 'STRONG' && indicators.mfi > 80) {
            return 'DISTRIBUTION_ZONE';
        }
        
        return 'NEUTRAL_ZONE';
    }

    initializeSearch() {
        const searchInput = document.getElementById('tradingSearch');
        if (!searchInput) return;
        
        searchInput.addEventListener('input', (e) => {
            const value = e.target.value.toUpperCase();
            const pairs = document.querySelectorAll('.pair-item');
            
            pairs.forEach(pair => {
                const pairText = pair.textContent.toUpperCase();
                pair.style.display = pairText.includes(value) ? '' : 'none';
            });
        });
    }

    initializeTradingButtons() {
        document.querySelector('.market-buy-btn').addEventListener('click', () => {
            if (this.selectedPair) {
                this.executeTrade(this.selectedPair, { type: 'MARKET' });
            }
        });
        
        document.querySelector('.limit-buy-btn').addEventListener('click', () => {
            if (this.selectedPair) {
                this.executeTrade(this.selectedPair, { type: 'LIMIT' });
            }
        });
        
        document.querySelector('.blacklist-btn').addEventListener('click', () => {
            if (this.selectedPair) {
                this.addToBlacklist(this.selectedPair);
                this.selectedPair = null;
                document.getElementById('pairInfoContent').classList.add('hidden');
                document.getElementById('selectedPairName').textContent = '';
            }
        });
    }

    async loadChartData(pair) {
        try {
            console.log('Loading chart data for:', pair);
            const response = await fetch(`/api/chart_data/${pair}?timeframe=${this.chart.options.timeframe}&period=${this.chart.options.period}`);
            const data = await response.json();
            
            if (!data.success) {
                throw new Error(data.error || 'Failed to load chart data');
            }
            
            return data.data;
        } catch (error) {
            console.error('Error loading chart data:', error);
            throw error;
        }
    }

    async loadIndicators(pair) {
        try {
            console.log('Loading indicators for:', pair);
            const response = await fetch(`/api/indicators/${pair}?timeframe=${this.chart.options.timeframe}`);
            const data = await response.json();
            
            if (!data.success) {
                throw new Error(data.error || 'Failed to load indicators');
            }
            
            return data.data;
        } catch (error) {
            console.error('Error loading indicators:', error);
            throw error;
        }
    }

    // Метод для throttle
    throttle(func, limit) {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        }
    }

    // Обработчик изменения размера
    handleResize() {
        // Обновляем размеры контейнеров
        const container = document.querySelector('.trading-container');
        if (!container) return;

        // Пересчитываем высоту контейнера
        const windowHeight = window.innerHeight;
        const containerTop = container.getBoundingClientRect().top;
        const newHeight = windowHeight - containerTop - 20; // 20px для отступа снизу
        
        container.style.height = `${Math.max(400, newHeight)}px`; // Минимальная высота 400px

        // Если есть график, обновляем его размер
        if (this.chart) {
            this.chart.resize();
        }

        // Проверяем наличие скролла
        this.checkScrollVisibility();
    }

    // Проверка видимости скролла
    checkScrollVisibility() {
        const pairsList = document.querySelector('.pairs-list');
        if (!pairsList) return;

        const hasScroll = pairsList.scrollHeight > pairsList.clientHeight;
        pairsList.style.overflowY = hasScroll ? 'auto' : 'hidden';
    }

    // Не забываем очистить обработчик при уничтожении
    destroy() {
        // Отписываемся от всех подписок
        this.unsubscribers.forEach(unsubscribe => unsubscribe());
        
        // Удаляем обработчик ресайза
        window.removeEventListener('resize', this.resizeHandler);
        
        // Уничтожаем график
        if (this.chart) {
            this.chart.remove();
            this.chart = null;
        }
    }
}

// Экспортируем класс
window.TradingManager = TradingManager;