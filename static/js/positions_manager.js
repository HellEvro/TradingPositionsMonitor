class PositionsManager {
    constructor() {
        Logger.info('POSITIONS', 'Initializing PositionsManager');
        
        // Подписываемся на изменения состояния
        this.unsubscribers = [
            stateManager.subscribe('positions.pnlThreshold', this.handlePnlThresholdChange.bind(this)),
            stateManager.subscribe('positions.reduceLoad', this.handleReduceLoadChange.bind(this))
        ];

        // Инициализируем состояние из StateManager
        const state = stateManager.getState('positions');
        this.pnlThreshold = state.pnlThreshold || parseFloat(localStorage.getItem('pnl_threshold')) || 100;
        this.reduceLoad = state.reduceLoad || false;

        // Сохраняем начальное состояние
        stateManager.setState('positions.pnlThreshold', this.pnlThreshold);
        stateManager.setState('positions.reduceLoad', this.reduceLoad);
    }

    handlePnlThresholdChange(newValue) {
        Logger.debug('POSITIONS', `PNL threshold changed to: ${newValue}`);
        this.pnlThreshold = newValue;
        localStorage.setItem('pnl_threshold', newValue);
        this.updateData();
    }

    handleReduceLoadChange(newValue) {
        Logger.debug('POSITIONS', `Reduce load changed to: ${newValue}`);
        this.reduceLoad = newValue;
        this.updateData();
    }

    async updateData() {
        try {
            Logger.debug('POSITIONS', 'Fetching positions data...');
            stateManager.setState('positions.isLoading', true);
            
            const response = await ApiService.getPositions({
                pnl_threshold: this.pnlThreshold,
                reduce_load: this.reduceLoad
            }).catch(async () => {
                Logger.warn('POSITIONS', 'Falling back to direct fetch');
                const resp = await fetch('/api/positions');
                return resp.json();
            });

            Logger.debug('POSITIONS', 'Received data:', response);
            
            const data = response.success && response.data ? response.data : response;
            
            // Обновляем состояние
            stateManager.setState('positions.lastUpdate', new Date().toISOString());
            stateManager.setState('positions.data', data);
            
            // Обновляем UI
            this.updatePositionsContainers(data);
            
            return {
                ...data,
                rapid_growth_positions: data.rapid_growth_positions || []
            };
        } catch (error) {
            Logger.error('POSITIONS', 'Error updating positions:', error);
            stateManager.setState('positions.error', error.message);
            throw error;
        } finally {
            stateManager.setState('positions.isLoading', false);
        }
    }

    updatePositionsContainers(data) {
        try {
            Logger.debug('POSITIONS', 'Updating containers with:', data);
            
            // Проверяем структуру данных
            if (!data.high_profitable || !data.profitable || !data.losing) {
                Logger.warn('POSITIONS', 'Invalid data structure:', data);
                return;
            }

            // Обновляем каждый контейнер
            this.updatePositionBlock('high-profitable', data.high_profitable);
            this.updatePositionBlock('profitable', data.profitable);
            this.updatePositionBlock('losing', data.losing);

            // Обновляем статистику если есть
            if (data.stats && window.app?.statisticsManager) {
                window.app.statisticsManager.updateStats(data.stats);
            }

        } catch (error) {
            Logger.error('POSITIONS', 'Error updating containers:', error);
            throw error;
        }
    }

    updatePositionBlock(blockId, positions) {
        try {
            Logger.debug('POSITIONS', `Updating ${blockId} positions:`, positions.length);
            
            const container = document.getElementById(`${blockId}-positions`);
            if (!container) {
                Logger.warn('POSITIONS', `Container not found: ${blockId}-positions`);
                return;
            }

            // Создаем HTML для позиций
            const html = positions.map(position => this.createPositionHtml(position)).join('');
            container.innerHTML = html;

            // Обновляем счетчик в заголовке
            this.updateBlockHeader(blockId, positions.length);

        } catch (error) {
            Logger.error('POSITIONS', `Error updating ${blockId} block:`, error);
            throw error;
        }
    }

    updateBlockHeader(blockId, count) {
        try {
            const headerElement = document.getElementById(`${blockId}-positions-header`);
            if (!headerElement) {
                Logger.warn('POSITIONS', `Header not found: ${blockId}-positions-header`);
                return;
            }

            const countElement = headerElement.querySelector('.position-count');
            if (countElement) {
                countElement.textContent = `(${count})`;
            }
        } catch (error) {
            Logger.error('POSITIONS', `Error updating ${blockId} header:`, error);
        }
    }

    createPositionHtml(position) {
        try {
            return `
                <div class="position" data-symbol="${position.symbol}">
                    <div class="position-header">
                        <span class="position-symbol">${position.symbol}</span>
                        <span class="position-pnl ${position.unrealizedPnl >= 0 ? 'positive' : 'negative'}">
                            ${formatUtils.formatNumber(position.unrealizedPnl)} USDT
                        </span>
                    </div>
                    <div class="position-details">
                        <div class="position-size">Size: ${position.size}</div>
                        <div class="position-entry">Entry: ${formatUtils.formatNumber(position.entryPrice)}</div>
                        <div class="position-current">Current: ${formatUtils.formatNumber(position.markPrice)}</div>
                    </div>
                    <div class="position-actions">
                        <button class="close-position-btn" onclick="window.app.positionCloser.closePosition('${position.symbol}', ${position.size}, '${position.side}')">
                            Close
                        </button>
                    </div>
                </div>
            `;
        } catch (error) {
            Logger.error('POSITIONS', 'Error creating position HTML:', error);
            return '';
        }
    }

    // Добавляем вспомогательные методы
    setPnlThreshold(value) {
        try {
            const newValue = parseFloat(value) || 100;
            stateManager.setState('positions.pnlThreshold', newValue);
        } catch (error) {
            Logger.error('POSITIONS', 'Error setting PNL threshold:', error);
        }
    }

    getPnlThreshold() {
        return stateManager.getState('positions.pnlThreshold');
    }

    destroy() {
        // Отписываемся от всех подписок при уничтожении
        this.unsubscribers.forEach(unsubscribe => unsubscribe());
    }
}

// Экспортируем класс для использования в других модулях
window.PositionsManager = PositionsManager;