class ExchangeManager {
    constructor() {
        this.exchangeSelect = document.getElementById('exchange-select');
        this.selectedExchange = localStorage.getItem('selectedExchange') || 'bybit';
        this.initializeExchanges();
    }

    async initializeExchanges() {
        try {
            const response = await fetch('/api/exchanges');
            const data = await response.json();
            
            this.exchangeSelect.innerHTML = data.exchanges.map(exchange => {
                if (exchange.active) {
                    this.selectedExchange = exchange.name.toLowerCase();
                    localStorage.setItem('selectedExchange', this.selectedExchange);
                }
                return `
                    <option value="${exchange.name}" 
                            ${!exchange.enabled ? 'disabled' : ''} 
                            ${exchange.active ? 'selected' : ''}>
                        ${exchange.name}${!exchange.enabled ? ' (disabled)' : ''}
                    </option>
                `;
            }).join('');
            
            this.exchangeSelect.addEventListener('change', (e) => this.switchExchange(e.target.value));
            console.log('Current exchange:', this.selectedExchange);
        } catch (error) {
            console.error('Error initializing exchanges:', error);
        }
    }

    async switchExchange(exchangeName) {
        try {
            console.log('Starting exchange switch to:', exchangeName);
            const response = await fetch('/api/exchange', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ exchange: exchangeName })
            });
            
            const data = await response.json();
            console.log('Server response:', data);

            if (data.success) {
                this.selectedExchange = exchangeName.toLowerCase();
                localStorage.setItem('selectedExchange', this.selectedExchange);
                console.log('Switched to exchange:', this.selectedExchange);
                
                const message = languageUtils.getTranslation('SWITCHED_TO_EXCHANGE', {
                    exchangeName: exchangeName
                });
                console.log('Success message to show:', message);
                
                this.showSuccessMessage(message);
                
                console.log('Setting reload timeout...');
                setTimeout(() => {
                    console.log('Reloading page...');
                    window.location.reload();
                }, 1500);
            } else {
                console.log('Switch failed:', data.error);
                const errorMessage = data.error || languageUtils.getTranslation('switchError');
                console.log('Error message to show:', errorMessage);
                this.showErrorMessage(errorMessage);
            }
        } catch (error) {
            console.error('Error switching exchange:', error);
            const errorMessage = languageUtils.getTranslation('switchError');
            console.log('Error message to show:', errorMessage);
            this.showErrorMessage(errorMessage);
        }
    }

    async fetchTicker(symbol) {
        try {
            const response = await fetch(`/api/ticker/${symbol}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            return data;
        } catch (error) {
            console.error(`Error fetching ticker for ${symbol}:`, error);
            throw error;
        }
    }

    async createOrder(orderData) {
        try {
            const response = await fetch('/api/order', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(orderData)
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Error creating order:', error);
            throw error;
        }
    }

    showSuccessMessage(message) {
        console.log('Showing success message:', message);
        const notification = document.createElement('div');
        notification.className = 'notification success';
        notification.textContent = message;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 3000);
    }

    showErrorMessage(message) {
        console.log('Showing error message:', message);
        const notification = document.createElement('div');
        notification.className = 'notification error';
        notification.textContent = message;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 3000);
    }

    getSelectedExchange() {
        return this.selectedExchange.toLowerCase();
    }

    setSelectedExchange(exchange) {
        this.selectedExchange = exchange;
        // Обновить интерфейс и другие компоненты при необходимости
    }

    async fetchClosedPnl(sortBy = 'time') {
        try {
            console.log(`Fetching closed PNL, sort by: ${sortBy}`);
            const response = await fetch(`/api/closed_pnl?sort=${sortBy}`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            console.log(`Received ${data.closed_pnl?.length || 0} closed positions`);
            
            if (!data.success) {
                throw new Error(data.error || 'Failed to fetch closed PNL');
            }
            
            return data.closed_pnl || [];
        } catch (error) {
            console.error('Error fetching closed PNL:', error);
            this.showErrorMessage('Failed to load closed positions');
            return [];
        }
    }

    async getAllPairs() {
        try {
            const response = await fetch('/api/pairs');
            const data = await response.json();
            return data.pairs || [];
        } catch (error) {
            console.error('Error getting pairs:', error);
            return [];
        }
    }
} 