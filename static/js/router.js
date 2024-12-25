class Router {
    constructor() {
        this.currentTab = 'positions';
        this.initializeRouter();
    }

    initializeRouter() {
        document.querySelectorAll('.menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const tab = e.target.id.replace('MenuItem', '');
                this.navigate(tab);
            });
        });

        // Восстанавливаем последнюю активную вкладку
        const savedTab = localStorage.getItem('currentTab') || 'positions';
        this.navigate(savedTab);
    }

    navigate(tab) {
        // Скрываем все контейнеры
        document.querySelectorAll('.tab-content').forEach(el => {
            el.classList.add('hidden');
        });

        // Показываем нужный контейнер
        const container = document.getElementById(`${tab}Container`);
        if (container) {
            container.classList.remove('hidden');
        }

        // Обновляем активный пункт меню
        document.querySelectorAll('.menu-item').forEach(item => {
            item.classList.remove('active');
        });
        document.getElementById(`${tab}MenuItem`)?.classList.add('active');

        // Обновляем текст в бургер-меню
        const currentPage = document.getElementById('currentPage');
        if (currentPage) {
            currentPage.textContent = languageUtils.translate(tab);
        }

        // Сохраняем текущую вкладку
        this.currentTab = tab;
        localStorage.setItem('currentTab', tab);

        // Инициализируем компоненты вкладки
        if (tab === 'trading' && !window.tradingManager) {
            window.tradingManager = new TradingManager();
        }
    }
} 