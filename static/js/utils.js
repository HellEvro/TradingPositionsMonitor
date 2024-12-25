// Форматирование чисел
const formatUtils = {
    formatNumber: (number, decimals = 2) => {
        return Number(number).toFixed(decimals);
    },
    
    formatTime: (date) => {
        return date.toLocaleTimeString([], CHART_CONFIG.TIME_FORMAT);
    },

    formatLastUpdate: () => {
        const now = new Date();
        return now.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }
};

// Работа с DOM
const domUtils = {
    getElement: (id) => document.getElementById(id),
    
    createElement: (tag, className, innerHTML) => {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (innerHTML) element.innerHTML = innerHTML;
        return element;
    },
    
    setInnerHTML: (id, html) => {
        const element = document.getElementById(id);
        if (element) element.innerHTML = html;
    },
    
    setDisplay: (id, display) => {
        const element = document.getElementById(id);
        if (element) element.style.display = display;
    }
};

// Работа с хранилищем
const storageUtils = {
    get: (key, defaultValue) => {
        try {
            const value = localStorage.getItem(key);
            if (value === null) return defaultValue;
            // Если значение - строка в кавычках, возвращаем её как есть
            if (value.startsWith('"') && value.endsWith('"')) {
                return JSON.parse(value);
            }
            // Для простых строк без кавычек
            if (!value.startsWith('{') && !value.startsWith('[')) {
                return value;
            }
            return JSON.parse(value);
        } catch (e) {
            console.warn(`Error parsing value for key ${key}, returning default`, e);
            return defaultValue;
        }
    },
    
    set: (key, value) => {
        try {
            // Для строк используем прямую запись, для объектов - JSON.stringify
            const valueToStore = typeof value === 'string' ? value : JSON.stringify(value);
            localStorage.setItem(key, valueToStore);
        } catch (e) {
            console.warn(`Error saving value for key ${key}`, e);
        }
    }
};

// Работа с API
const apiUtils = {
    async fetchData(url, params = {}) {
        try {
            console.log(`Fetching data from ${url}`, params);
            const queryString = new URLSearchParams(params).toString();
            const fullUrl = queryString ? `${url}?${queryString}` : url;
            const response = await fetch(fullUrl);
            const data = await response.json();
            console.log(`Received data from ${url}:`, data);
            return data;
        } catch (error) {
            console.error('API Error:', error);
            return null;
        }
    }
};

// Сортировка данных
const sortUtils = {
    sortPositions: (positions, sortBy, isLosing = false) => {
        return [...positions].sort((a, b) => {
            switch(sortBy) {
                case 'pnl_desc':
                    return isLosing ? a.pnl - b.pnl : b.pnl - a.pnl;
                case 'pnl_asc':
                    return isLosing ? b.pnl - a.pnl : a.pnl - b.pnl;
                case 'alphabet_asc':
                    return a.symbol.localeCompare(b.symbol);
                case 'alphabet_desc':
                    return b.symbol.localeCompare(a.symbol);
                default:
                    return 0;
            }
        });
    }
};

// Фильтрация данных
const filterUtils = {
    filterPositions: (positions, threshold) => {
        return {
            highProfitable: positions.filter(pos => pos.pnl >= threshold),
            profitable: positions.filter(pos => pos.pnl < threshold && pos.pnl > 0),
            losing: positions.filter(pos => pos.pnl < 0)
        };
    }
};

// Изменяем объект languageUtils
const languageUtils = {
    getCurrentLanguage() {
        return document.documentElement.lang || 'en';
    },

    async setLanguage(lang) {
        try {
            const response = await fetch('/api/set_language', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ language: lang })
            });
            
            if (response.ok) {
                document.documentElement.lang = lang;
                console.log('Language changed to:', lang);
                return true;
            }
            return false;
        } catch (error) {
            console.error('Error saving language:', error);
            return false;
        }
    },

    translate(key) {
        const currentLang = this.getCurrentLanguage();
        return TRANSLATIONS[currentLang][key] || key;
    },

    getTranslation(key, params = {}) {
        const currentLang = this.getCurrentLanguage();
        let text = TRANSLATIONS[currentLang][key] || key;
        
        // Заменяем параметры в строке
        Object.entries(params).forEach(([param, value]) => {
            text = text.replace(`{${param}}`, value);
        });
        
        return text;
    }
};

// Обновляем функцию toggleLanguage
async function toggleLanguage() {
    console.log('toggleLanguage called');
    const currentLang = languageUtils.getCurrentLanguage();
    console.log('Current language:', currentLang);
    const newLang = currentLang === 'ru' ? 'en' : 'ru';
    console.log('Switching to:', newLang);
    
    try {
        const success = await languageUtils.setLanguage(newLang);
        console.log('Language set success:', success);
        if (success) {
            console.log('Updating interface...');
            updateInterface();
            console.log('Interface updated');
        }
    } catch (error) {
        console.error('Error in toggleLanguage:', error);
    }
}

// Делаем функцию глобальной
window.toggleLanguage = toggleLanguage;

// Обновляем функцию updateInterface и добавляем updateBlockHeaders
function updateInterface() {
    // Обновляем все текстовые элементы с data-translate
    document.querySelectorAll('[data-translate]').forEach(element => {
        const key = element.getAttribute('data-translate');
        element.textContent = languageUtils.translate(key);
    });

    // Обновляем placeholder для поиска
    const searchInput = document.getElementById('tickerSearch');
    if (searchInput) {
        searchInput.placeholder = languageUtils.translate('searchPlaceholder');
    }

    // Обновляем статичные тексты
    updateStaticTexts();
}

function updateStaticTexts() {
    const currentLang = languageUtils.getCurrentLanguage();
    const texts = {
        'last-update': currentLang === 'ru' ? 'Последнее обновление' : 'Last update',
        'total-pnl-label': languageUtils.translate('totalPnl'),
        'total-profit-label': languageUtils.translate('profit'),
        'total-loss-label': languageUtils.translate('loss'),
        'total-trades-label': languageUtils.translate('totalTrades'),
        'total-high-profitable-label': languageUtils.translate('highProfitableTrades'),  
        'total-all-profitable-label': languageUtils.translate('totalAllProfitable'),
        'total-losing-label': languageUtils.translate('totalLosing'),
        'profitable-trades-label': languageUtils.translate('profitableTrades'),
        'losing-trades-label': languageUtils.translate('losingTrades'),
        'topProfitable': languageUtils.translate('topProfitable'),
        'topLosing': languageUtils.translate('topLosing'),
        'rapid-growth-title': languageUtils.translate('rapidGrowth'),
        'clear-rapid-growth': languageUtils.translate('clear')
    };

    // Обновляем тексты
    Object.entries(texts).forEach(([key, text]) => {
        const elements = document.querySelectorAll(`[data-translate="${key}"]`);
        elements.forEach(element => {
            element.textContent = text;
        });
    });

    // Добавляем двоеточие после "Последнее обновление"
    const lastUpdateElement = document.querySelector('[data-translate="last-update"]');
    if (lastUpdateElement) {
        lastUpdateElement.textContent += ':';
    }

    // Добавляем двоеточие после заголовков TOP-3
    const topHeaders = document.querySelectorAll('h3[data-translate]');
    topHeaders.forEach(header => {
        header.textContent += ':';
    });

    // Обновляем опции сортировки
    document.querySelectorAll('.sort-select').forEach(select => {
        const options = {
            'pnl_desc': languageUtils.translate('sort_pnl_desc'),
            'pnl_asc': languageUtils.translate('sort_pnl_asc'),
            'roi_desc': languageUtils.translate('sort_roi_desc'),
            'roi_asc': languageUtils.translate('sort_roi_asc'),
            'alphabet_asc': languageUtils.translate('sort_alphabet_asc'),
            'alphabet_desc': languageUtils.translate('sort_alphabet_desc')
        };
        
        Array.from(select.options).forEach(option => {
            option.text = options[option.value] || option.text;
        });
    });

    // Обновляем текст сортировки
    document.querySelectorAll('.sort-label').forEach(label => {
        label.textContent = currentLang === 'ru' ? 'Сортировка:' : 'Sort:';
    });

    // Обновляем информацию о странице
    const pageInfo = document.getElementById('pageInfo');
    if (pageInfo) {
        const text = pageInfo.textContent;
        const [currentPage, totalPages] = text.match(/\d+/g) || ['', ''];
        if (currentPage && totalPages) {
            pageInfo.textContent = `${languageUtils.translate('page')} ${currentPage} ${languageUtils.translate('of')} ${totalPages}`;
        }
    }

    // Обновляем опции сортировки в таблице закрытых позиций
    const sortSelect = document.getElementById('sortSelect');
    if (sortSelect) {
        Array.from(sortSelect.options).forEach(option => {
            const key = option.getAttribute('data-translate');
            if (key) {
                option.text = languageUtils.translate(key);
            }
        });
    }
}

// Добавляем функцию для переключения темы
function toggleTheme() {
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
    if (window.app?.statisticsManager) {
        window.app.statisticsManager.initializeChart();
    }
}

// В конце файла utils.js добавляем:
window.languageUtils = languageUtils;
  