class PositionCloser {
    constructor(exchange) {
        this.exchange = exchange;
        this.slippagePercent = 0.1;
        this.initializeButtons();
    }

    initializeButtons() {
        // Обработчик кнопок закрытия позиций
        document.addEventListener('click', async (e) => {
            if (e.target.matches('.close-positions-btn')) {
                console.log('Close button clicked');
                e.stopPropagation();
                
                const columnId = e.target.dataset.column;
                console.log('Column ID:', columnId);
                
                let positions; // Объявляем переменную до условия
                
                // Проверяем, одиночное ли это закрытие
                if (e.target.classList.contains('single-close')) {
                    const position = {
                        symbol: e.target.dataset.symbol,
                        side: e.target.dataset.side,
                        size: parseFloat(e.target.dataset.size),
                        element: e.target.closest('.position')
                    };
                    
                    positions = [position]; // Присваиваем значение
                    console.log('Single position to close:', position);
                } else {
                    // Массовое закрытие
                    positions = this.getPositionsFromColumn(columnId); // Присваиваем значение
                    console.log('Positions to close:', positions);
                }
                
                if (!positions.length) {
                    this.showNotification(this.getTranslation('noPositions'), 'warning');
                    return;
                }
                
                const confirmResult = await this.showConfirmDialog(positions.length, columnId);
                if (confirmResult.confirmed) {
                    const results = await this.closePositions(positions, columnId, confirmResult.orderType);
                    if (results.totalClosed > 0 || results.totalFailed > 0) {
                        this.handleCloseResults(results);
                    }
                }
            }
        });
    }

    getPositionsFromColumn(columnId) {
        console.log('Getting positions from column:', columnId);
        const positions = [];
        
        // Убираем суффикс -positions если он есть
        const cleanColumnId = columnId.replace('-positions', '');
        
        // Получаем контейнер с позициями
        const container = document.getElementById(`${cleanColumnId}-positions`);
        console.log('Container:', container);
        
        if (!container) {
            console.warn(`Container not found for ${columnId}`);
            return positions;
        }

        // Получаем все позиции из контейнера
        container.querySelectorAll('.position').forEach(positionElem => {
            console.log('Position element:', positionElem);
            
            const symbol = positionElem.dataset.symbol;
            const side = positionElem.querySelector('.position-side')?.textContent;
            const size = parseFloat(positionElem.dataset.size);
            const pnl = parseFloat(positionElem.dataset.pnl);
            
            console.log('Position data:', { symbol, side, size, pnl });
            
            if (!symbol || !side) {
                console.warn('Missing symbol or side for position:', positionElem);
                return;
            }

            if (isNaN(size) || size <= 0) {
                console.warn('Invalid size for position:', { symbol, side, size });
                return;
            }

            positions.push({
                symbol,
                side,
                size,
                pnl,
                element: positionElem
            });
        });

        console.log('Found positions:', positions);
        
        // Сортируем позиции по PnL (сначала закрываем самые прибыльные)
        return positions.sort((a, b) => b.pnl - a.pnl);
    }

    showConfirmDialog(positionsCount, columnId) {
        return new Promise((resolve) => {
            const dialog = document.createElement('div');
            dialog.className = 'confirm-dialog';
            
            const positionType = columnId === 'high-profitable' ? 
                this.getTranslation('position_type_high_profitable') : 
                columnId === 'profitable' ? 
                    this.getTranslation('position_type_profitable') : 
                    this.getTranslation('position_type_losing');
            
            dialog.innerHTML = `
                <div class="confirm-content">
                    <div class="confirm-header">
                        ${this.getTranslation('close_positions_confirm_title')}
                    </div>
                    <div class="confirm-text">
                        ${this.getTranslation('close_positions_confirm_text').replace('{count}', positionsCount)}
                    </div>
                    <div class="confirm-buttons">
                        <button class="cancel-btn">${this.getTranslation('close_positions_cancel')}</button>
                        <button class="limit-btn">${this.getTranslation('close_positions_limit')}</button>
                        <button class="market-btn">${this.getTranslation('close_positions_market')}</button>
                    </div>
                </div>
            `;
            
            // Добавляем стили для диалога
            const style = document.createElement('style');
            style.textContent = `
                .confirm-dialog {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.5);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    z-index: 1000;
                }
                .confirm-content {
                    background: var(--background-color, #1e222d);
                    border-radius: 4px;
                    padding: 20px;
                    min-width: 300px;
                }
                .confirm-header {
                    color: var(--text-color, #fff);
                    font-size: 16px;
                    font-weight: 500;
                    margin-bottom: 15px;
                }
                .confirm-text {
                    color: var(--text-color, #fff);
                    margin-bottom: 20px;
                    font-size: 14px;
                }
                .confirm-buttons {
                    display: flex;
                    gap: 10px;
                }
                .confirm-buttons button {
                    padding: 8px 16px;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                    transition: opacity 0.2s;
                    color: #fff;
                }
                .confirm-buttons button:hover {
                    opacity: 0.8;
                }
                .cancel-btn {
                    background: var(--button-secondary-bg, #555);
                }
                .limit-btn {
                    background: var(--success-color, #4CAF50);
                }
                .market-btn {
                    background: var(--warning-color, #ff9800);
                }
            `;
            document.head.appendChild(style);
            
            document.body.appendChild(dialog);
            
            // Добавляем обработчики событий
            dialog.querySelector('.cancel-btn').onclick = () => {
                dialog.remove();
                style.remove();
                resolve({ confirmed: false });
            };
            
            dialog.querySelector('.limit-btn').onclick = () => {
                dialog.remove();
                style.remove();
                resolve({ confirmed: true, orderType: 'limit' });
            };
            
            dialog.querySelector('.market-btn').onclick = () => {
                dialog.remove();
                style.remove();
                resolve({ confirmed: true, orderType: 'market' });
            };

            // Закрытие по клику вне окна
            dialog.addEventListener('click', (e) => {
                if (e.target === dialog) {
                    dialog.remove();
                    style.remove();
                    resolve({ confirmed: false });
                }
            });
        });
    }

    getTranslation(key) {
        const lang = document.documentElement.lang || 'en';
        return TRANSLATIONS[lang]?.[key] || TRANSLATIONS['en'][key] || key;
    }

    async closePositions(positions, columnId, orderType) {
        const results = [];
        let totalClosed = 0;
        let totalFailed = 0;
        
        // Получаем актуальные позиции перед закрытием
        const currentPositions = this.getPositionsFromColumn(columnId);
        console.log('Current positions before closing:', currentPositions);

        // Создаем массив промисов для параллельного закрытия позиций
        const closePromises = positions.map(async (position) => {
            try {
                position.element.classList.add('closing');
                
                // Проверяем, что позиция все еще существует
                const positionStillExists = currentPositions.some(p => 
                    p.symbol === position.symbol && 
                    p.side === position.side && 
                    Math.abs(p.size - position.size) < 0.00001
                );
                
                if (!positionStillExists) {
                    console.log(`Position ${position.symbol} (${position.side}, ${position.size}) no longer exists`);
                    position.element.classList.remove('closing');
                    return null; // Пропускаем закрытие несуществующей позиции
                }
                
                const ticker = await this.exchange.fetchTicker(position.symbol);
                if (!ticker || !ticker.last) {
                    throw new Error(`Could not get price for ${position.symbol}`);
                }
                
                const currentPrice = ticker.last;
                console.log(`Closing ${position.symbol} at price ${currentPrice}`);
                
                // Отправляем запрос на закрытие позиции
                const response = await fetch('/api/close_position', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        symbol: position.symbol,
                        size: position.size,
                        side: position.side,
                        order_type: orderType
                    })
                });

                const result = await response.json();
                console.log(`Close position result for ${position.symbol}:`, result);

                if (result.success) {
                    return {
                        symbol: position.symbol,
                        success: true,
                        message: result.message,
                        close_price: result.close_price
                    };
                } else {
                    throw new Error(result.message || 'Failed to close position');
                }
            } catch (error) {
                console.error(`Error closing position ${position.symbol}:`, error);
                return {
                    symbol: position.symbol,
                    success: false,
                    message: error.message
                };
            } finally {
                position.element.classList.remove('closing');
            }
        });

        // Ждем завершения всех запросов на закрытие
        const closeResults = await Promise.all(closePromises);
        
        // Обрабатываем результаты
        closeResults.forEach(result => {
            if (result) {  // Пропускаем null (несуществующие позиции)
                if (result.success) {
                    totalClosed++;
                } else {
                    totalFailed++;
                }
                results.push(result);
            }
        });

        return {
            results,
            totalClosed,
            totalFailed,
            totalPnl: results.reduce((sum, r) => sum + (r.pnl || 0), 0)
        };
    }

    handleCloseResults(results) {
        if (results.totalClosed === 0 && results.totalFailed === 0) {
            this.showNotification(this.getTranslation('noPositions'), 'warning');
            return;
        }
        
        let message = '';
        const successfulCloses = results.results.filter(r => r.success);
        const failedCloses = results.results.filter(r => !r.success);
        
        if (successfulCloses.length > 0) {
            message += `${this.getTranslation('close_positions_success')}: ${results.totalClosed}\n`;
            message += `${this.getTranslation('order_type')}: ${results.orderType === 'market' ? this.getTranslation('market_order') : this.getTranslation('limit_order')}\n`;
            successfulCloses.forEach(r => {
                console.log('Processing successful close:', r);
                const priceStr = r.price ? formatUtils.formatNumber(r.price) : 'Market';
                const pnlStr = r.pnl >= 0 ? `+${formatUtils.formatNumber(r.pnl)}` : formatUtils.formatNumber(r.pnl);
                message += `${r.symbol}: ${r.size} @ ${priceStr} USDT (PnL: ${pnlStr} USDT)\n`;
            });
            const totalPnlStr = results.totalPnl >= 0 ? 
                `+${formatUtils.formatNumber(results.totalPnl)}` : 
                formatUtils.formatNumber(results.totalPnl);
            message += `${this.getTranslation('total_pnl')}: ${totalPnlStr} USDT\n`;
        }
        
        if (failedCloses.length > 0) {
            message += `\n${this.getTranslation('close_positions_errors')} (${results.totalFailed}):\n`;
            failedCloses.forEach(r => {
                message += `${r.symbol}: ${r.error}\n`;
                if (r.details) {
                    console.error(`Detailed error for ${r.symbol}:`, r.details);
                }
            });
        }
        
        this.showNotification(message, successfulCloses.length > 0 ? 'success' : 'error');
    }

    showNotification(message, type = 'success') {
        // Удаляем предыдущие уведомления
        document.querySelectorAll('.notification').forEach(notification => {
            notification.remove();
        });

        const notification = document.createElement('div');
        notification.className = `notification ${type}`;

        // Добавляем иконку в зависимости от типа уведомления
        const icon = document.createElement('span');
        icon.className = 'icon';
        switch(type) {
            case 'success':
                icon.textContent = '✓';
                break;
            case 'warning':
                icon.textContent = '⚠';
                break;
            case 'error':
                icon.textContent = '✕';
                break;
        }
        
        const messageSpan = document.createElement('span');
        // Заменяем \n на <br> для правильного отображения переносов строк
        messageSpan.innerHTML = message.replace(/\n/g, '<br>');

        notification.appendChild(icon);
        notification.appendChild(messageSpan);
        document.body.appendChild(notification);
        
        // Автоматически удаляем уведомление через 5 секунд
        setTimeout(() => {
            notification.style.animation = 'slideDown 0.3s ease-in reverse';
            setTimeout(() => notification.remove(), 300);
        }, 5000);
    }
} 