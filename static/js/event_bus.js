class EventBus {
    constructor() {
        this.events = new Map();
        Logger.info('EVENT_BUS', 'Initialized');
    }

    on(event, callback) {
        if (!this.events.has(event)) {
            this.events.set(event, new Set());
        }
        this.events.get(event).add(callback);
        
        // Возвращаем функцию отписки
        return () => this.off(event, callback);
    }

    off(event, callback) {
        if (this.events.has(event)) {
            this.events.get(event).delete(callback);
        }
    }

    emit(event, data) {
        Logger.debug('EVENT_BUS', `Emitting event: ${event}`, data);
        if (this.events.has(event)) {
            this.events.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    Logger.error('EVENT_BUS', `Error in event handler for ${event}:`, error);
                }
            });
        }
    }

    clear() {
        this.events.clear();
    }
}

// Создаем глобальный экземпляр
window.eventBus = new EventBus(); 