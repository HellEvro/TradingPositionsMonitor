class Routes {
    constructor() {
        this.currentRoute = null;
        this.routes = {
            'positions': {
                title: 'Позиции',
                init: () => {
                    // Инициализация страницы позиций
                    if (!window.positionsManager) {
                        window.positionsManager = new PositionsManager();
                    }
                }
            },
            'trading': {
                title: 'Торговля',
                init: () => {
                    // Инициализация страницы торговли
                    if (!window.tradingManager) {
                        window.tradingManager = new TradingManager();
                    }
                }
            },
            'closedPnl': {
                title: 'Закрытые PNL',
                init: () => {
                    // Инициализация страницы закрытых PNL
                    if (!window.closedPnlManager) {
                        window.closedPnlManager = new ClosedPnlManager();
                    }
                }
            }
        };

        this.initializeRoutes();
    }

    initializeRoutes() {
        // Обработчик клика по пунктам меню
        document.querySelectorAll('.menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const route = e.target.getAttribute('data-tab');
                if (route && this.routes[route]) {
                    this.navigate(route);
                }
            });
        });

        // Восстанавливаем последнюю активную страницу
        const savedRoute = localStorage.getItem('currentRoute') || 'positions';
        this.navigate(savedRoute);
    }

    navigate(route) {
        if (!this.routes[route]) return;

        // Скрываем все страницы
        document.querySelectorAll('.tab-content').forEach(el => {
            el.classList.add('hidden');
        });

        // Показываем нужную страницу
        const container = document.getElementById(`${route}Container`);
        if (container) {
            container.classList.remove('hidden');
        }

        // Обновляем активный пункт меню
        document.querySelectorAll('.menu-item').forEach(item => {
            item.classList.remove('active');
            if (item.getAttribute('data-tab') === route) {
                item.classList.add('active');
            }
        });

        // Обновляем заголовок в бургер-меню
        const currentPage = document.getElementById('currentPage');
        if (currentPage) {
            currentPage.textContent = this.routes[route].title;
        }

        // Инициализируем компоненты страницы
        this.routes[route].init();

        // Сохраняем текущий маршрут
        this.currentRoute = route;
        localStorage.setItem('currentRoute', route);
    }

    getCurrentRoute() {
        return this.currentRoute;
    }
}

// Создаем экземпляр роутера при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    window.routes = new Routes();
}); 