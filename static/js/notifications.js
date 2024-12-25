class NotificationManager {
    static TYPES = {
        SUCCESS: 'success',
        ERROR: 'error',
        WARNING: 'warning',
        INFO: 'info'
    };

    static show(message, type = 'info', duration = 3000) {
        Logger.debug('NOTIFY', `Showing notification: ${message}`, { type });
        
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        // Добавляем анимацию появления
        notification.style.opacity = '0';
        notification.style.transform = 'translateY(20px)';
        
        document.body.appendChild(notification);
        
        // Запускаем анимацию появления
        requestAnimationFrame(() => {
            notification.style.transition = 'all 0.3s ease';
            notification.style.opacity = '1';
            notification.style.transform = 'translateY(0)';
        });
        
        // Удаляем с анимацией
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateY(-20px)';
            setTimeout(() => notification.remove(), 300);
        }, duration);

        // Поддерживаем обратную совместимость с console
        switch (type) {
            case this.TYPES.ERROR:
                console.error(message);
                break;
            case this.TYPES.WARNING:
                console.warn(message);
                break;
            default:
                console.log(message);
        }
    }

    static success(message) {
        this.show(message, this.TYPES.SUCCESS);
    }

    static error(message) {
        this.show(message, this.TYPES.ERROR);
    }

    static warning(message) {
        this.show(message, this.TYPES.WARNING);
    }

    static info(message) {
        this.show(message, this.TYPES.INFO);
    }
}

// Экспортируем в глобальную область
window.NotificationManager = NotificationManager; 