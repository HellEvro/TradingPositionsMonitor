class StatisticsManager {
    constructor() {
        Logger.info('STATS', 'Initializing StatisticsManager');
        
        // Подписываемся на изменения состояния
        this.unsubscribers = [
            stateManager.subscribe('app.theme', this.handleThemeChange.bind(this)),
            stateManager.subscribe('positions.data', this.handlePositionsUpdate.bind(this))
        ];

        // Инициализируем состояние
        const state = stateManager.getState('statistics');
        this.chartData = {
            labels: state?.chartData?.labels || [],
            values: state?.chartData?.values || []
        };
        
        this.chartId = `chart_${Math.random().toString(36).substr(2, 9)}`;
        this.chart = null;
        this.isFirstUpdate = true;

        // Сохраняем начальное состояние
        stateManager.setState('statistics.chartData', this.chartData);
        stateManager.setState('statistics.isLoading', false);

        // Инициализируем график только если мы на странице позиций
        if (document.querySelector('.positions-container')) {
            requestAnimationFrame(() => this.initializeChart());
        }
    }

    handlePositionsUpdate(data) {
        if (data?.stats) {
            this.updateStats(data.stats);
        }
    }

    handleThemeChange(newTheme) {
        Logger.debug('STATS', `Theme changed to: ${newTheme}`);
        this.updateChartTheme(newTheme);
    }

    updateStats(stats) {
        try {
            Logger.debug('STATS', 'Updating statistics:', stats);
            stateManager.setState('statistics.isUpdating', true);

            // Обновляем значения статистики
            this.updateStatValues(stats);
            
            // Обновляем график
            this.updateChart(stats.total_pnl);

            stateManager.setState('statistics.lastUpdate', new Date().toISOString());
            stateManager.setState('statistics.data', stats);

        } catch (error) {
            Logger.error('STATS', 'Error updating statistics:', error);
            stateManager.setState('statistics.error', error.message);
        } finally {
            stateManager.setState('statistics.isUpdating', false);
        }
    }

    updateStatValues(stats) {
        const updates = {
            'total-pnl': { value: stats.total_pnl, useSign: true },
            'total-profit': { value: stats.total_profit },
            'total-loss': { value: stats.total_loss },
            'total-trades': { value: stats.total_trades },
            'total-high-profitable': { value: stats.high_profitable_count },
            'total-all-profitable': { value: stats.profitable_count },
            'total-losing': { value: stats.losing_count }
        };

        Object.entries(updates).forEach(([elementId, { value, useSign }]) => {
            this.updateStatValue(elementId, value, useSign);
        });
    }

    updateStatValue(elementId, value, useSign = false) {
        const element = document.getElementById(elementId);
        if (!element) return;

        const isTradeCount = [
            'total-trades',
            'total-high-profitable',
            'total-all-profitable',
            'total-losing'
        ].includes(elementId);

        element.textContent = isTradeCount ? 
            Math.round(value) : 
            `${formatUtils.formatNumber(value)} USDT`;

        if (useSign) {
            element.className = `stats-value ${value >= 0 ? 'positive' : 'negative'}`;
        }
    }

    updateChart(totalPnl) {
        if (!this.chart) {
            Logger.warn('STATS', 'Chart not initialized');
            return;
        }

        try {
            const timeLabel = formatUtils.formatTime(new Date());
            this.chartData.labels.push(timeLabel);
            this.chartData.values.push(totalPnl);

            if (this.chartData.labels.length > CHART_CONFIG.MAX_DATA_POINTS) {
                this.chartData.labels.shift();
                this.chartData.values.shift();
            }

            this.chart.data.labels = this.chartData.labels;
            this.chart.data.datasets[0].data = this.chartData.values;
            this.updateChartTheme(stateManager.getState('app.theme'));

            stateManager.setState('statistics.chartData', this.chartData);

            requestAnimationFrame(() => this.chart.update());
        } catch (error) {
            Logger.error('STATS', 'Error updating chart:', error);
        }
    }

    updateChartTheme(theme) {
        if (!this.chart) return;

        try {
            const colors = theme === 'light' ? CHART_THEMES.LIGHT : CHART_THEMES.DARK;
            const totalPnl = this.chartData.values[this.chartData.values.length - 1] || 0;

            this.chart.data.datasets[0].borderColor = totalPnl >= 0 ? colors.UPTREND : colors.DOWNTREND;
            this.chart.data.datasets[0].backgroundColor = this.hexToRgba(
                totalPnl >= 0 ? colors.UPTREND : colors.DOWNTREND,
                0.2
            );

            this.chart.update();
        } catch (error) {
            Logger.error('STATS', 'Error updating chart theme:', error);
        }
    }

    destroy() {
        // Отписываемся от всех подписок
        this.unsubscribers.forEach(unsubscribe => unsubscribe());
        
        // Уничтожаем график
        this.destroyChart();
        
        // Очищаем данные
        this.chartData = { labels: [], values: [] };
        stateManager.setState('statistics.chartData', this.chartData);
    }

    destroyChart() {
        Logger.info('STATS', 'Destroying chart');
        if (this.chart) {
            try {
                this.chart.destroy();
                this.chart = null;
                
                if (Chart.getChart(this.chartId)) {
                    Chart.getChart(this.chartId).destroy();
                }
            } catch (error) {
                Logger.error('STATS', 'Error destroying chart:', error);
            }
        }
    }

    initializeChart() {
        try {
            Logger.info('STATS', 'Initializing chart');
            this.destroyChart();

            const ctx = document.getElementById('pnlChart');
            if (!ctx) {
                Logger.warn('STATS', 'Chart canvas not found');
                return;
            }

            this.chart = new Chart(ctx, {
                id: this.chartId,
                type: 'line',
                data: {
                    labels: this.chartData.labels,
                    datasets: [{
                        label: 'Total P&L',
                        data: this.chartData.values,
                        borderColor: '#4CAF50',
                        backgroundColor: 'rgba(76, 175, 80, 0.1)',
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: false,
                    scales: {
                        y: {
                            beginAtZero: false,
                            grid: {
                                color: 'rgba(255, 255, 255, 0.1)'
                            }
                        },
                        x: {
                            grid: {
                                display: false
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            display: false
                        }
                    }
                }
            });

            Logger.info('STATS', 'Chart initialized successfully');
        } catch (error) {
            Logger.error('STATS', 'Error initializing chart:', error);
            NotificationManager.error('Error initializing statistics chart');
        }
    }

    hexToRgba(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
}

// Экспортируем класс
window.StatisticsManager = StatisticsManager; 