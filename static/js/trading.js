// Глобальные переменные для хранения данных
let tickersData = new Map(); // Хранит данные о тикерах
let currentFilter = 'все';
let analysisInProgress = false;
let tickersCache = new Map(); // Кэш для данных тикеров

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing filters...');
    
    // Инициализируем фильтры
    initializeFilters();
    
    // Наблюдаем за списком тикеров
    const pairsList = document.getElementById('availablePairsList');
    if (pairsList) {
        // Если список уже содержит элементы, запускаем анализ
        const existingTickers = Array.from(pairsList.children).map(li => li.dataset.symbol);
        if (existingTickers.length > 0) {
            console.log('Found existing tickers:', existingTickers.length);
            analyzeAllTickers(existingTickers);
        }
        
        // Наблюдаем за изменениями
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    const tickers = Array.from(pairsList.children).map(li => li.dataset.symbol);
                    if (tickers.length > 0) {
                        console.log('New tickers loaded, starting analysis...');
                        analyzeAllTickers(tickers);
                        observer.disconnect();
                        break;
                    }
                }
            }
        });
        
        observer.observe(pairsList, {
            childList: true,
            subtree: true
        });
    } else {
        console.error('Pairs list element not found');
    }
});

// Инициализация фильтров и обработчиков событий
function initializeFilters() {
    console.log('Initializing filters...');
    const filterButtons = document.querySelectorAll('.filter-button');
    console.log('Found filter buttons:', filterButtons.length);
    
    filterButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            e.preventDefault(); // Предотвращаем стандартное поведение кнопки
            console.log('Filter button clicked:', this.dataset.filter);
            const filter = this.dataset.filter;
            
            // Обновляем активную кнопку
            filterButtons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            
            // Применяем фильтр
            applyFilter(filter);
        });
        
        // Добавляем обработчик наведения для визуальной обратной связи
        button.addEventListener('mouseover', function() {
            this.style.cursor = 'pointer';
        });
    });
}

// Функция для анализа тикера
function analyzeTicker(candles) {
    try {
        // Находим минимальную и максимальную цену
        const prices = candles.map(c => ({
            low: parseFloat(c.low),
            high: parseFloat(c.high),
            close: parseFloat(c.close)
        }));
        
        const minPrice = Math.min(...prices.map(p => p.low));
        const maxPrice = Math.max(...prices.map(p => p.high));
        const currentPrice = prices[prices.length - 1].close;
        
        // Определяем позицию цены в процентах от диапазона
        const priceRange = maxPrice - minPrice;
        if (priceRange === 0) return null;
        
        const positionPercent = ((currentPrice - minPrice) / priceRange) * 100;
        
        // Определяем тренд
        const period = 14; // период для определения тренда
        if (prices.length < period) return null;
        
        const recentPrices = prices.slice(-period).map(p => p.close);
        const firstHalf = recentPrices.slice(0, period/2).reduce((a, b) => a + b) / (period/2);
        const secondHalf = recentPrices.slice(period/2).reduce((a, b) => a + b) / (period/2);
        
        let trend;
        if (secondHalf > firstHalf * 1.02) {
            trend = 'рост';
        } else if (firstHalf > secondHalf * 1.02) {
            trend = 'падение';
        } else {
            trend = 'флэт';
        }
        
        // Определяем состояние тикера
        let state;
        if (positionPercent <= 10) {
            if (trend === 'падение') {
                state = 'падение';
            } else {
                state = 'дно рынка';
            }
        } else if (positionPercent <= 40) {
            state = trend;
        } else if (positionPercent <= 60) {
            state = trend;
        } else if (positionPercent <= 90) {
            if (trend === 'флэт') {
                state = 'диапазон распродажи';
            } else if (trend === 'падение') {
                state = 'диапазон падения';
            } else {
                state = 'рост';
            }
        } else {
            if (trend === 'флэт') {
                state = 'хай рынка';
            } else if (trend === 'падение') {
                state = 'падение';
            } else {
                state = 'диапазон распродажи';
            }
        }
        
        console.log(`Analysis for ticker: trend=${trend}, state=${state}, position=${positionPercent}%`); // Отладочный вывод
        
        return {
            trend,
            positionPercent,
            state,
            timestamp: Date.now()
        };
    } catch (error) {
        console.error('Error in analyzeTicker:', error);
        return null;
    }
}

// Функция для проверки актуальности кэша
function isCacheValid(cacheEntry) {
    const CACHE_LIFETIME = 5 * 60 * 1000; // 5 минут
    return cacheEntry && (Date.now() - cacheEntry.timestamp) < CACHE_LIFETIME;
}

// Функция для применения фильтра
function applyFilter(filter) {
    console.log('Applying filter:', filter);
    currentFilter = filter;
    
    const tickersList = document.getElementById('availablePairsList');
    if (!tickersList) {
        console.error('Tickers list not found');
        return;
    }
    
    const allTickers = Array.from(tickersList.children);
    let visibleCount = 0;
    
    allTickers.forEach(ticker => {
        const symbol = ticker.dataset.symbol;
        const analysis = tickersData.get(symbol);
        
        let visible = false;
        if (filter === 'все') {
            visible = true;
        } else if (analysis) {
            console.log(`Analyzing ${symbol}:`, analysis); // Отладочный вывод
            switch (filter) {
                case 'рост':
                    visible = analysis.trend === 'рост' || 
                             (analysis.state === 'рост' && analysis.positionPercent > 10);
                    break;
                case 'падение':
                    visible = analysis.trend === 'падение' || 
                             (analysis.state === 'падение' && analysis.positionPercent > 10);
                    break;
                case 'флэт':
                    visible = analysis.trend === 'флэт' && 
                             analysis.positionPercent > 10 && 
                             analysis.positionPercent < 90;
                    break;
                case 'дно рынка':
                    visible = analysis.state === 'дно рынка' && 
                             analysis.positionPercent <= 10 && 
                             (analysis.trend === 'флэт' || analysis.trend === 'рост');
                    break;
                case 'хай рынка':
                    visible = analysis.state === 'хай рынка' && 
                             analysis.positionPercent >= 90 && 
                             analysis.trend === 'флэт';
                    break;
                default:
                    console.log('Unknown filter:', filter); // Отладочный вывод
            }
            console.log(`Visibility for ${symbol}: ${visible}`); // Отладочный вывод
        }
        
        ticker.style.display = visible ? '' : 'none';
        if (visible) visibleCount++;
    });
    
    // Обновляем счетчики
    document.getElementById('totalPairs').textContent = allTickers.length;
    document.getElementById('filteredPairs').textContent = visibleCount;
    
    console.log(`Filter applied: ${visibleCount} of ${allTickers.length} visible`);
}

// Функция для обновления прогресс-бара
function updateProgress(current, total) {
    const progress = Math.min((current / total) * 100, 100);
    const progressBar = document.getElementById('analysisProgress');
    if (progressBar) {
        progressBar.style.width = `${progress}%`;
    }
}

// Функция для анализа всех тикеров
async function analyzeAllTickers(tickers) {
    if (analysisInProgress) {
        console.log('Analysis already in progress');
        return;
    }
    
    console.log('Starting analysis of tickers:', tickers.length);
    analysisInProgress = true;
    
    const loadingElement = document.getElementById('filterLoading');
    if (loadingElement) {
        loadingElement.style.display = 'block';
    }
    
    const total = tickers.length;
    let completed = 0;
    
    try {
        const batchSize = 5; // Анализируем по 5 тикеров одновременно
        for (let i = 0; i < tickers.length; i += batchSize) {
            const batch = tickers.slice(i, i + batchSize);
            await Promise.all(batch.map(async (ticker) => {
                try {
                    // Проверяем кэш
                    const cachedData = tickersCache.get(ticker);
                    if (isCacheValid(cachedData)) {
                        console.log(`Using cached data for ${ticker}`);
                        tickersData.set(ticker, cachedData);
                    } else {
                        console.log(`Fetching data for ${ticker}`);
                        const response = await fetch(`/api/candles/${ticker}`);
                        const data = await response.json();
                        
                        if (data.success && data.data && data.data.candles) {
                            const analysis = analyzeTicker(data.data.candles);
                            if (analysis) {
                                console.log(`Analysis completed for ${ticker}:`, analysis);
                                tickersData.set(ticker, analysis);
                                tickersCache.set(ticker, analysis);
                            }
                        }
                    }
                } catch (error) {
                    console.error(`Error analyzing ${ticker}:`, error);
                }
                
                completed++;
                updateProgress(completed, total);
            }));
            
            // Применяем текущий фильтр после каждой партии
            applyFilter(currentFilter);
            
            // Небольшая задержка между партиями для снижения нагрузки
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    } catch (error) {
        console.error('Error during batch processing:', error);
    } finally {
        analysisInProgress = false;
        if (loadingElement) {
            loadingElement.style.display = 'none';
        }
        console.log('Analysis completed');
        
        // Применяем фильтр еще раз после завершения всего анализа
        applyFilter(currentFilter);
    }
}

// Функция для обработки кнопок фильтра
function handleFilterButtons() {
    const filterButtons = document.querySelectorAll('.filter-button');
    console.log('Found filter buttons:', filterButtons.length);

    filterButtons.forEach(button => {
        button.onclick = function(e) {
            e.preventDefault();
            console.log('Filter button clicked:', this.dataset.filter);
            
            // Убираем активный класс у всех кнопок
            filterButtons.forEach(btn => btn.classList.remove('active'));
            // Добавляем активный класс нажатой кнопке
            this.classList.add('active');
            
            // Применяем фильтр
            const filter = this.dataset.filter;
            applyFilter(filter);
        };
    });
}

// Вызываем функцию при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing filter buttons...');
    handleFilterButtons();
}); 