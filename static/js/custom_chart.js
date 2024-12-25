// Оборачиваем класс в IIFE для предотвращения утечек в глобальную область
(function(global) {
    'use strict';

    console.log('[CHART] Инициализация модуля графика');

    class CustomChart {
        constructor(containerId, options = {}) {
            console.log('[CHART] Создание графика для контейнера:', containerId);
            
            if (!containerId) {
                throw new Error('Не указан ID контейнера для графика');
            }

            this.containerId = containerId;
            this.options = {
                theme: options.theme || 'dark',
                gridColor: options.gridColor || '#2B2B43',
                textColor: options.textColor || '#d1d4dc',
                upColor: options.upColor || '#26a69a',
                downColor: options.downColor || '#ef5350',
                ...options
            };

            this.canvas = null;
            this.ctx = null;
            this.data = [];
            this.indicators = {};
            this.scale = {
                min: 0,
                max: 0,
                priceStep: 0,
                timeStep: 0
            };

            // Инициализируем график
            this.initializeChart();
            this.setupResizeHandler();
        }

        initializeChart() {
            const container = document.getElementById(this.containerId);
            if (!container) {
                console.error('Контейнер графика не найден:', this.containerId);
                return;
            }

            // Создаем canvas
            this.canvas = document.createElement('canvas');
            container.innerHTML = '';
            container.appendChild(this.canvas);
            this.ctx = this.canvas.getContext('2d');

            // Устанавливаем размеры
            this.resizeCanvas();
        }

        resizeCanvas() {
            const container = document.getElementById(this.containerId);
            if (!container || !this.canvas) return;

            // Получаем размеры контейнера
            const rect = container.getBoundingClientRect();
            
            // Устанавливаем размеры canvas с учетом pixel ratio
            const dpr = window.devicePixelRatio || 1;
            this.canvas.width = rect.width * dpr;
            this.canvas.height = rect.height * dpr;
            
            // Устанавливаем CSS размеры
            this.canvas.style.width = `${rect.width}px`;
            this.canvas.style.height = `${rect.height}px`;
            
            // Масштабируем контекст
            this.ctx.scale(dpr, dpr);
            
            // Перерисовываем график
            if (this.data.length > 0) {
                this.render();
            }
        }

        setupResizeHandler() {
            const resizeObserver = new ResizeObserver(() => {
                this.resizeCanvas();
            });
            
            const container = document.getElementById(this.containerId);
            if (container) {
                resizeObserver.observe(container);
            }
        }

        calculateScale() {
            if (this.data.length === 0) return;

            // Находим минимум и максимум цен
            let minPrice = Infinity;
            let maxPrice = -Infinity;
            
            this.data.forEach(candle => {
                minPrice = Math.min(minPrice, candle.low);
                maxPrice = Math.max(maxPrice, candle.high);
            });

            // Добавляем отступы сверху и снизу
            const padding = (maxPrice - minPrice) * 0.1;
            this.scale.min = minPrice - padding;
            this.scale.max = maxPrice + padding;
            
            // Вычисляем шаг цены
            const priceRange = this.scale.max - this.scale.min;
            this.scale.priceStep = priceRange / 10;

            // Вычисляем шаг времени
            this.scale.timeStep = Math.max(1, Math.floor(this.data.length / 10));
        }

        render() {
            if (!this.ctx || !this.canvas || this.data.length === 0) return;

            const { width, height } = this.canvas;
            const ctx = this.ctx;

            // Очи��аем canvas
            ctx.clearRect(0, 0, width, height);

            // Рассчитываем масштаб
            this.calculateScale();

            // Рисуем сетку и метки
            this.drawGrid();

            // Рисуем свечи
            this.drawCandles();

            // Рисуем индикаторы
            this.drawIndicators();
        }

        drawGrid() {
            const ctx = this.ctx;
            const width = this.canvas.width;
            const height = this.canvas.height;

            ctx.strokeStyle = this.options.gridColor;
            ctx.lineWidth = 0.5;
            ctx.beginPath();

            // Горизонтальные линии
            for (let i = 0; i <= 10; i++) {
                const y = (height * i) / 10;
                ctx.moveTo(0, y);
                ctx.lineTo(width, y);
                
                // Рисуем метки цен
                const price = this.scale.max - (i * (this.scale.max - this.scale.min) / 10);
                ctx.fillStyle = this.options.textColor;
                ctx.textAlign = 'right';
                ctx.fillText(price.toFixed(2), width - 5, y - 5);
            }

            // Вертикальные линии
            const candleWidth = width / (this.data.length + 2);
            for (let i = 0; i < this.data.length; i += this.scale.timeStep) {
                const x = candleWidth * (i + 1);
                ctx.moveTo(x, 0);
                ctx.lineTo(x, height);
                
                // Рисуем метки времени
                const timestamp = this.data[i].time;
                const date = new Date(timestamp * 1000);
                const timeStr = date.toLocaleTimeString();
                ctx.fillStyle = this.options.textColor;
                ctx.textAlign = 'center';
                ctx.fillText(timeStr, x, height - 5);
            }

            ctx.stroke();
        }

        drawCandles() {
            const ctx = this.ctx;
            const width = this.canvas.width;
            const height = this.canvas.height;
            const priceRange = this.scale.max - this.scale.min;
            const candleWidth = width / (this.data.length + 2);

            this.data.forEach((candle, i) => {
                const x = candleWidth * (i + 1);
                
                // Преобразуем цены в координаты
                const open = height - ((candle.open - this.scale.min) / priceRange * height);
                const close = height - ((candle.close - this.scale.min) / priceRange * height);
                const high = height - ((candle.high - this.scale.min) / priceRange * height);
                const low = height - ((candle.low - this.scale.min) / priceRange * height);

                // Определяем цвет свечи
                const isGreen = candle.close >= candle.open;
                ctx.strokeStyle = isGreen ? this.options.upColor : this.options.downColor;
                ctx.fillStyle = isGreen ? this.options.upColor : this.options.downColor;

                // Рисуем тень
                ctx.beginPath();
                ctx.moveTo(x, high);
                ctx.lineTo(x, low);
                ctx.stroke();

                // Рисуем тело свечи
                const candleHeight = Math.abs(close - open);
                const y = Math.min(open, close);
                const bodyWidth = candleWidth * 0.8;
                
                ctx.fillRect(
                    x - bodyWidth / 2,
                    y,
                    bodyWidth,
                    Math.max(1, candleHeight)
                );
            });
        }

        drawIndicators() {
            // Здесь будет отрисовка индикаторов
            // Добавим позже
        }

        updateData(data) {
            if (!data || !data.times || !data.close) {
                console.error('Неверные данные для графика:', data);
                return;
            }

            try {
                // Преобразуем данные в нужный формат
                this.data = data.times.map((time, i) => ({
                    time: time / 1000,
                    open: parseFloat(data.open[i]),
                    high: parseFloat(data.high[i]),
                    low: parseFloat(data.low[i]),
                    close: parseFloat(data.close[i]),
                    volume: parseFloat(data.volume[i])
                })).filter(candle => (
                    !isNaN(candle.open) && 
                    !isNaN(candle.high) && 
                    !isNaN(candle.low) && 
                    !isNaN(candle.close)
                ));

                // Перерисовываем график
                this.render();
            } catch (error) {
                console.error('Ошибка при обновлении данных графика:', error);
            }
        }

        destroy() {
            const container = document.getElementById(this.containerId);
            if (container) {
                container.innerHTML = '';
            }
            this.canvas = null;
            this.ctx = null;
            this.data = [];
        }
    }

    // Экспортируем класс в глобальную область
    global.CustomChart = CustomChart;

    // Сообщаем о готовности класса
    console.log('[CHART] Класс CustomChart успешно загружен');

    // Отправляем событие о готовности модуля
    const event = new CustomEvent('customChartLoaded');
    global.dispatchEvent(event);

})(typeof window !== 'undefined' ? window : global); 