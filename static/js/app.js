class App {
    constructor() {
        Logger.info('APP', 'Constructor called');
        try {
            Logger.info('APP', 'Starting initialization...');
            this.isUpdating = false;
            this.menuInitialized = false;
            this.currentTab = null;
            
            this._logState = () => {
                Logger.debug('APP', 'Current state:', {
                    currentTab: this.currentTab,
                    menuInitialized: this.menuInitialized,
                    isUpdating: this.isUpdating
                });
            };
            
            Logger.info('APP', 'Initializing managers');
            this.statisticsManager = new StatisticsManager();
            this.positionsManager = new PositionsManager();
            this.exchangeManager = new ExchangeManager();
            this.positionCloser = new PositionCloser(this.exchangeManager);
            
            this.currentPage = 1;
            this.allClosedPnlData = [];
            this.availablePairs = new Set();
            
            // Добавляем обработчик изменения таймфрейма
            document.addEventListener('timeframeChanged', async (event) => {
                console.log('[APP] Timeframe changed event received:', event.detail);
                const { timeframe } = event.detail;
                
                // Получаем сохраненную пару из localStorage
                const pair = localStorage.getItem('selectedPair');
                if (!pair) {
                    console.error('[APP] No selected pair found in localStorage');
                    return;
                }

                console.log('[APP] Current pair:', pair, 'timeframe:', timeframe);
                
                try {
                    // Показываем индикатор загрузки
                    const loader = document.getElementById('pairInfoLoader');
                    const content = document.getElementById('pairInfoContent');
                    if (loader) loader.style.display = 'flex';
                    if (content) content.classList.add('hidden');
                    
                    // Получаем новые данные для графика
                    console.log('[APP] Requesting new chart data...');
                    const chartData = await this.exchangeManager.getChartData(pair, timeframe);
                    console.log('[APP] Received chart data:', chartData);
                    
                    if (chartData && chartData.success) {
                        // Обновляем данные графика
                        if (this.tradingChart) {
                            console.log('[APP] Updating existing chart instance');
                            this.tradingChart.updateData(chartData.data);
                        } else {
                            console.log('[APP] Creating new chart instance');
                            const chartContainer = document.getElementById('tradingChart');
                            this.tradingChart = new CanvasTradingChart('tradingChart', {
                                theme: document.body.getAttribute('data-theme') === 'light' ? 'light' : 'dark',
                                width: chartContainer.clientWidth,
                                height: chartContainer.clientHeight,
                                timeframe: timeframe
                            });
                            this.tradingChart.updateData(chartData.data);
                        }
                    } else {
                        console.error('[APP] Failed to get chart data:', chartData);
                        this.showErrorNotification('Ошибка при получении данных графика');
                    }
                    
                    // Получаем новые индикаторы
                    console.log('[APP] Requesting new indicators...');
                    const indicators = await this.exchangeManager.getIndicators(pair, timeframe);
                    console.log('[APP] Received indicators:', indicators);
                    
                    if (indicators && indicators.success) {
                        this.updateIndicators(indicators);
                    } else {
                        console.error('[APP] Failed to get indicators:', indicators);
                        this.showErrorNotification('Ошибка при получении индикаторов');
                    }
                    
                    // Скрываем индикатор загрузки
                    if (loader) loader.style.display = 'none';
                    if (content) content.classList.remove('hidden');
                } catch (error) {
                    console.error('[APP] Error updating data after timeframe change:', error);
                    this.showErrorNotification('Ошибка при обновлении данных');
                    
                    // Скрываем индикатор загрузки в случае ошибки
                    const loader = document.getElementById('pairInfoLoader');
                    const content = document.getElementById('pairInfoContent');
                    if (loader) loader.style.display = 'none';
                    if (content) content.classList.remove('hidden');
                }
            });
            
            // Ждем загрузки DOM для остальной инициализации
            if (document.readyState === 'loading') {
                console.log('[APP] DOM still loading, adding DOMContentLoaded listener');
                document.addEventListener('DOMContentLoaded', () => {
                    console.log('[APP] DOMContentLoaded fired, calling initDOM()');
                    this.initDOM();
                });
            } else {
                console.log('[APP] DOM already loaded, calling initDOM() directly');
                this.initDOM();
            }
            
            this.initializeGlobalSearch();
            
        } catch (e) {
            Logger.error('APP', 'Error in constructor:', e);
            NotificationManager.error('Error initializing application');
        }
    }

    initDOM() {
        console.log('[APP] InitDOM started');
        try {
            // Сначала восстанавливаем последнюю активную страницу и название
            console.log('[APP] Calling initializeLastActivePage');
            this.initializeLastActivePage();
            
            // Затем инициализируем компоненты и запускаем обновления
            console.log('[APP] Initializing components');
            this.initializeApp();
            this.initializeTradingPage();
            this.initializeControls();
            
            console.log('[APP] InitDOM completed');
        } catch (e) {
            console.error('[APP] Error in initDOM:', e);
        }
    }

    initializeLastActivePage() {
        console.log('[MENU] initializeLastActivePage started');
        try {
            const lastActivePage = localStorage.getItem('lastActivePage') || 'positions';
            const menuTitle = document.querySelector('.menu-title');
            console.log('[MENU] Menu title element:', menuTitle);
            
            if (menuTitle && !this.menuInitialized) {
                // Устанавливаем атрибут data-translate для правильного перевода
                menuTitle.setAttribute('data-translate', lastActivePage);
                
                // Получаем перевод для текущего языка
                const translatedText = languageUtils.translate(lastActivePage);
                console.log('[MENU] Setting menu title to:', translatedText);
                
                menuTitle.textContent = translatedText;
                this.menuInitialized = true;
            }
            
            // Показываем нужную вкладку
            this.showTab(lastActivePage, false);
            
        } catch (e) {
            console.error('[MENU] Error in initializeLastActivePage:', e);
        }
    }

    showTab(tabName, saveState = true) {
        console.log('[MENU] showTab called with:', { tabName, saveState });
        try {
            if (this.currentTab === tabName) {
                console.log('[MENU] Already on this tab:', tabName);
                this._logState();
                return;
            }
            
            const menuTitle = document.querySelector('.menu-title');
            
            if (saveState && menuTitle) {
                const translatedText = languageUtils.translate(tabName);
                console.log('[MENU] Saving to localStorage:', {
                    lastActivePage: tabName,
                    lastActivePageText: translatedText
                });
                
                localStorage.setItem('lastActivePage', tabName);
                localStorage.setItem('lastActivePageText', translatedText);
                
                requestAnimationFrame(() => {
                    console.log('[MENU] Force updating menu title to:', translatedText);
                    menuTitle.textContent = translatedText;
                    this._logState();
                });
            }
            
            // Обновляем текущую вкладку
            this.currentTab = tabName;
            console.log('[MENU] Tab changed to:', tabName);
            this._logState();
            
            // Обновляем видимость контейнеров
            const positionsContainer = document.querySelector('.positions-container');
            const statsContainer = document.querySelector('.stats-container');
            const closedPnlContainer = document.getElementById('closedPnlContainer');
            const tradingContainer = document.getElementById('tradingContainer');
            
            // Скрываем все контейнеры сначала
            if (positionsContainer) positionsContainer.style.display = 'none';
            if (statsContainer) statsContainer.style.display = 'none';
            if (closedPnlContainer) closedPnlContainer.style.display = 'none';
            if (tradingContainer) tradingContainer.style.display = 'none';
            
            // Показываем нужные контейнеры
            if (tabName === 'positions') {
                if (positionsContainer) positionsContainer.style.display = 'block';
                if (statsContainer) statsContainer.style.display = 'block';
                document.querySelector('.main-container').style.display = 'flex';
            } else if (tabName === 'trading') {
                console.log('[TRADING] Showing trading tab');
                if (tradingContainer) {
                    console.log('[TRADING] Setting tradingContainer display to block');
                    tradingContainer.style.display = 'block';
                } else {
                    console.error('[TRADING] tradingContainer not found');
                }
                document.querySelector('.main-container').style.display = 'none';
                // Проверяем, инициализирован ли exchangeManager перед вызовом
                if (this.exchangeManager) {
                    console.log('[TRADING] Updating available pairs');
                    // Обновляем список доступных пар при переключении на вкладку
                    this.updateAvailablePairs();
                } else {
                    console.error('[TRADING] Exchange manager not initialized yet, skipping pairs update');
                }
            } else if (tabName === 'closedPnl') {
                if (closedPnlContainer) closedPnlContainer.style.display = 'block';
                document.querySelector('.main-container').style.display = 'none';
                // Загружаем данные для закрытых позиций
                this.updateClosedPnl(true);
            }
            
            // Обновляем активный пункт меню
            document.querySelectorAll('.menu-item').forEach(item => {
                item.classList.remove('active');
            });
            document.getElementById(`${tabName}MenuItem`).classList.add('active');
            
            // Закрываем меню
            document.getElementById('menuDropdown').classList.remove('active');
            
        } catch (error) {
            console.error('[MENU] Error in showTab:', error);
        }
    }

    initializeControls() {
        try {
            // Инициализация чекбокса "Снизить нагрузку"
            const reduceLoadCheckbox = document.getElementById('reduceLoadCheckbox');
            if (reduceLoadCheckbox) {
                const savedState = localStorage.getItem('reduceLoad') === 'true';
                reduceLoadCheckbox.checked = savedState;
                reduceLoadCheckbox.addEventListener('change', (e) => {
                    localStorage.setItem('reduceLoad', e.target.checked);
                    this.positionsManager.setReduceLoad(e.target.checked);
                });
                this.positionsManager.setReduceLoad(savedState);
            }

            // Инициализация кнопки смены темы
            const themeButton = document.querySelector('.control-item[onclick="toggleTheme()"]');
            if (themeButton) {
                themeButton.onclick = () => {
                    const body = document.body;
                    const currentTheme = body.getAttribute('data-theme');
                    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
                    
                    if (newTheme === 'dark') {
                        body.removeAttribute('data-theme');
                    } else {
                        body.setAttribute('data-theme', 'light');
                    }
                    
                    localStorage.setItem('theme', newTheme);
                    
                    // Обновляем графики при смене темы
                    if (this.statisticsManager) {
                        this.statisticsManager.initializeChart();
                    }
                };
            }
        } catch (e) {
            console.error('Error in initializeControls:', e);
        }
    }

    initializeApp() {
        try {
            console.log('Starting app initialization...');
            // Инициализация темы
            this.initializeTheme();
            
            // Инициализация языка
            updateInterface();
            
            // Запуск обновления данных
            this.startDataUpdates();
            initializeSortSelects();
        } catch (e) {
            console.error('Error in initializeApp:', e);
        }
    }

    initializeTheme() {
        const savedTheme = localStorage.getItem('theme') || 'dark';
        if (savedTheme === 'light') {
            document.body.setAttribute('data-theme', 'light');
        } else {
            document.body.removeAttribute('data-theme');
        }
    }

    startDataUpdates() {
        console.log('Starting data updates...');
        let isUpdating = false;

        const update = async () => {
            if (isUpdating) {
                console.log('Update already in progress, skipping...');
                return;
            }

            try {
                isUpdating = true;
                await this.updateData();
            } catch (error) {
                console.error('Error in update cycle:', error);
            } finally {
                isUpdating = false;
            }
        };

        // Первоначальная загрузка
        update().then(() => {
            // Запускаем регулярное обновление
            setInterval(update, UPDATE_INTERVAL);
            console.log(`Data updates started with interval ${UPDATE_INTERVAL}ms`);
        });
    }

    async updateData() {
        try {
            console.log('[MENU] updateData called');
            if (this.isUpdating) {
                console.log('[UPDATE] Update already in progress, skipping...');
                this._logState();
                return;
            }

            this.isUpdating = true;
            console.log('[UPDATE] Starting data update...');
            this._logState();
            
            if (this.currentTab === 'positions') {
                const data = await this.positionsManager.updateData();
                this.updateLastUpdateTime();
                return data;
            } else {
                console.log('[UPDATE] Skipping data update - not on positions tab');
                this._logState();
                return null;
            }
        } catch (error) {
            console.error('[UPDATE] Error updating data:', error);
            this.showErrorNotification('Ошибка обновления данных');
            return null;
        } finally {
            this.isUpdating = false;
            this._logState();
        }
    }

    updateLastUpdateTime() {
        const updateTimeElement = document.getElementById('update-time');
        if (updateTimeElement) {
            const now = new Date();
            updateTimeElement.textContent = now.toLocaleTimeString();
        }
    }

    async updateClosedPnl(resetPage = false) {
        try {
            if (resetPage) {
                this.currentPage = 1;
            }

            const sortSelect = document.getElementById('sortSelect');
            const sortBy = sortSelect ? sortSelect.value : 'time';

            const response = await fetch(`/api/closed_pnl?sort=${sortBy}`);
            const data = await response.json();

            if (data.success) {
                // Обновляем данные о балансе и PNL
                if (data.wallet_data) {
                    document.getElementById('totalBalance').textContent = 
                        `${data.wallet_data.total_balance.toFixed(2)} USDT`;
                    document.getElementById('availableBalance').textContent = 
                        `${data.wallet_data.available_balance.toFixed(2)} USDT`;
                    document.getElementById('realizedPnL').textContent = 
                        `${data.wallet_data.realized_pnl.toFixed(2)} USDT`;
                }

                // Обновляем таблицу закрытых позиций
                this.allClosedPnlData = data.closed_pnl;
                this.updateClosedPnlTable(this.allClosedPnlData, false);
            } else {
                console.error('Failed to get closed PNL data:', data.error);
                this.showErrorNotification('Ошибка при получении данных о закрытых позициях');
            }
        } catch (error) {
            console.error('Error updating closed PNL:', error);
            this.showErrorNotification('Ошибка при обновлении данных');
        }
    }

    updateClosedPnlTable(data = null, resetPage = false) {
        // Используем переданные данные или существующие
        const displayData = data || this.allClosedPnlData;
        if (!displayData || displayData.length === 0) {
            const tableBody = document.getElementById('closedPnlTable');
            if (tableBody) {
                tableBody.innerHTML = '<tr><td colspan="6" class="no-data">Нет данных</td></tr>';
            }
            return;
        }
        
        // Получаем текущий поисковый запрос
        const searchQuery = document.getElementById('tickerSearch')?.value.toUpperCase() || '';
        
        // Фильтруем данные по поисковому запросу
        const filteredData = searchQuery ? 
            displayData.filter(pnl => pnl.symbol.includes(searchQuery)) : 
            displayData;
        
        // Получаем текущую страницу и размер страницы
        const pageSize = parseInt(localStorage.getItem('pageSize') || '10');
        const currentPage = resetPage ? 1 : (this.currentPage || 1);
        this.currentPage = currentPage;
        
        // Вычисляем диапазон для текущей страницы
        const start = (currentPage - 1) * pageSize;
        const end = start + pageSize;
        const pageData = filteredData.slice(start, end);
        
        // Генерируем HTML таблицы
        const tableHtml = pageData.map(pnl => {
            const isProfit = parseFloat(pnl.closed_pnl) >= 0;
            const pnlValue = parseFloat(pnl.closed_pnl);
            return `
                <tr>
                    <td class="ticker-cell">
                        <span class="ticker">${pnl.symbol}</span>
                        <a href="${createTickerLink(pnl.symbol, pnl.exchange)}" 
                           target="_blank" 
                           class="external-link"
                           title="Открыть на бирже">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                                <polyline points="15 3 21 3 21 9"></polyline>
                                <line x1="10" y1="14" x2="21" y2="3"></line>
                            </svg>
                        </a>
                    </td>
                    <td>${pnl.qty}</td>
                    <td>${parseFloat(pnl.entry_price).toFixed(5)}</td>
                    <td>${parseFloat(pnl.exit_price).toFixed(5)}</td>
                    <td class="${isProfit ? 'positive-pnl' : 'negative-pnl'}">
                        ${isProfit ? '+' : ''}${pnlValue.toFixed(2)} USDT
                    </td>
                    <td>${pnl.close_time}</td>
                </tr>
            `;
        }).join('');
        
        // Обновляем таблицу
        const tableBody = document.getElementById('closedPnlTable');
        if (tableBody) {
            tableBody.innerHTML = tableHtml || '<tr><td colspan="6" class="no-data">Нет данных</td></tr>';
        }
        
        // Обновляем элементы пагинации
        this.updatePaginationControls(filteredData.length, pageSize, currentPage);
    }

    updatePaginationControls(totalItems, pageSize, currentPage) {
        const totalPages = Math.ceil(totalItems / pageSize);
        
        // Обновляем информацию о странице
        const pageInfo = domUtils.getElement('pageInfo');
        if (pageInfo) {
            pageInfo.textContent = `Страница ${currentPage} из ${totalPages}`;
        }
        
        // Обновляем состояние кнопок
        const prevButton = document.querySelector('.pagination-btn:first-child');
        const nextButton = document.querySelector('.pagination-btn:last-child');
        
        if (prevButton) {
            prevButton.disabled = currentPage === 1;
        }
        if (nextButton) {
            nextButton.disabled = currentPage === totalPages;
        }
    }

    prevPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
            this.updateClosedPnlTable(this.allClosedPnlData, false);
        }
    }

    nextPage() {
        const pageSize = parseInt(storageUtils.get('pageSize', DEFAULTS.PAGE_SIZE));
        const totalPages = Math.ceil((this.allClosedPnlData?.length || 0) / pageSize);
        
        if (this.currentPage < totalPages) {
            this.currentPage++;
            this.updateClosedPnlTable(this.allClosedPnlData, false);
        }
    }

    changePageSize(newSize) {
        storageUtils.set('pageSize', parseInt(newSize));
        this.currentPage = 1;
        this.updateClosedPnlTable(this.allClosedPnlData, false);
    }

    showErrorNotification(message) {
        NotificationManager.error(message);
    }

    showSuccessNotification(message) {
        NotificationManager.success(message);
    }

    toggleTheme() {
        const body = document.body;
        const currentTheme = body.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        
        if (newTheme === 'dark') {
            body.removeAttribute('data-theme');
        } else {
            body.setAttribute('data-theme', 'light');
        }
        
        localStorage.setItem('theme', newTheme);
        
        // Обновляем графики при смене темы
        if (this.statisticsManager) {
            this.statisticsManager.initializeChart();
        }
    }

    initializeTradingPage() {
        const searchInput = document.getElementById('tradingSearch');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.filterAvailablePairs(e.target.value);
            });
        }
    }

    async updateAvailablePairs() {
        console.log('[TRADING] Начало обновления доступных пар');
        try {
            // Получаем текущие позиции
            const positionsResponse = await fetch('/api/positions');
            const positionsData = await positionsResponse.json();
            const openPositions = new Set(positionsData.high_profitable.concat(
                positionsData.profitable,
                positionsData.losing
            ).map(p => p.symbol));
            
            // Получаем все доступные пары
            const response = await fetch('/api/pairs');
            const data = await response.json();
            
            if (data.success) {
                // Фильтруем пары, исключая те, что уже в позициях
                const pairs = data.pairs.filter(pair => !openPositions.has(pair));
                console.log('[TRADING] Отфильтрованные доступные пары:', pairs);
                
                // Сохраняем пары
                this.availablePairs = pairs;
                
                // Отрисовываем пары
                await this.renderAvailablePairs();
                
                // Анализируем тикеры для фильтрации
                if (window.tradingFilters) {
                    console.log('[TRADING] Starting ticker analysis...');
                    const loadingElement = document.getElementById('filterLoading');
                    const progressBar = document.getElementById('analysisProgress');
                    
                    if (loadingElement) loadingElement.style.display = 'block';
                    if (progressBar) progressBar.style.width = '0%';
                    
                    const total = pairs.length;
                    let completed = 0;
                    
                    try {
                        const batchSize = 5; // Анализируем по 5 тикеров одновременно
                        for (let i = 0; i < pairs.length; i += batchSize) {
                            const batch = pairs.slice(i, i + batchSize);
                            await Promise.all(batch.map(async (symbol) => {
                                try {
                                    const chartResponse = await fetch(`/api/chart/${symbol}?timeframe=1d&period=1M`);
                                    const chartData = await chartResponse.json();
                                    
                                    if (chartData.success && chartData.data && chartData.data.candles) {
                                        window.tradingFilters.analyzeTicker(symbol, chartData.data.candles);
                                    }
                                } catch (error) {
                                    console.error(`[TRADING] Error analyzing ${symbol}:`, error);
                                } finally {
                                    completed++;
                                    if (progressBar) {
                                        const progress = (completed / total) * 100;
                                        progressBar.style.width = `${progress}%`;
                                        console.log(`[TRADING] Analysis progress: ${progress.toFixed(1)}%`);
                                    }
                                }
                            }));
                            
                            // Небольшая задержка между батчами
                            await new Promise(resolve => setTimeout(resolve, 100));
                        }
                    } finally {
                        if (loadingElement) loadingElement.style.display = 'none';
                        if (progressBar) progressBar.style.width = '0%';
                    }
                    console.log('[TRADING] Ticker analysis completed');
                }
                
                // Если есть доступные пары, выбираем первую
                if (this.availablePairs.length > 0) {
                    this.selectPair(this.availablePairs[0]);
                }
            }
        } catch (error) {
            console.error('[TRADING] Error updating pairs:', error);
        }
    }

    filterAvailablePairs(searchQuery) {
        const query = searchQuery.toUpperCase();
        const pairsList = document.getElementById('availablePairsList');
        
        if (!pairsList) return;

        Array.from(pairsList.children).forEach(item => {
            const symbol = item.textContent.toUpperCase();
            item.style.display = symbol.includes(query) ? '' : 'none';
        });
    }

    async renderAvailablePairs() {
        console.log('[TRADING] Начало отрисовки доступных пар');
        const pairsList = document.getElementById('availablePairsList');
        
        if (!pairsList) {
            console.error('[TRADING] Element availablePairsList not found');
            return;
        }

        // Очищаем список
        pairsList.innerHTML = '';
        
        if (!this.availablePairs || !Array.isArray(this.availablePairs) || this.availablePairs.length === 0) {
            console.log('[TRADING] Нет доступных пар для отображения');
            pairsList.innerHTML = `<div class="no-pairs">${languageUtils.translate('noAvailablePairs')}</div>`;
            return;
        }

        // Сортируем и отображаем пары
        this.availablePairs
            .sort()
            .forEach(pair => {
                const li = document.createElement('li');
                li.className = 'pair-item';
                li.dataset.symbol = pair;
                
                const symbolSpan = document.createElement('span');
                symbolSpan.className = 'pair-symbol';
                symbolSpan.textContent = pair;
                
                // Создаем контейнер для flex-разметки
                const container = document.createElement('div');
                container.style.display = 'flex';
                container.style.justifyContent = 'space-between';
                container.style.alignItems = 'center';
                container.style.width = '100%';
                
                container.appendChild(symbolSpan);
                
                // Добавляем иконку внешней ссылки точно как в closed_pnl
                const link = document.createElement('a');
                link.href = createTickerLink(pair);
                link.target = '_blank';
                link.className = 'external-link';
                link.title = 'Открыть на бирже';
                link.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                        <polyline points="15 3 21 3 21 9"></polyline>
                        <line x1="10" y1="14" x2="21" y2="3"></line>
                    </svg>
                `;
                container.appendChild(link);
                
                li.appendChild(container);
                
                // Добавляем обработчик клика
                li.onclick = (e) => {
                    // Проверяем, что клик был не по ссылке
                    if (!e.target.closest('.external-link')) {
                        this.selectPair(pair);
                    }
                };
                
                pairsList.appendChild(li);
            });

        // Обновляем счетчик
        const totalPairsElement = document.getElementById('totalPairs');
        if (totalPairsElement) {
            totalPairsElement.textContent = this.availablePairs.length;
        }
        
        // Обновляем счетчик отфильтрованных пар
        const filteredPairsElement = document.getElementById('filteredPairs');
        if (filteredPairsElement) {
            filteredPairsElement.textContent = this.availablePairs.length;
        }
    }

    initializeGlobalSearch() {
        const searchInput = document.getElementById('tickerSearch');
        const clearButton = document.getElementById('clearSearch');
        
        if (searchInput) {
            // Очищаем поле при инициализации
            searchInput.value = '';
            if (clearButton) {
                clearButton.style.display = 'none';
            }

            searchInput.addEventListener('input', (e) => {
                const query = e.target.value.toUpperCase();
                
                // Показываем/скрываем кнопку очистки
                if (clearButton) {
                    clearButton.style.display = query ? 'block' : 'none';
                }
                
                // Фильтрация в зависимости от екущей вкладки
                if (this.currentTab === 'positions') {
                    // Фильтруем позиции
                    document.querySelectorAll('.position').forEach(position => {
                        const symbol = position.getAttribute('data-symbol');
                        if (symbol) {
                            position.style.display = symbol.includes(query) ? '' : 'none';
                        }
                    });
                    
                    // Обновляем счетчики позиций
                    this.updatePositionCounts();
                    
                } else if (this.currentTab === 'trading') {
                    // Фильтруем доступные пары
                    this.filterAvailablePairs(query);
                    
                } else if (this.currentTab === 'closedPnl') {
                    // Обновляем таблицу закрытых позиций с сохраненными данными
                    this.updateClosedPnlTable(this.allClosedPnlData, true);
                }
            });
            
            // Обработчик для кнопки очистки
            if (clearButton) {
                clearButton.addEventListener('click', () => {
                    searchInput.value = '';
                    clearButton.style.display = 'none';
                    
                    // Вызываем событие input для обновления фильтрации
                    const inputEvent = new Event('input');
                    searchInput.dispatchEvent(inputEvent);
                });
            }
        }
    }

    // Вспомогательный метод для обновления счетчиков позиций
    updatePositionCounts() {
        const containers = ['high-profitable', 'profitable', 'losing'];
        
        containers.forEach(type => {
            const container = document.getElementById(`${type}-positions`);
            const countElement = document.querySelector(`#${type}-positions-header .position-count`);
            
            if (container && countElement) {
                const visiblePositions = container.querySelectorAll('.position[style=""]').length;
                countElement.textContent = `(${visiblePositions})`;
            }
        });
    }

    selectPair(pair) {
        console.log('[TRADING] Selecting pair:', pair);
        try {
            // Сохраняем выбранную пару в localStorage
            localStorage.setItem('selectedPair', pair);
            
            // Показываем прелоадер
            const loader = document.getElementById('pairInfoLoader');
            const content = document.getElementById('pairInfoContent');
            
            if (loader) loader.style.display = 'flex';
            if (content) content.classList.add('hidden');
            
            // Обновляем название выбранной пары
            const pairNameElement = document.getElementById('selectedPairName');
            if (pairNameElement) pairNameElement.textContent = pair;
            
            // Подсвечиваем выбранную пару в списке
            document.querySelectorAll('.pair-item').forEach(item => {
                item.classList.remove('active');
                if (item.textContent.trim() === pair) {
                    item.classList.add('active');
                    console.log('[TRADING] Set active pair:', item.textContent.trim());
                }
            });
            
            // Получаем данные для графика
            if (this.exchangeManager) {
                // Получаем текущий таймфрейм
                const timeframe = localStorage.getItem('selectedTimeframe') || '1d';
                console.log('[TRADING] Using timeframe:', timeframe);
                
                this.exchangeManager.getChartData(pair, timeframe)
                    .then(chartData => {
                        this.updateTradingChart(chartData);
                        
                        // Получаем индикаторы
                        return this.exchangeManager.getIndicators(pair, timeframe);
                    })
                    .then(indicators => {
                        this.updateIndicators(indicators);
                        
                        // Скрываем прелоадер и показываем контент
                        if (loader) loader.style.display = 'none';
                        if (content) content.classList.remove('hidden');
                    })
                    .catch(error => {
                        console.error('[TRADING] Error loading data:', error);
                        this.showErrorNotification('Ошибка при загрузке данных');
                        
                        // Скрываем прелоадер в случае ошибки
                        if (loader) loader.style.display = 'none';
                        if (content) content.classList.remove('hidden');
                    });
            }
        } catch (error) {
            console.error('[TRADING] Error selecting pair:', error);
            this.showErrorNotification('Ошибка при выборе пары');
            
            // Скрываем прелоадер в случае ошибки
            if (loader) loader.style.display = 'none';
            if (content) content.classList.remove('hidden');
        }
    }
    
    updateTradingChart(data) {
        console.log('[TRADING] Updating chart with data:', data);
        
        if (!data || !data.success || !data.data) {
            console.error('[TRADING] Invalid chart data:', data);
            return;
        }

        try {
            // Проверяем структуру данных
            console.log('[TRADING] Data structure:', {
                hasData: !!data.data,
                fields: data.data ? Object.keys(data.data) : [],
                sampleData: data.data
            });

            // Проверяем наличие всех необходимых полей
            if (!data.data.times || !data.data.open || !data.data.high || 
                !data.data.low || !data.data.close || !data.data.volume) {
                console.error('[TRADING] Missing required data fields');
                return;
            }

            // Проверяем первую свечу для валидации данных
            const firstCandle = {
                time: data.data.times[0],
                open: data.data.open[0],
                high: data.data.high[0],
                low: data.data.low[0],
                close: data.data.close[0],
                volume: data.data.volume[0]
            };
            console.log('[TRADING] First candle:', firstCandle);

            // Фильтруем невалидные свечи
            const validIndexes = data.data.times.reduce((acc, time, i) => {
                if (time && 
                    data.data.open[i] && 
                    data.data.high[i] && 
                    data.data.low[i] && 
                    data.data.close[i] &&
                    data.data.volume[i]) {
                    acc.push(i);
                }
                return acc;
            }, []);

            console.log('[TRADING] Valid candles count:', validIndexes.length);

            // Создаем отфильтрованные данные
            const validData = {
                times: validIndexes.map(i => data.data.times[i]),
                open: validIndexes.map(i => data.data.open[i]),
                high: validIndexes.map(i => data.data.high[i]),
                low: validIndexes.map(i => data.data.low[i]),
                close: validIndexes.map(i => data.data.close[i]),
                volume: validIndexes.map(i => data.data.volume[i])
            };

            // Получаем размеры контейнера
            const chartContainer = document.getElementById('tradingChart');
            const containerInfo = {
                width: chartContainer.clientWidth,
                height: chartContainer.clientHeight,
                offsetWidth: chartContainer.offsetWidth,
                offsetHeight: chartContainer.offsetHeight,
                isVisible: chartContainer.offsetParent !== null
            };
            console.log('[TRADING] Container dimensions:', containerInfo);

            // Получаем текущий выбранный тикер
            const selectedPair = localStorage.getItem('selectedPair');

            // Создаем или обновляем график
            if (!this.tradingChart) {
                console.log('[TRADING] Creating new chart instance');
                this.tradingChart = new CanvasTradingChart('tradingChart', {
                    theme: document.body.getAttribute('data-theme') === 'light' ? 'light' : 'dark',
                    width: containerInfo.width,
                    height: containerInfo.height,
                    ticker: selectedPair
                });
            } else {
                // Обновляем тикер в существующем графике
                this.tradingChart.updateTicker(selectedPair);
            }

            // Обновляем данные графика
            console.log('[TRADING] Updating chart data');
            this.tradingChart.updateData(validData);
        } catch (error) {
            console.error('[TRADING] Error updating chart:', error);
            this.showErrorNotification('Ошибка при обновлении графика');
        }
    }
    
    updateIndicators(data) {
        console.log('[TRADING] Updating indicators with data:', data);
        if (!data || !data.data) {
            console.error('[TRADING] Invalid indicators data');
            return;
        }

        const indicators = data.data;

        // Обновляем RSI
        const rsiElement = document.getElementById('rsiValue');
        if (rsiElement && indicators.rsi) {
            rsiElement.textContent = `${indicators.rsi}`;
            rsiElement.className = indicators.rsi > 70 ? 'overbought' : 
                                 indicators.rsi < 30 ? 'oversold' : 'neutral';
        }

        // Обновляем MACD
        const macdElement = document.getElementById('macdValue');
        if (macdElement && indicators.macd) {
            macdElement.innerHTML = `
                MACD: ${indicators.macd.macd}<br>
                Signal: ${indicators.macd.signal}<br>
                Hist: ${indicators.macd.histogram}
            `;
            macdElement.className = indicators.macd.histogram > 0 ? 'positive' : 'negative';
        }

        // Обновляем MFI
        const mfiElement = document.getElementById('mfiValue');
        if (mfiElement && indicators.mfi) {
            mfiElement.textContent = `${indicators.mfi}`;
            mfiElement.className = indicators.mfi > 80 ? 'overbought' : 
                                 indicators.mfi < 20 ? 'oversold' : 'neutral';
        }

        // Обновляем DMI
        const dmiElement = document.getElementById('dmiValue');
        if (dmiElement && indicators.dmi) {
            dmiElement.innerHTML = `
                +DI: ${indicators.dmi.plus_di}<br>
                -DI: ${indicators.dmi.minus_di}<br>
                ADX: ${indicators.dmi.adx}
            `;
            dmiElement.className = indicators.dmi.plus_di > indicators.dmi.minus_di ? 'positive' : 'negative';
        }

        // Обновляем анализ
        this.updateAnalysis(indicators);
    }
    
    updateAnalysis(data) {
        console.log('[TRADING] Updating analysis with data:', data);
        if (!data) {
            console.error('[TRADING] Invalid analysis data');
            return;
        }

        // Обновляем силу тренда
        const trendStrengthElement = document.getElementById('trendStrength');
        if (trendStrengthElement) {
            trendStrengthElement.textContent = `Сила тренда: ${data.trendStrength}`;
        }

        // Обновляем направление тренда
        const trendDirectionElement = document.getElementById('trendDirection');
        if (trendDirectionElement) {
            trendDirectionElement.textContent = `Направление: ${data.trendDirection}`;
            trendDirectionElement.className = data.trendDirection === 'Восходящий' ? 'positive' : 
                                            data.trendDirection === 'Нисходящий' ? 'negative' : 'neutral';
        }

        // Обновляем рекомендации
        const recommendationElement = document.getElementById('positionRecommendation');
        if (recommendationElement) {
            recommendationElement.textContent = data.positionRecommendation;
            recommendationElement.className = data.positionRecommendation.includes('покупку') ? 'positive' :
                                           data.positionRecommendation.includes('продажу') ? 'negative' : 'neutral';
        }

        // Обновляем стратегию
        const strategyElement = document.getElementById('smartMoneyStrategy');
        if (strategyElement) {
            strategyElement.textContent = data.smartMoneyStrategy;
            strategyElement.className = data.smartMoneyStrategy.includes('покупка') ? 'positive' :
                                      data.smartMoneyStrategy.includes('продажа') ? 'negative' : 'neutral';
        }

        // Обновляем уровни
        const bottomLevelElement = document.getElementById('bottomLevel');
        if (bottomLevelElement) {
            bottomLevelElement.textContent = `Поддержка: ${data.bottomLevel}`;
        }

        const topLevelElement = document.getElementById('topLevel');
        if (topLevelElement) {
            topLevelElement.textContent = `Сопротивление: ${data.topLevel}`;
        }
    }

    // Добавляем метод для глобального поиска
    filterPairs(searchText) {
        const pairsList = document.getElementById('availablePairsList');
        if (!pairsList) return;

        const items = pairsList.getElementsByTagName('li');
        let visibleCount = 0;
        
        for (const item of items) {
            const symbol = item.dataset.symbol;
            const matchesSearch = !searchText || symbol.toLowerCase().includes(searchText.toLowerCase());
            
            // Проверяем текущий фильтр, если он установлен
            let matchesFilter = true;
            if (window.tradingFilters && window.tradingFilters.currentFilter !== 'все') {
                const analysis = window.tradingFilters.tickersData.get(symbol);
                if (analysis) {
                    matchesFilter = window.tradingFilters.checkFilter(symbol, window.tradingFilters.currentFilter);
                }
            }
            
            const visible = matchesSearch && matchesFilter;
            item.style.display = visible ? '' : 'none';
            if (visible) visibleCount++;
        }
        
        // Обновляем счетчики
        const totalPairsElement = document.getElementById('totalPairs');
        const filteredPairsElement = document.getElementById('filteredPairs');
        
        if (totalPairsElement) totalPairsElement.textContent = items.length;
        if (filteredPairsElement) filteredPairsElement.textContent = visibleCount;
    }
}

// В начале файла добавим функции для работы с localStorage
function saveFilterState(containerId, value) {
    localStorage.setItem(`sort_${containerId}`, value);
}

function loadFilterState(containerId) {
    return localStorage.getItem(`sort_${containerId}`) || 'pnl_desc'; // значение по умолчанию
}

// Обновляем функцию инициализации сортировки
function initializeSortSelects() {
    const sortSelects = {
        'sort-high-profitable-positions': '#high-profitable-positions',
        'sort-profitable-positions': '#profitable-positions',
        'sort-losing-positions': '#losing-positions'
    };

    Object.entries(sortSelects).forEach(([selectId, containerId]) => {
        const select = document.getElementById(selectId);
        if (select) {
            // Загруаем сохраненное значение
            const savedValue = loadFilterState(containerId);
            select.value = savedValue;

            select.addEventListener('change', function() {
                // Сохраняем новое значение
                saveFilterState(containerId, this.value);
                updatePositions();
            });
        }
    });

    // Инициализация сортировки для закрытых позиций
    const closedPnlSort = document.getElementById('sortSelect');
    if (closedPnlSort) {
        const savedValue = loadFilterState('closedPnl');
        closedPnlSort.value = savedValue;
        
        closedPnlSort.addEventListener('change', function() {
            saveFilterState('closedPnl', this.value);
            updateClosedPnl();
        });
    }
}

// Инициализация приожения при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    console.log('[INIT] DOMContentLoaded event fired');
    console.log('[INIT] Creating App instance');
    window.app = new App();
}); 

class ClosedPnlManager {
    constructor() {
        this.data = [];
        this.currentPage = 1;
        this.pageSize = parseInt(storageUtils.get('pageSize', DEFAULTS.PAGE_SIZE));
    }

    async loadData(sortBy) {
        try {
            const data = await apiUtils.fetchData(API_ENDPOINTS.GET_CLOSED_PNL, { sort: sortBy });
            if (data?.closed_pnl) {
                this.data = data.closed_pnl;
                return true;
            }
            return false;
        } catch (error) {
            console.error("Error loading closed PNL data:", error);
            return false;
        }
    }

    getCurrentPageData() {
        const start = (this.currentPage - 1) * this.pageSize;
        const end = start + this.pageSize;
        return this.data.slice(start, end);
    }
} 

// Добавляем в начало файла app.js
function toggleMenu() {
    const dropdown = document.getElementById('menuDropdown');
    dropdown.classList.toggle('active');
}

// Добавляем обработчик клика вне меню для его закрытия
document.addEventListener('click', (e) => {
    const menu = document.querySelector('.burger-menu');
    const dropdown = document.getElementById('menuDropdown');
    if (!menu.contains(e.target) && dropdown.classList.contains('active')) {
        dropdown.classList.remove('active');
    }
}); 