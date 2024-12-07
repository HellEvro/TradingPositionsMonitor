class App {
    constructor() {
        console.log('[APP] Constructor called');
        try {
            console.log('[APP] Starting initialization...');
            this.isUpdating = false;
            this.menuInitialized = false;
            this.currentTab = null;
            
            // Добавляем логирование состояния
            this._logState = () => {
                console.log('[APP] Current state:', {
                    currentTab: this.currentTab,
                    menuInitialized: this.menuInitialized,
                    isUpdating: this.isUpdating
                });
            };
            
            // Инициализируем менеджеры сразу
            console.log('[APP] Initializing managers');
            this.statisticsManager = new StatisticsManager();
            this.positionsManager = new PositionsManager();
            this.exchangeManager = new ExchangeManager();
            this.positionCloser = new PositionCloser(this.exchangeManager);
            
            this.currentPage = 1;
            this.allClosedPnlData = [];
            this.availablePairs = new Set();
            
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
            
        } catch (e) {
            console.error('[APP] Error in constructor:', e);
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
                if (tradingContainer) tradingContainer.style.display = 'block';
                document.querySelector('.main-container').style.display = 'none';
                // Проверяем, инициализирован ли exchangeManager перед вызовом
                if (this.exchangeManager) {
                    // Обновляем список доступных пар при переключении на вкладку
                    this.updateAvailablePairs();
                } else {
                    console.log('[MENU] Exchange manager not initialized yet, skipping pairs update');
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

    async updateClosedPnl(resetPage = true) {
        try {
            const sortSelect = document.getElementById('sortSelect');
            if (!sortSelect) return;

            const sortBy = sortSelect.value;
            console.log('Updating closed PNL with sort:', sortBy);
            
            // Используем метод из exchangeManager
            const closedPnl = await this.exchangeManager.fetchClosedPnl(sortBy);
            
            if (Array.isArray(closedPnl)) {
                console.log(`Received ${closedPnl.length} closed positions`);
                this.updateClosedPnlTable(closedPnl, resetPage);
            } else {
                console.error('Invalid closed PNL data received:', closedPnl);
            }
        } catch (error) {
            console.error("Error updating closed PNL:", error);
            this.showErrorMessage('Failed to load closed positions');
        }
    }

    updateClosedPnlTable(data, resetPage) {
        if (!data) return;
        
        // Получаем текущий поисковый запрос
        const searchQuery = document.getElementById('tickerSearch')?.value.toUpperCase() || '';
        
        // Фильтруем данные по поисковому запросу
        const filteredData = searchQuery ? 
            data.filter(pnl => pnl.symbol.includes(searchQuery)) : 
            data;
        
        // Сохраняем отфильтрованные данные
        this.allClosedPnlData = filteredData;
        
        // Получаем текущую страницу и размер страницы
        const pageSize = parseInt(storageUtils.get('pageSize', DEFAULTS.PAGE_SIZE));
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
                    <td>
                        <a href="https://www.bybit.com/trade/usdt/${pnl.symbol}USDT" 
                           target="_blank" 
                           class="ticker">
                            ${pnl.symbol}
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
        const tableBody = domUtils.getElement('closedPnlTable');
        if (tableBody) {
            tableBody.innerHTML = tableHtml;
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
        const notification = document.createElement('div');
        notification.className = 'error-notification';
        notification.textContent = message;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 3000);
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
        try {
            if (!this.exchangeManager) {
                console.log('[PAIRS] Exchange manager not initialized yet');
                return;
            }

            // Получаем все активные позиции
            const positions = document.querySelectorAll('.position');
            const activePairs = new Set();
            
            positions.forEach(pos => {
                const symbol = pos.getAttribute('data-symbol');
                if (symbol) activePairs.add(symbol);
            });

            // Получаем все доступные пары с биржи
            const exchange = this.exchangeManager.getSelectedExchange();
            const allPairs = await this.exchangeManager.getAllPairs();
            
            // Фильтруем только те пары, которых нет в активных позициях
            this.availablePairs = new Set(
                allPairs.filter(pair => !activePairs.has(pair))
            );

            this.renderAvailablePairs();
        } catch (error) {
            console.error('Error updating available pairs:', error);
        }
    }

    filterAvailablePairs(searchQuery) {
        const query = searchQuery.toLowerCase();
        const pairsList = document.getElementById('availablePairsList');
        
        if (!pairsList) return;

        Array.from(pairsList.children).forEach(item => {
            const symbol = item.textContent.toLowerCase();
            item.style.display = symbol.includes(query) ? '' : 'none';
        });
    }

    renderAvailablePairs() {
        const pairsList = document.getElementById('availablePairsList');
        if (!pairsList) return;

        pairsList.innerHTML = '';

        if (this.availablePairs.size === 0) {
            pairsList.innerHTML = `<div class="no-pairs">${languageUtils.translate('noAvailablePairs')}</div>`;
            return;
        }

        Array.from(this.availablePairs)
            .sort()
            .forEach(pair => {
                const div = document.createElement('div');
                div.className = 'pair-item';
                div.textContent = pair;
                div.onclick = () => {
                    // Здесь можно добавить действие при клике на пару
                    console.log('Selected pair:', pair);
                };
                pairsList.appendChild(div);
            });
    }
}

// В начале файла добавим функции ��ля работы с localStorage
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
            // Загружаем сохраненное значение
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