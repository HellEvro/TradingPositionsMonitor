class CanvasTradingChart {
    constructor(containerId, options = {}) {
        this.containerId = containerId;
        const savedTimeframe = localStorage.getItem('selectedTimeframe') || '1d';
        
        this.onTimeframeChange = options.onTimeframeChange;
        
        this.options = {
            theme: options.theme || 'dark',
            timeframe: options.timeframe || savedTimeframe,
            period: options.period || '1y',
            width: options.width || 800,
            height: options.height || 600,
            rightPadding: options.rightPadding || 60,
            minScale: 0.1,  // Минимальный масштаб
            maxScale: 10,   // Максимальный масштаб
            scrollStep: 50  // Шаг прокрутки
        };
        
        this.indicators = {};
        this.data = {
            candles: [],
            volume: [],
            indicators: {}
        };
        
        this.view = {
            scale: 1,           // Горизонтальный масштаб
            offset: 0,          // Горизонтальное смещение
            verticalScale: 1,   // Вертикальный масштаб
            verticalOffset: 0,  // Вертикальное смещение
            isDragging: false,  // Флаг перетаскивания
            lastX: 0,          // Последняя позиция X мыши
            lastY: 0,          // Последняя позиция Y мыши
            mouseX: 0,         // Текущая позиция X мыши
            mouseY: 0          // Текущая позиция Y мыши
        };
        
        this.currentPrice = null; // Добавляем поле для текущей цены
        
        this.ticker = options.ticker || 'Ticker'; // Добавляем поле для тикера
        
        this.updateThemeColors(); // Инициализируем цвета перед обновлением заголовка
        this.updateTitle(); // Обновляем заголовок при инициализации
        
        this.initializeCanvas();
        this.setupEventListeners();
        this.setupTimeframeButtons();
    }

    setupTimeframeButtons() {
        const container = document.getElementById(this.containerId);
        if (!container) {
            console.error('Container not found:', this.containerId);
            return;
        }

        const chartBlock = container.closest('.trading-chart-block');
        if (!chartBlock) {
            console.error('Chart block not found');
            return;
        }

        const timeframeButtons = chartBlock.querySelector('.timeframe-buttons');
        if (!timeframeButtons) {
            console.error('Timeframe buttons container not found');
            return;
        }

        // Добавляем кнопку "Всё"
        const allButton = document.createElement('button');
        allButton.textContent = 'Всё';
        allButton.className = 'timeframe-button';
        allButton.dataset.timeframe = 'all';
        timeframeButtons.appendChild(allButton);

        const buttons = chartBlock.querySelectorAll('.timeframe-button');
        console.log('Found timeframe buttons:', buttons.length);

        // Устанавливаем активную кнопку при инициализации
        this.updateActiveTimeframeButton(buttons);

        buttons.forEach(button => {
            button.addEventListener('click', (e) => {
                console.log('Timeframe button clicked:', button.dataset.timeframe);
                const newTimeframe = button.dataset.timeframe;
                this.changeTimeframe(newTimeframe, buttons);
            });
        });
    }

    changeTimeframe(newTimeframe, buttons) {
        console.log('Changing timeframe to:', newTimeframe);
        
        // Обновляем активную кнопку
        buttons.forEach(btn => btn.classList.remove('active'));
        const activeButton = Array.from(buttons).find(
            button => button.dataset.timeframe === newTimeframe
        );
        if (activeButton) {
            activeButton.classList.add('active');
        }

        // Сохраняем выбранный таймфрейм
        localStorage.setItem('selectedTimeframe', newTimeframe);
        
        // Обновляем опции
        this.options.timeframe = newTimeframe;

        // Генерируем событие изменения таймфрейма
        console.log('Dispatching timeframeChanged event');
        const event = new CustomEvent('timeframeChanged', {
            detail: { 
                timeframe: newTimeframe,
                chartId: this.containerId
            },
            bubbles: true,
            cancelable: true
        });
        document.dispatchEvent(event);

        this.updateTitle(); // Обновляем заголовок при изменении таймфрейма
    }

    updateActiveTimeframeButton(buttons) {
        console.log('Updating active button for timeframe:', this.options.timeframe);
        buttons.forEach(btn => btn.classList.remove('active'));
        const activeButton = Array.from(buttons).find(
            button => button.dataset.timeframe === this.options.timeframe
        );
        if (activeButton) {
            activeButton.classList.add('active');
        } else {
            console.warn('No button found for timeframe:', this.options.timeframe);
        }
    }

    // Метод для обновления данных графика
    updateChartData(data) {
        this.updateData(data);
        this.render();
    }

    initializeCanvas() {
        const container = document.getElementById(this.containerId);
        if (!container) {
            console.error('Контейнер графика не найден:', this.containerId);
            return;
        }

        // Создаем основной canvas для графика
        this.mainCanvas = document.createElement('canvas');
        this.mainCanvas.width = this.options.width;
        this.mainCanvas.height = this.options.height;
        container.appendChild(this.mainCanvas);
        
        // Создаем canvas для оверлеев (курсор, тултипы)
        this.overlayCanvas = document.createElement('canvas');
        this.overlayCanvas.width = this.options.width;
        this.overlayCanvas.height = this.options.height;
        this.overlayCanvas.style.position = 'absolute';
        this.overlayCanvas.style.top = '0';
        this.overlayCanvas.style.left = '0';
        container.appendChild(this.overlayCanvas);

        // Получаем контексты
        this.ctx = this.mainCanvas.getContext('2d');
        this.overlayCtx = this.overlayCanvas.getContext('2d');

        // Устанавливаем стили в зависимости от темы
        this.updateThemeColors();
    }

    updateThemeColors() {
        const isDark = this.options.theme === 'dark';
        this.colors = {
            background: isDark ? '#1e222d' : '#ffffff',
            text: isDark ? '#d1d4dc' : '#000000',
            grid: isDark ? '#2B2B43' : '#e1e3e6',
            candleUp: '#26a69a',
            candleDown: '#ef5350',
            volume: isDark ? '#26a69a80' : '#26a69a40'
        };
    }

    setupEventListeners() {
        // Обработчик изменения размера окна
        window.addEventListener('resize', () => {
            this.resize();
        });

        // Обработчики для взаимодействия с графиком
        this.overlayCanvas.addEventListener('mousemove', (e) => {
            this.handleMouseMove(e);
        });

        this.overlayCanvas.addEventListener('mousedown', (e) => {
            this.handleMouseDown(e);
        });

        this.overlayCanvas.addEventListener('mouseup', (e) => {
            this.handleMouseUp(e);
        });

        this.overlayCanvas.addEventListener('wheel', (e) => {
            this.handleWheel(e);
        }, { passive: true });

        // Добавляем обработчик выхода мыши за пределы графика
        this.overlayCanvas.addEventListener('mouseleave', () => {
            this.view.isDragging = false;
            this.overlayCanvas.style.cursor = 'crosshair';
        });
    }

    resize() {
        const container = document.getElementById(this.containerId);
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;

        // Устанавливаем размеры canvas с учетом pixel ratio
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;

        // Устанавливаем CSS размеры
        this.canvas.style.width = `${rect.width}px`;
        this.canvas.style.height = `${rect.height}px`;

        // Масштабируем контекст
        this.ctx.scale(dpr, dpr);

        // Обновляем размеры в опциях
        this.options.width = rect.width;
        this.options.height = rect.height;

        // Сбрасываем трансформацию перед следующим рендером
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // Устанавливаем правильные стили для текста
        this.ctx.textBaseline = 'middle';
        this.ctx.textAlign = 'right';
        this.ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';

        // Перерисовываем график
        this.render();
    }

    updateData(data) {
        if (!data || !data.times || !data.close) {
            console.error('Неверные данные графика:', data);
            return;
        }

        // Сохраняем текущую цену
        if (data.close.length > 0) {
            this.currentPrice = parseFloat(data.close[data.close.length - 1]);
        }

        console.log('[CHART] Updating data:', {
            timesLength: data.times.length,
            firstTime: data.times[0],
            firstTimeType: typeof data.times[0]
        });

        // Проверяем наличие всех необходимых данных
        if (!data.open || !data.high || !data.low || !data.volume ||
            data.times.length !== data.open.length ||
            data.times.length !== data.high.length ||
            data.times.length !== data.low.length ||
            data.times.length !== data.close.length ||
            data.times.length !== data.volume.length) {
            console.error('[CHART] Incomplete or mismatched data arrays:', {
                times: data.times?.length,
                open: data.open?.length,
                high: data.high?.length,
                low: data.low?.length,
                close: data.close?.length,
                volume: data.volume?.length
            });
            return;
        }

        // Преобразуем данные в нужный формат
        this.data.candles = data.times.map((time, i) => {
            // Проверяем и преобразуем временную метку
            let timestamp = time;
            if (typeof time === 'string') {
                timestamp = new Date(time).getTime();
            } else if (typeof time !== 'number') {
                console.warn('[CHART] Invalid time format:', time);
                timestamp = Date.now();
            }

            const candle = {
                time: timestamp,
                open: parseFloat(data.open[i]) || 0,
                high: parseFloat(data.high[i]) || 0,
                low: parseFloat(data.low[i]) || 0,
                close: parseFloat(data.close[i]) || 0
            };

            // Проверяем валидность свечи
            if (candle.high < candle.low || candle.open < candle.low || candle.close < candle.low ||
                candle.high < candle.open || candle.high < candle.close) {
                console.warn('[CHART] Invalid candle data:', candle);
            }

            return candle;
        });

        this.data.volume = data.times.map((time, i) => {
            // Используем ту же логику для временных меток
            let timestamp = time;
            if (typeof time === 'string') {
                timestamp = new Date(time).getTime();
            } else if (typeof time !== 'number') {
                timestamp = Date.now();
            }

            return {
                time: timestamp,
                value: parseFloat(data.volume[i]) || 0,
                color: (parseFloat(data.close[i]) || 0) >= (parseFloat(data.open[i]) || 0) 
                    ? this.colors.candleUp 
                    : this.colors.candleDown
            };
        });

        // Сортируем данные по времени
        this.data.candles.sort((a, b) => a.time - b.time);
        this.data.volume.sort((a, b) => a.time - b.time);

        console.log('[CHART] Data updated successfully:', {
            candles: this.data.candles.length,
            volumes: this.data.volume.length,
            firstCandle: this.data.candles[0],
            lastCandle: this.data.candles[this.data.candles.length - 1]
        });

        // Перерисовываем график
        this.render();
    }

    render() {
        // Очищаем холсты
        this.ctx.clearRect(0, 0, this.options.width, this.options.height);
        this.overlayCtx.clearRect(0, 0, this.options.width, this.options.height);

        // Рисуем фон
        this.ctx.fillStyle = this.colors.background;
        this.ctx.fillRect(0, 0, this.options.width, this.options.height);

        // Сохраняем состояние контекста
        this.ctx.save();
        
        // Применяем трансформации только для графика свечей
        this.ctx.translate(-this.view.offset * this.view.scale, -this.view.verticalOffset * this.view.verticalScale);
        this.ctx.scale(this.view.scale, this.view.verticalScale);

        // Рисуем сетку
        this.drawGrid();

        // Рисуем свечи
        this.drawCandles();

        // Рисуем индикаторы
        this.drawIndicators();

        // Восстанавливаем состояние контекста
        this.ctx.restore();

        // Рисуем объемы без трансформации
        this.drawVolume();

        // Рисуем оси и метки поверх трансформаций
        this.drawAxes();
    }

    drawGrid() {
        const { width, height } = this.options;
        const ctx = this.ctx;
        
        ctx.strokeStyle = this.colors.grid;
        ctx.lineWidth = 0.5;
        
        // Вертикальные линии
        const xStep = width / 10;
        for (let x = 0; x <= width; x += xStep) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
        
        // Горизонтальные линии
        const yStep = height / 8;
        for (let y = 0; y <= height; y += yStep) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }
    }

    drawCandles() {
        if (!this.data.candles.length) return;

        const { width, height } = this.options;
        const chartHeight = height * 0.8; // 80% высоты для свечей
        const chartWidth = width - this.options.rightPadding; // Учитываем отступ справа
        
        // Находим мин/макс значения для масштабирования с учетом видимой области
        const visibleStartIndex = Math.max(0, Math.floor(this.view.offset / (chartWidth / this.data.candles.length)));
        const visibleEndIndex = Math.min(this.data.candles.length, Math.ceil((this.view.offset + chartWidth / this.view.scale) / (chartWidth / this.data.candles.length)));
        const visibleCandles = this.data.candles.slice(visibleStartIndex, visibleEndIndex);
        
        const prices = visibleCandles.flatMap(candle => [candle.high, candle.low]);
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        const priceRange = maxPrice - minPrice;
        
        // Вычисляем размеры свечи с учетом масштаба и отступа
        const candleWidth = (chartWidth / this.data.candles.length) * 0.8;
        const candleSpacing = (chartWidth / this.data.candles.length) * 0.2;
        
        // Функция для преобразования цены в координату Y с учетом масштаба
        const priceToY = price => {
            const ratio = (price - minPrice) / priceRange;
            return chartHeight - (ratio * chartHeight * 0.8) - (chartHeight * 0.1);
        };

        // Рисуем только видимые свечи
        visibleCandles.forEach((candle, i) => {
            const index = i + visibleStartIndex;
            const x = index * (candleWidth + candleSpacing);
            const open = priceToY(candle.open);
            const close = priceToY(candle.close);
            const high = priceToY(candle.high);
            const low = priceToY(candle.low);
            
            const isGreen = close <= open;
            this.ctx.strokeStyle = isGreen ? this.colors.candleUp : this.colors.candleDown;
            this.ctx.fillStyle = isGreen ? this.colors.candleUp : this.colors.candleDown;
            
            // Рисуем тень
            this.ctx.beginPath();
            this.ctx.moveTo(x + candleWidth / 2, high);
            this.ctx.lineTo(x + candleWidth / 2, low);
            this.ctx.stroke();
            
            // Рисуем тело свечи
            this.ctx.fillRect(
                x,
                Math.min(open, close),
                candleWidth,
                Math.abs(close - open)
            );
        });
    }

    drawAxes() {
        const ctx = this.ctx;
        const { width, height } = this.options;
        const chartHeight = height * 0.8; // 80% высоты для свечей
        const chartWidth = width - this.options.rightPadding;
        
        // Находим видимый диапазон свечей
        const visibleStartIndex = Math.max(0, Math.floor(this.view.offset / (chartWidth / this.data.candles.length)));
        const visibleEndIndex = Math.min(this.data.candles.length, Math.ceil((this.view.offset + chartWidth / this.view.scale) / (chartWidth / this.data.candles.length)));
        const visibleCandles = this.data.candles.slice(visibleStartIndex, visibleEndIndex);
        
        // Рисуем ось цен для видимого диапазона
        if (visibleCandles.length) {
            ctx.save();
            
            // Применяем только вертикальное масштабирование и смещение
            ctx.translate(0, -this.view.verticalOffset * this.view.verticalScale);
            ctx.scale(1, this.view.verticalScale);
            
            ctx.strokeStyle = this.colors.text;
            ctx.fillStyle = this.colors.text;
            ctx.font = '12px Arial';
            ctx.textAlign = 'right';
            
            const prices = visibleCandles.flatMap(candle => [
                candle.high,
                candle.low
            ]);

            // Добавляем текущую цену в диапазон, если она есть
            if (this.currentPrice !== null) {
                prices.push(this.currentPrice);
            }

            const minPrice = Math.min(...prices);
            const maxPrice = Math.max(...prices);
            const priceRange = maxPrice - minPrice;
            
            // Рисуем метки цен
            for (let i = 0; i <= 8; i++) {
                const y = chartHeight * (i / 8);
                const price = maxPrice - (priceRange * (i / 8));
                ctx.fillText(this.formatPrice(price), width - 5, y + 4);
            }

            // Рисуем линию текущей цены, если она есть
            if (this.currentPrice !== null) {
                const currentPriceY = chartHeight - ((this.currentPrice - minPrice) / priceRange * chartHeight * 0.8) - (chartHeight * 0.1);

                // Рисуем прерывистую линию текущей цены
                ctx.beginPath();
                ctx.strokeStyle = '#FFD700'; // Золотой цвет для текущей цены
                ctx.setLineDash([5, 5]); // Делаем линию прерывистой
                ctx.moveTo(0, currentPriceY);
                ctx.lineTo(chartWidth, currentPriceY);
                ctx.stroke();
                ctx.setLineDash([]); // Возвращаем сплошную линию

                // Рисуем фон для текущей цены справа
                const priceText = this.formatPrice(this.currentPrice);
                const textWidth = ctx.measureText(priceText).width + 10;
                const textHeight = 20;
                ctx.fillStyle = this.colors.background;
                ctx.fillRect(width - textWidth - 5, currentPriceY - textHeight/2, textWidth, textHeight);

                // Рисуем текущую цену справа
                ctx.fillStyle = '#FFD700'; // Тот же золотой цвет
                ctx.textAlign = 'right';
                ctx.fillText(priceText, width - 5, currentPriceY + 4);
            }
            
            ctx.restore();
        }
        
        // Рисуем временную ось
        ctx.save();
        
        // Применяем только горизонтальное смещение и масштабирование для временной оси
        ctx.translate(-this.view.offset * this.view.scale, 0);
        ctx.scale(this.view.scale, 1);
        
        // Рисуем метки времени
        if (this.data.candles.length) {
            ctx.textAlign = 'center';
            const candleWidth = chartWidth / this.data.candles.length;
            const timeStep = Math.ceil(this.data.candles.length / (chartWidth / 100)); // Примерно одна метка на каждые 100 пикселей
            
            for (let i = 0; i < this.data.candles.length; i += timeStep) {
                const candle = this.data.candles[i];
                const x = i * candleWidth;
                const date = new Date(candle.time);
                
                // Форматируем время в зависимости от таймфрейма
                const getTimeFormat = (date, timeframe) => {
                    const timeOptions = { hour: '2-digit', minute: '2-digit' };
                    const dateOptions = { month: '2-digit', day: '2-digit' };
                    
                    switch(timeframe) {
                        case '1m':
                        case '5m':
                        case '15m':
                        case '30m':
                            return date.toLocaleTimeString([], timeOptions);
                        case '1h':
                        case '4h':
                            return `${date.toLocaleDateString([], dateOptions)} ${date.toLocaleTimeString([], timeOptions)}`;
                        case '1d':
                            return date.toLocaleDateString([], dateOptions);
                        case '1w':
                            return date.toLocaleDateString([], { year: 'numeric', month: '2-digit' });
                        default:
                            return date.toLocaleDateString();
                    }
                };
                
                ctx.fillText(
                    getTimeFormat(date, this.options.timeframe),
                    x,
                    height - 5
                );
            }
        }
        
        ctx.restore();
    }

    drawIndicators() {
        if (!this.data.candles.length) return;
        
        // Рисуем EMA
        if (this.data.indicators.ema) {
            this.drawEMA();
        }
        
        // Рисуем RSI
        if (this.data.indicators.rsi) {
            this.drawRSI();
        }
    }

    drawEMA() {
        const ctx = this.ctx;
        const { width, height, rightPadding } = this.options;
        const chartWidth = width - rightPadding;
        
        // Находим мин/макс значения для масштабирования
        const prices = this.data.candles.flatMap(candle => [
            candle.high,
            candle.low
        ]);
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        const priceRange = maxPrice - minPrice;
        
        // Функция для преобразования цены в координату Y
        const priceToY = price => {
            const ratio = (price - minPrice) / priceRange;
            return height - (ratio * height * 0.8) - (height * 0.1);
        };
        
        // Рисуем EMA 20
        if (this.data.indicators.ema.ema20) {
            ctx.strokeStyle = '#2962FF';
            ctx.lineWidth = 1;
            ctx.beginPath();
            
            this.data.indicators.ema.ema20.forEach((value, i) => {
                const x = (i / this.data.candles.length) * chartWidth;
                const y = priceToY(value);
                
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            });
            
            ctx.stroke();
        }
        
        // Рисуем EMA 50
        if (this.data.indicators.ema.ema50) {
            ctx.strokeStyle = '#FF6D00';
            ctx.lineWidth = 1;
            ctx.beginPath();
            
            this.data.indicators.ema.ema50.forEach((value, i) => {
                const x = (i / this.data.candles.length) * chartWidth;
                const y = priceToY(value);
                
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            });
            
            ctx.stroke();
        }
    }

    drawRSI() {
        if (!this.data.indicators.rsi) return;
        
        const ctx = this.ctx;
        const { width, height, rightPadding } = this.options;
        const chartWidth = width - rightPadding;
        
        // Используем нижние 20% графика для RSI
        const rsiHeight = height * 0.2;
        const rsiTop = height * 0.8;
        
        // Рисуем фон для RSI
        ctx.fillStyle = this.colors.background + '80';
        ctx.fillRect(0, rsiTop, chartWidth, rsiHeight);
        
        // Рисуем линии уровней
        ctx.strokeStyle = this.colors.grid;
        ctx.lineWidth = 0.5;
        
        // Ровни 30 и 70
        [30, 70].forEach(level => {
            const y = rsiTop + rsiHeight - (level / 100 * rsiHeight);
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(chartWidth, y);
            ctx.stroke();
            
            // Подписи уровней
            ctx.fillStyle = this.colors.text;
            ctx.font = '10px Arial';
            ctx.textAlign = 'right';
            ctx.fillText(level.toString(), chartWidth - 5, y - 2);
        });
        
        // Рисуем линию RSI
        ctx.strokeStyle = '#E91E63';
        ctx.lineWidth = 1;
        ctx.beginPath();
        
        this.data.indicators.rsi.forEach((value, i) => {
            const x = (i / this.data.indicators.rsi.length) * chartWidth;
            const y = rsiTop + rsiHeight - (value / 100 * rsiHeight);
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        
        ctx.stroke();
    }

    updateIndicators(data) {
        // Рассчитываем EMA
        this.data.indicators.ema = {
            ema20: this.calculateEMA(data.close, 20),
            ema50: this.calculateEMA(data.close, 50),
            ema200: this.calculateEMA(data.close, 200)
        };
        
        // Рассчитываем RSI
        this.data.indicators.rsi = this.calculateRSI(data.close, 14);
        
        // Рассчитываем торговый канал
        this.data.indicators.channel = this.calculatePriceChannel(data.high, data.low, 20);
        
        // Рассчитываем тренд
        this.data.indicators.trend = this.analyzeTrend(data.close);
        
        // Обновляем UI
        this.updateAnalyticsUI();
    }

    calculateEMA(prices, period) {
        const k = 2 / (period + 1);
        let ema = prices[0];
        
        return prices.map(price => {
            ema = price * k + ema * (1 - k);
            return ema;
        });
    }

    calculateRSI(prices, period) {
        // Проверка на пустой массив или недостаточное количество данных
        if (!prices || prices.length < period + 1) {
            return [50]; // Возвращаем нейтральное значение RSI
        }

        const changes = [];
        for (let i = 1; i < prices.length; i++) {
            changes.push(prices[i] - prices[i - 1]);
        }
        
        let gains = changes.map(change => change > 0 ? change : 0);
        let losses = changes.map(change => change < 0 ? -change : 0);
        
        // Проверка на пустые массивы gains и losses
        if (gains.length === 0 || losses.length === 0) {
            return [50];
        }
        
        // Первое среднее с проверкой на пустой срез
        const initialGains = gains.slice(0, period);
        const initialLosses = losses.slice(0, period);
        
        if (initialGains.length === 0 || initialLosses.length === 0) {
            return [50];
        }
        
        let avgGain = initialGains.reduce((a, b) => a + b, 0) / period;
        let avgLoss = initialLosses.reduce((a, b) => a + b, 0) / period;
        
        // Защита от деления на ноль
        if (avgLoss === 0) {
            return [100];
        }
        
        const rsi = [100 - (100 / (1 + avgGain / avgLoss))];
        
        // Последующие значения
        for (let i = period; i < changes.length; i++) {
            avgGain = (avgGain * (period - 1) + gains[i]) / period;
            avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
            
            // Защита от деления на ноль
            if (avgLoss === 0) {
                rsi.push(100);
            } else {
                rsi.push(100 - (100 / (1 + avgGain / avgLoss)));
            }
        }
        
        return rsi;
    }

    calculatePriceChannel(highs, lows, period) {
        const upper = [];
        const lower = [];
        
        for (let i = period - 1; i < highs.length; i++) {
            const highSlice = highs.slice(i - period + 1, i + 1);
            const lowSlice = lows.slice(i - period + 1, i + 1);
            
            upper.push(Math.max(...highSlice));
            lower.push(Math.min(...lowSlice));
        }
        
        return { upper, lower };
    }

    analyzeTrend(prices) {
        const ema20 = this.data.indicators.ema.ema20;
        const ema50 = this.data.indicators.ema.ema50;
        const ema200 = this.data.indicators.ema.ema200;
        
        const lastPrice = prices[prices.length - 1];
        const lastEma20 = ema20[ema20.length - 1];
        const lastEma50 = ema50[ema50.length - 1];
        const lastEma200 = ema200[ema200.length - 1];
        
        let direction = 'боковой';
        let strength = 'слабый';
        
        // Определяем направление тренда
        if (lastEma20 > lastEma50 && lastEma50 > lastEma200) {
            direction = 'восходящий';
        } else if (lastEma20 < lastEma50 && lastEma50 < lastEma200) {
            direction = 'нисходящий';
        }
        
        // Определяем силу тренда
        const ema20Slope = (lastEma20 - ema20[ema20.length - 10]) / 10;
        if (Math.abs(ema20Slope) > 0.5) {
            strength = 'сильный';
        } else if (Math.abs(ema20Slope) > 0.2) {
            strength = 'средний';
        }
        
        return { direction, strength };
    }

    updateAnalyticsUI() {
        try {
            if (!this.data || !this.data.candles || !this.data.indicators) {
                console.log('[CHART] No data for analytics update');
                return;
            }

            const lastCandle = this.data.candles[this.data.candles.length - 1];
            const rsi = this.data.indicators.rsi[this.data.indicators.rsi.length - 1];
            const trend = this.data.indicators.trend;
            const channel = this.data.indicators.channel;

            // Обновляем основную информацию
            this.updateElementText('currentTime', new Date(lastCandle.time).toLocaleTimeString());
            this.updateElementText('currentPrice', this.formatPrice(lastCandle.close));

            // Обновляем RSI и рекомендации
            this.updateElementText('rsiValue', rsi.toFixed(2));
            this.updateElementText('rsiStatus', this.getRsiStatus(rsi));
            this.updateElementText('tradingRecommendation', this.getTradingRecommendation(rsi, trend));

            // Обновляем тренд и объем
            this.updateElementText('trendDirection', trend.direction);
            this.updateElementText('trendStrength', trend.strength);
            this.updateElementText('volume24h', this.formatVolume(lastCandle.volume));
            
            // Вычисляем изменение объема
            const volumeChange = this.calculateVolumeChange();
            this.updateElementText('volumeChange', volumeChange);

            // Обновляем ценовой канал
            const lastUpper = channel.upper[channel.upper.length - 1];
            const lastLower = channel.lower[channel.lower.length - 1];
            this.updateElementText('channelUpper', this.formatPrice(lastUpper));
            this.updateElementText('channelLower', this.formatPrice(lastLower));
            this.updateElementText('channelPosition', this.getChannelPosition(lastCandle.close, lastUpper, lastLower));

            // Обновляем точки входа/выхода
            this.updateEntryExitPoints(lastCandle.close, lastUpper, lastLower);

        } catch (error) {
            console.error('[CHART] Error updating analytics UI:', error);
        }
    }

    updateElementText(elementId, value) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = value;
        }
    }

    calculateVolumeChange() {
        if (!this.data.candles || this.data.candles.length < 2) return '0%';
        
        const currentVolume = this.data.candles[this.data.candles.length - 1].volume;
        const previousVolume = this.data.candles[this.data.candles.length - 2].volume;
        
        const change = ((currentVolume - previousVolume) / previousVolume) * 100;
        const sign = change >= 0 ? '+' : '';
        return `${sign}${change.toFixed(2)}%`;
    }

    updateEntryExitPoints(currentPrice, upperChannel, lowerChannel) {
        const range = upperChannel - lowerChannel;
        const support = lowerChannel;
        const resistance = upperChannel;
        
        // Обновляем уровни поддержки и сопротивления
        this.updateElementText('supportLevel', this.formatPrice(support));
        this.updateElementText('resistanceLevel', this.formatPrice(resistance));
        
        // Оптимальная точка входа - немного выше поддержки
        const entryPoint = support + (range * 0.1);
        this.updateElementText('entryPoint', this.formatPrice(entryPoint));
        
        // Стоп-лосс - немного ниже поддержки
        const stopLoss = support - (range * 0.05);
        this.updateElementText('stopLoss', this.formatPrice(stopLoss));
        
        // Целевая цена - около сопротивления
        const targetPrice = resistance - (range * 0.1);
        this.updateElementText('targetPrice', this.formatPrice(targetPrice));
    }

    getRsiStatus(rsi) {
        if (rsi >= 70) return 'Перекуплен';
        if (rsi <= 30) return 'Перепродан';
        return 'Нейтральный';
    }

    getTradingRecommendation(rsi, trend) {
        if (rsi <= 30 && trend.direction === 'восходящий') {
            return 'Рассмотреть покупку';
        } else if (rsi >= 70 && trend.direction === 'нисходящий') {
            return 'Рассмотреть продажу';
        }
        return 'Ожидание';
    }

    getChannelPosition(price, upper, lower) {
        const range = upper - lower;
        const position = ((price - lower) / range) * 100;
        
        if (position > 80) return 'Верхняя зона';
        if (position < 20) return 'Нижняя зона';
        return 'Средняя зона';
    }

    formatVolume(volume) {
        if (volume >= 1000000000) {
            return (volume / 1000000000).toFixed(2) + 'B';
        }
        if (volume >= 1000000) {
            return (volume / 1000000).toFixed(2) + 'M';
        }
        if (volume >= 1000) {
            return (volume / 1000).toFixed(2) + 'K';
        }
        return volume.toFixed(2);
    }

    formatPrice(price) {
        // Ограничиваем до 10 знаков после запятой и убираем лишние нули
        return Number(Number(price).toFixed(10)).toString();
    }

    // Обработчики событий мыши
    handleMouseMove(e) {
        const rect = this.overlayCanvas.getBoundingClientRect();
        this.view.mouseX = e.clientX - rect.left;
        this.view.mouseY = e.clientY - rect.top;
        
        if (this.view.isDragging) {
            const dx = this.view.mouseX - this.view.lastX;
            const dy = this.view.mouseY - this.view.lastY;
            
            // Инвертируем направление смещения
            this.view.offset -= dx / this.view.scale;
            this.view.verticalOffset -= dy / this.view.verticalScale;
            
            this.view.lastX = this.view.mouseX;
            this.view.lastY = this.view.mouseY;
            this.render();
        }
        
        this.drawCrosshair();
        this.drawTooltip();
    }

    handleMouseDown(e) {
        this.view.isDragging = true;
        this.view.lastX = this.view.mouseX;
        this.view.lastY = this.view.mouseY;
        this.overlayCanvas.style.cursor = 'grabbing';
    }

    handleMouseUp(e) {
        this.view.isDragging = false;
        this.overlayCanvas.style.cursor = 'crosshair';
    }

    handleWheel(e) {
        // No need for e.preventDefault() since we're using passive listener
        
        if (e.ctrlKey) {
            // Vertical scaling with Ctrl key
            const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
            const mouseYBeforeZoom = (this.view.mouseY / this.view.verticalScale) + this.view.verticalOffset;
            
            this.view.verticalScale *= zoomFactor;
            this.view.verticalScale = Math.max(0.1, Math.min(10, this.view.verticalScale));
            
            const mouseYAfterZoom = (this.view.mouseY / this.view.verticalScale) + this.view.verticalOffset;
            this.view.verticalOffset += mouseYBeforeZoom - mouseYAfterZoom;
        } else {
            // Horizontal scaling without Ctrl key
            const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
            const mouseXBeforeZoom = (this.view.mouseX / this.view.scale) + this.view.offset;
            
            this.view.scale *= zoomFactor;
            this.view.scale = Math.max(0.1, Math.min(10, this.view.scale));
            
            const mouseXAfterZoom = (this.view.mouseX / this.view.scale) + this.view.offset;
            this.view.offset += mouseXBeforeZoom - mouseXAfterZoom;
        }
        
        requestAnimationFrame(() => this.render());
    }

    drawCrosshair() {
        const ctx = this.overlayCtx;
        const { width, height } = this.options;
        
        // Очищаем предыдущее перекрестие
        ctx.clearRect(0, 0, width, height);
        
        // Рисуем перекрестие
        ctx.strokeStyle = this.colors.grid;
        ctx.setLineDash([5, 5]);
        ctx.lineWidth = 0.5;
        
        // Вертикальная линия
        ctx.beginPath();
        ctx.moveTo(this.view.mouseX, 0);
        ctx.lineTo(this.view.mouseX, height);
        ctx.stroke();
        
        // Горизонтальная линия
        ctx.beginPath();
        ctx.moveTo(0, this.view.mouseY);
        ctx.lineTo(width, this.view.mouseY);
        ctx.stroke();
        
        ctx.setLineDash([]);
    }

    drawTooltip() {
        if (!this.data.candles.length) return;
        
        const ctx = this.overlayCtx;
        const { width, height } = this.options;
        const chartWidth = width - this.options.rightPadding;
        const chartHeight = height * 0.8; // 80% высоты для графика
        
        // Проверяем, находится ли курсор в пределах области графика
        if (this.view.mouseX < 0 || this.view.mouseX > chartWidth || 
            this.view.mouseY < 0 || this.view.mouseY > chartHeight) {
            return;
        }
        
        // Находим индекс свечи под курсором с учетом масштабирования
        const candleWidth = (chartWidth / this.data.candles.length) * 0.8;
        const spacing = (chartWidth / this.data.candles.length) * 0.2;
        
        // Учитываем смещение и масштаб при расчете индекса
        const mouseXScaled = (this.view.mouseX + this.view.offset * this.view.scale) / this.view.scale;
        const index = Math.floor(mouseXScaled / (candleWidth + spacing));
        
        if (index >= 0 && index < this.data.candles.length) {
            const candle = this.data.candles[index];
            const volume = this.data.volume[index];
            
            // Форматируем время в зависимости от таймфрейма
            const getTimeFormat = (date, timeframe) => {
                const timeOptions = { hour: '2-digit', minute: '2-digit', second: '2-digit' };
                const dateOptions = { year: 'numeric', month: '2-digit', day: '2-digit' };
                
                switch(timeframe) {
                    case '1m':
                    case '5m':
                    case '15m':
                    case '30m':
                        return `${date.toLocaleDateString([], dateOptions)} ${date.toLocaleTimeString([], timeOptions)}`;
                    case '1h':
                    case '4h':
                        return `${date.toLocaleDateString([], dateOptions)} ${date.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}`;
                    case '1d':
                        return date.toLocaleDateString([], dateOptions);
                    case '1w':
                        return `${date.toLocaleDateString([], dateOptions)} (W${Math.ceil(date.getDate() / 7)})`;
                    default:
                        return date.toLocaleString();
                }
            };

            const date = new Date(candle.time);
            const formattedTime = getTimeFormat(date, this.options.timeframe);
            
            // Определяем количество знаков после запятой
            const getPrecision = (price) => {
                if (price < 0.1) return 6;
                if (price < 1) return 4;
                if (price < 10) return 3;
                return 2;
            };
            
            const precision = getPrecision(candle.close);
            
            const tooltip = [
                `Время: ${formattedTime}`,
                `Открытие: ${candle.open.toFixed(precision)}`,
                `Максимум: ${candle.high.toFixed(precision)}`,
                `Минимум: ${candle.low.toFixed(precision)}`,
                `Закрытие: ${candle.close.toFixed(precision)}`,
                `Объем: ${volume.value.toFixed(2)}`
            ];
            
            // Рисуем фон тултипа
            ctx.fillStyle = this.colors.background + 'E6';
            ctx.strokeStyle = this.colors.grid;
            
            const padding = 5;
            const lineHeight = 20;
            const tooltipWidth = 200;
            const tooltipHeight = (tooltip.length + 1) * lineHeight;
            
            let tooltipX = this.view.mouseX + 10;
            let tooltipY = this.view.mouseY + 10;
            
            // Проверяем, не выходит ли тултип за границы
            if (tooltipX + tooltipWidth > width) {
                tooltipX = this.view.mouseX - tooltipWidth - 10;
            }
            if (tooltipY + tooltipHeight > height) {
                tooltipY = height - tooltipHeight - 10;
            }
            
            // Рисуем фон
            ctx.fillRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight);
            ctx.strokeRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight);
            
            // Рисуем текст
            ctx.fillStyle = this.colors.text;
            ctx.textAlign = 'left';
            ctx.font = '12px Arial';
            
            tooltip.forEach((line, i) => {
                ctx.fillText(line, tooltipX + padding, tooltipY + (i + 1) * lineHeight);
            });
        }
    }

    drawVolume() {
        if (!this.data.candles.length) return;

        const { width, height } = this.options;
        const volumeHeight = height * 0.2; // 20% высоты для объемов
        const volumeTop = height - volumeHeight;
        const chartWidth = width - this.options.rightPadding; // Учитываем отступ справа

        // Находим максимальный объем для масштабирования
        const maxVolume = Math.max(...this.data.volume.map(v => v.value));

        // Вычисляем размеры баров объема с учетом отступа
        const barWidth = (chartWidth / this.data.candles.length) * 0.8;
        const spacing = (chartWidth / this.data.candles.length) * 0.2;

        // Сохраняем контекст для объемов
        this.ctx.save();
        
        // Применяем только горизонтальное смещение и масштабирование
        this.ctx.translate(-this.view.offset * this.view.scale, 0);
        this.ctx.scale(this.view.scale, 1);

        // Рисуем объемы
        this.data.volume.forEach((volume, i) => {
            const x = i * (barWidth + spacing);
            const volumeRatio = volume.value / maxVolume;
            const barHeight = volumeHeight * volumeRatio;

            this.ctx.fillStyle = volume.color;
            this.ctx.fillRect(
                x,
                height - barHeight,
                barWidth,
                barHeight
            );
        });

        this.ctx.restore();
        
        // Рисуем горизонтальную линию, отделяющую объемы
        this.ctx.strokeStyle = this.colors.grid;
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(0, volumeTop);
        this.ctx.lineTo(chartWidth, volumeTop);
        this.ctx.stroke();

        // Добавляем метки объема справа
        this.ctx.fillStyle = this.colors.text;
        this.ctx.textAlign = 'right';
        this.ctx.font = '10px Arial';

        const volumeSteps = 4;
        for (let i = 0; i <= volumeSteps; i++) {
            const y = volumeTop + (volumeHeight * (volumeSteps - i) / volumeSteps);
            const volume = (maxVolume * i / volumeSteps).toFixed(0);
            this.ctx.fillText(volume, chartWidth - 5, y + 4);
        }
    }

    // Добавляем функцию форматирования цены
    formatPrice(price) {
        // Ограничиваем до 10 знаков после запятой и убираем лишние нули
        return Number(Number(price).toFixed(10)).toString();
    }

    processDataSync(data) {
        console.time('processData');
        
        // Определяем интервал для свечей в зависимости от таймфрейма
        const timeframeToInterval = {
            '1m': 60,
            '5m': 300,
            '15m': 900,
            '30m': 1800,
            '1h': 3600,
            '4h': 14400,
            '1d': 86400,
            '1w': 604800,
            'all': null
        };
        
        const interval = timeframeToInterval[this.options.timeframe];
        if (!interval && this.options.timeframe !== 'all') {
            console.warn('Unknown timeframe:', this.options.timeframe);
            return;
        }

        // Группируем данные по интервалу
        let groupedData = this.options.timeframe === 'all' ? data : this.groupDataByInterval(data, interval);
        
        // Преобразуем данные в формат для отображения
        this.data.candles = groupedData.map(d => ({
            time: d.timestamp,
            open: d.open,
            high: d.high,
            low: d.low,
            close: d.close
        }));

        this.data.volume = groupedData.map(d => ({
            time: d.timestamp,
            value: d.volume,
            color: d.close >= d.open ? this.colors.candleUp : this.colors.candleDown
        }));

        console.timeEnd('processData');
        this.render();
    }

    groupDataByInterval(data, interval) {
        const groups = {};
        
        data.times.forEach((time, i) => {
            const timestamp = Math.floor(time / interval) * interval;
            if (!groups[timestamp]) {
                groups[timestamp] = {
                    timestamp,
                    open: data.open[i],
                    high: data.high[i],
                    low: data.low[i],
                    close: data.close[i],
                    volume: data.volume[i]
                };
            } else {
                groups[timestamp].high = Math.max(groups[timestamp].high, data.high[i]);
                groups[timestamp].low = Math.min(groups[timestamp].low, data.low[i]);
                groups[timestamp].close = data.close[i];
                groups[timestamp].volume += data.volume[i];
            }
        });

        return Object.values(groups).sort((a, b) => a.timestamp - b.timestamp);
    }

    // Добавляем метод для обновления текущей цены
    updateCurrentPrice(price) {
        this.currentPrice = price;
        this.render();
    }

    // Метод для обновления заголовка графика
    updateTitle() {
        const container = document.getElementById(this.containerId);
        if (!container) return;

        // Создаем элемент для отображения заголовка, если он еще не существует
        let titleElement = container.querySelector('.chart-title');
        if (!titleElement) {
            titleElement = document.createElement('div');
            titleElement.className = 'chart-title';
            titleElement.style.position = 'absolute';
            titleElement.style.top = '10px';
            titleElement.style.left = '10px';
            titleElement.style.color = this.colors.text; // Устанавливаем цвет текста
            titleElement.style.zIndex = '10'; // Устанавливаем z-index выше других элементов
            container.appendChild(titleElement);
        }

        // Обновляем текст заголовка
        titleElement.textContent = `${this.ticker} - ${this.options.timeframe}`;
    }

    // Метод для обновления тикера
    updateTicker(newTicker) {
        this.ticker = newTicker;
        this.updateTitle(); // Обновляем заголовок при изменении тикера
    }
} 