class StatisticsManager {
    constructor() {
        console.log('StatisticsManager: Initializing...');
        this.chartData = {
            labels: [],
            values: []
        };
        this.isFirstUpdate = true;
        this.lastChartUpdate = 0;
        this.initializeChart();
    }

    initializeChart() {
        if (this.pnlChart) {
            this.pnlChart.destroy();
        }
        const ctx = document.getElementById(DOM_IDS.PNL_CHART);
        if (!ctx) {
            console.error('StatisticsManager: Chart canvas not found');
            return;
        }
        
        this.pnlChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: this.chartData.labels,
                datasets: [{
                    label: 'Total P&L',
                    data: this.chartData.values,
                    borderColor: CHART_CONFIG.DEFAULT_COLOR.POSITIVE.BORDER,
                    backgroundColor: CHART_CONFIG.DEFAULT_COLOR.POSITIVE.BACKGROUND,
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
    }

    updateStats(stats) {
        if (!stats) {
            console.warn('StatisticsManager: No stats data received');
            return;
        }

        try {
            this.updateStatValue('total-pnl', stats.total_pnl, true);
            this.updateStatValue('total-profit', stats.total_profit);
            this.updateStatValue('total-loss', stats.total_loss);
            this.updateStatValue('total-trades', stats.total_trades);
            this.updateStatValue('total-high-profitable', stats.high_profitable_count);
            this.updateStatValue('total-all-profitable', stats.profitable_count);
            this.updateStatValue('total-losing', stats.losing_count);

            if (stats.top_profitable) {
                this.updateTopPositions('top-profitable', stats.top_profitable, true);
            }
            if (stats.top_losing) {
                this.updateTopPositions('top-losing', stats.top_losing, false);
            }

            if (this.isFirstUpdate) {
                console.log('First update, initializing chart with PnL:', stats.total_pnl);
                const timeLabel = formatUtils.formatTime(new Date());
                this.updateChart(stats.total_pnl, timeLabel);
                this.isFirstUpdate = false;
                this.lastChartUpdate = Date.now();
            } else {
                const currentTime = Date.now();
                if (currentTime - this.lastChartUpdate >= CHART_UPDATE_INTERVAL) {
                    console.log('Updating chart with PnL:', stats.total_pnl);
                    const timeLabel = formatUtils.formatTime(new Date());
                    this.updateChart(stats.total_pnl, timeLabel);
                    this.lastChartUpdate = currentTime;
                }
            }
        } catch (error) {
            console.error('StatisticsManager: Error updating statistics:', error);
            console.error('Error details:', error.stack);
        }
    }

    updateChart(totalPnl, timeLabel) {
        if (!this.pnlChart) {
            console.warn('StatisticsManager: Chart not initialized');
            return;
        }

        try {
            this.chartData.labels.push(timeLabel);
            this.chartData.values.push(totalPnl);

            if (this.chartData.labels.length > CHART_CONFIG.MAX_DATA_POINTS) {
                this.chartData.labels.shift();
                this.chartData.values.shift();
            }

            this.pnlChart.data.labels = this.chartData.labels;
            this.pnlChart.data.datasets[0].data = this.chartData.values;
            this.updateChartColors(totalPnl);

            requestAnimationFrame(() => {
                this.pnlChart.update();
            });

            console.log('Chart updated. Points:', this.chartData.values.length, 'Last value:', totalPnl);
        } catch (error) {
            console.error('StatisticsManager: Error updating chart:', error);
        }
    }

    updateChartColors(totalPnl) {
        const theme = document.body.getAttribute('data-theme') === 'light' ? 'LIGHT' : 'DARK';
        const colors = totalPnl >= 0 ? 
            {
                BORDER: CHART_THEMES[theme].UPTREND,
                BACKGROUND: this.hexToRgba(CHART_THEMES[theme].UPTREND, 0.2)
            } : 
            {
                BORDER: CHART_THEMES[theme].DOWNTREND,
                BACKGROUND: this.hexToRgba(CHART_THEMES[theme].DOWNTREND, 0.2)
            };
        
        this.pnlChart.data.datasets[0].borderColor = colors.BORDER;
        this.pnlChart.data.datasets[0].backgroundColor = colors.BACKGROUND;
    }

    updateStatValue(elementId, value, useSign = false) {
        const element = domUtils.getElement(elementId);
        if (!element) return;

        const isTradeCount = [
            'total-trades',
            'total-high-profitable',
            'total-all-profitable',
            'total-losing'
        ].includes(elementId);

        if (isTradeCount) {
            element.textContent = Math.round(value);
        } else {
            element.textContent = `${formatUtils.formatNumber(value)} USDT`;
        }

        if (useSign) {
            element.className = `stats-value ${value >= 0 ? CSS_CLASSES.POSITIVE : CSS_CLASSES.NEGATIVE}`;
        }
    }

    updateTopPositions(elementId, positions, isProfit = true) {
        if (!positions || !Array.isArray(positions)) {
            console.warn(`StatisticsManager: Invalid positions data for ${elementId}`);
            return;
        }

        console.log(`StatisticsManager: Updating ${elementId} with ${positions.length} positions`);
        
        const html = positions.map(pos => {
            const pnlValue = isProfit ? pos.pnl : -Math.abs(pos.pnl);
            return `
                <div class="stats-value ${isProfit ? CSS_CLASSES.POSITIVE : CSS_CLASSES.NEGATIVE}">
                    <a href="https://www.bybit.com/trade/usdt/${pos.symbol}USDT" 
                       target="_blank" 
                       class="ticker">
                        ${pos.symbol}
                    </a>
                    <span style="margin-left: 10px;">
                        ${formatUtils.formatNumber(pnlValue)} USDT
                    </span>
                </div>
            `;
        }).join('');
        
        domUtils.setInnerHTML(elementId, html);
        console.log(`StatisticsManager: ${elementId} updated successfully`);
    }

    hexToRgba(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
} 