class PnLChart {
    constructor(canvasId) {
        const existingChart = Chart.getChart(canvasId);
        if (existingChart) {
            existingChart.destroy();
        }

        this.canvasId = canvasId;
        this.ctx = document.getElementById(canvasId).getContext('2d');
        this.chart = null;
        this.pnlHistory = [];
        this.lastUpdate = Date.now();
        
        this.initChart();
    }

    initChart() {
        if (this.chart) {
            this.chart.destroy();
        }

        this.chart = new Chart(this.ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'PnL',
                    data: [],
                    borderColor: CHART_CONFIG.DEFAULT_COLOR.POSITIVE.BORDER,
                    backgroundColor: CHART_CONFIG.DEFAULT_COLOR.POSITIVE.BACKGROUND,
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: false
                    }
                }
            }
        });
    }

    addDataPoint(pnl) {
        const now = Date.now();
        if (now - this.lastUpdate >= CHART_CONFIG.UPDATE_INTERVAL * 1000) {
            const currentTime = formatUtils.formatTime(new Date());
            
            this.pnlHistory.push({
                time: currentTime,
                value: pnl
            });

            if (this.pnlHistory.length > CHART_CONFIG.MAX_DATA_POINTS) {
                this.pnlHistory.shift();
            }

            this.updateChart(pnl);
            this.lastUpdate = now;
        }
    }

    updateChart(currentPnL) {
        if (!this.chart) return;

        this.chart.data.labels = this.pnlHistory.map(item => item.time);
        this.chart.data.datasets[0].data = this.pnlHistory.map(item => item.value);
        
        const colors = currentPnL >= 0 ? 
            CHART_CONFIG.DEFAULT_COLOR.POSITIVE : 
            CHART_CONFIG.DEFAULT_COLOR.NEGATIVE;

        this.chart.data.datasets[0].borderColor = colors.BORDER;
        this.chart.data.datasets[0].backgroundColor = colors.BACKGROUND;
        
        this.chart.update();
    }

    // Добавляем первую точку при инициализации
    addInitialPoint(pnl) {
        const currentTime = formatUtils.formatTime(new Date());
        this.pnlHistory.push({
            time: currentTime,
            value: pnl
        });
        this.updateChart(pnl);
    }

    // Добавляем метод для очистки
    destroy() {
        if (this.chart) {
            this.chart.destroy();
            this.chart = null;
        }
        this.pnlHistory = [];
        this.lastUpdate = Date.now();
    }
} 