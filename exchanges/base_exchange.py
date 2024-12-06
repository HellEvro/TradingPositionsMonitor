from abc import ABC, abstractmethod

class BaseExchange(ABC):
    def __init__(self, api_key, api_secret, position_mode='Hedge', limit_order_offset=0.01):
        self.api_key = api_key
        self.api_secret = api_secret
        self.position_mode = position_mode
        self.limit_order_offset = limit_order_offset
        self.max_profit_values = {}
        self.max_loss_values = {}
        self.daily_pnl = {}

    @abstractmethod
    def get_positions(self):
        """Получение активных позиций"""
        pass

    @abstractmethod
    def get_closed_pnl(self, sort_by='time'):
        """Получение закрытых позиций"""
        pass

    @abstractmethod
    def get_symbol_chart_data(self, symbol):
        """Получение данных для графика"""
        pass

    @abstractmethod
    def get_sma200_position(self, symbol):
        """Получение положения цены относительно SMA200"""
        pass

    @abstractmethod
    def get_ticker(self, symbol):
        """Получение текущих данных тикера"""
        pass

    @abstractmethod
    def close_position(self, symbol, size, side):
        """Закрытие позиции
        
        Args:
            symbol (str): Символ торговой пары (например, 'BTC')
            size (float): Размер позиции для закрытия
            side (str): Сторона позиции ('Long' или 'Short')
            
        Returns:
            dict: Результат закрытия позиции с полями:
                - success (bool): Успешность операции
                - message (str): Сообщение о результате
                - order_id (str, optional): ID созданного ордера
                - close_price (float, optional): Цена закрытия
        """
        pass

    @abstractmethod
    def get_all_pairs(self):
        """Получение списка всех доступных бессрочных фьючерсов"""
        pass