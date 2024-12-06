class SinglePositionCloser {
    constructor() {
        this.waitForPositionCloser().then(() => {
            this.initializeCloseButtons();
        });
        this.isProcessing = false;
    }

    async waitForPositionCloser() {
        while (!window.app?.positionCloser) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        this.positionCloser = window.app.positionCloser;
    }

    initializeCloseButtons() {
        document.addEventListener('click', async (e) => {
            if (e.target.matches('.close-position-btn.single-close')) {
                e.preventDefault();
                e.stopPropagation();
                
                if (this.isProcessing) {
                    return;
                }
                
                const positionElem = e.target.closest('.position');
                if (!positionElem) return;

                const container = positionElem.closest('[id$="-positions"]');
                const columnId = container ? container.id.replace('-positions', '') : null;

                const position = {
                    symbol: positionElem.dataset.symbol,
                    side: positionElem.dataset.side,
                    size: parseFloat(positionElem.dataset.size),
                    element: positionElem
                };

                try {
                    this.isProcessing = true;
                    positionElem.classList.add('processing');
                    
                    const confirmResult = await this.positionCloser.showConfirmDialog(1, columnId);
                    
                    if (confirmResult.confirmed) {
                        const results = await this.positionCloser.closePositions(
                            [position],
                            columnId,
                            confirmResult.orderType
                        );
                        
                        if (results.totalClosed > 0 || results.totalFailed > 0) {
                            this.positionCloser.handleCloseResults(results);
                            setTimeout(() => {
                                this.isProcessing = false;
                                positionElem.classList.remove('processing');
                            }, 300);
                        }
                    } else {
                        this.isProcessing = false;
                        positionElem.classList.remove('processing');
                    }
                } catch (error) {
                    console.error('Error closing position:', error);
                    this.positionCloser.showErrorMessage('Ошибка при закрытии позиции');
                    this.isProcessing = false;
                    positionElem.classList.remove('processing');
                }
            }
        }, { capture: true });
    }
}

window.addEventListener('load', () => {
    window.singlePositionCloser = new SinglePositionCloser();
}); 