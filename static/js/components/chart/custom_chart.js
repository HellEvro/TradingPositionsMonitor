console.log('[CHART] Инициализация модуля графика');

class CustomChart {
    constructor(container, data, options = {}) {
        this.container = container;
        this.data = data;
        this.options = {
            width: options.width || container.offsetWidth,
            height: options.height || container.offsetHeight,
            padding: options.padding || 40,
            backgroundColor: options.backgroundColor || '#131722',
            candleColors: {
                up: options.upColor || '#26a69a',
                down: options.downColor || '#ef5350'
            },
            volumeColors: {
                up: options.volumeUpColor || '#26a69a55',
                down: options.volumeDownColor || '#ef535055'
            }
        };

        this.canvas = document.createElement('canvas');
        this.canvas.width = this.options.width;
        this.canvas.height = this.options.height;
        this.container.innerHTML = '';
        this.container.appendChild(this.canvas);
        
        this.ctx = this.canvas.getContext('2d');
        this.calculateScales();
        this.render();
    }

    calculateScales() {
        // Находим min/max значения для цен и объемов
        let minPrice = Infinity;
        let maxPrice = -Infinity;
        let maxVolume = -Infinity;

        this.data.forEach(candle => {
            minPrice = Math.min(minPrice, candle.low);
            maxPrice = Math.max(maxPrice, candle.high);
            maxVolume = Math.max(maxVolume, candle.volume);
        });

        // Добавляем отступ к min/max ценам
        const priceMargin = (maxPrice - minPrice) * 0.1;
        this.priceScale = {
            min: minPrice - priceMargin,
            max: maxPrice + priceMargin
        };

        this.volumeScale = {
            min: 0,
            max: maxVolume
        };

        // Рассчитываем ширину одной свечи
        const chartWidth = this.options.width - 2 * this.options.padding;
        this.candleWidth = Math.max(1, Math.floor(chartWidth / this.data.length));
        this.candleSpacing = Math.max(1, Math.floor(this.candleWidth * 0.2));
    }

    render() {
        this.ctx.fillStyle = this.options.backgroundColor;
        this.ctx.fillRect(0, 0, this.options.width, this.options.height);

        // Разделяем график на две части: для цен и для объемов
        const priceChartHeight = this.options.height * 0.7;
        const volumeChartHeight = this.options.height * 0.2;

        // Отрисовываем свечи и объемы
        this.data.forEach((candle, index) => {
            const x = this.options.padding + index * (this.candleWidth + this.candleSpacing);
            
            // Отрисовка свечи
            const isGreen = candle.close >= candle.open;
            const color = isGreen ? this.options.candleColors.up : this.options.candleColors.down;
            
            const openY = this.priceToY(candle.open, priceChartHeight);
            const closeY = this.priceToY(candle.close, priceChartHeight);
            const highY = this.priceToY(candle.high, priceChartHeight);
            const lowY = this.priceToY(candle.low, priceChartHeight);

            // Тело свечи
            this.ctx.fillStyle = color;
            this.ctx.fillRect(
                x,
                Math.min(openY, closeY),
                this.candleWidth,
                Math.abs(closeY - openY) || 1
            );

            // Тени свечи
            this.ctx.beginPath();
            this.ctx.strokeStyle = color;
            this.ctx.moveTo(x + this.candleWidth / 2, highY);
            this.ctx.lineTo(x + this.candleWidth / 2, Math.min(openY, closeY));
            this.ctx.moveTo(x + this.candleWidth / 2, Math.max(openY, closeY));
            this.ctx.lineTo(x + this.candleWidth / 2, lowY);
            this.ctx.stroke();

            // Отрисовка объема
            const volumeColor = isGreen ? this.options.volumeColors.up : this.options.volumeColors.down;
            const volumeHeight = (candle.volume / this.volumeScale.max) * volumeChartHeight;
            const volumeY = this.options.height - this.options.padding - volumeHeight;

            this.ctx.fillStyle = volumeColor;
            this.ctx.fillRect(
                x,
                volumeY,
                this.candleWidth,
                volumeHeight
            );
        });

        // Отрисовываем оси и метки
        this.drawAxes(priceChartHeight, volumeChartHeight);
    }

    priceToY(price, chartHeight) {
        const scale = chartHeight / (this.priceScale.max - this.priceScale.min);
        return this.options.padding + (this.priceScale.max - price) * scale;
    }

    drawAxes(priceChartHeight, volumeChartHeight) {
        this.ctx.strokeStyle = '#363c4e';
        this.ctx.fillStyle = '#787b86';
        this.ctx.font = '10px Arial';

        // Горизонтальные линии и метки цен
        const priceStep = (this.priceScale.max - this.priceScale.min) / 5;
        for (let i = 0; i <= 5; i++) {
            const price = this.priceScale.min + priceStep * i;
            const y = this.priceToY(price, priceChartHeight);

            this.ctx.beginPath();
            this.ctx.moveTo(this.options.padding, y);
            this.ctx.lineTo(this.options.width - this.options.padding, y);
            this.ctx.stroke();

            this.ctx.fillText(
                price.toFixed(price < 1 ? 6 : 2),
                5,
                y + 4
            );
        }

        // Метки объемов
        const volumeY = this.options.height - this.options.padding - volumeChartHeight;
        this.ctx.fillText(
            'Volume',
            5,
            volumeY - 5
        );
    }

    // Метод для обновления данных
    updateData(newData) {
        this.data = newData;
        this.calculateScales();
        this.render();
    }
}

// Экспортируем класс в глобальную область видимости
window.CustomChart = CustomChart; 