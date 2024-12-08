from pybit.unified_trading import HTTP
from .base_exchange import BaseExchange
from http.client import IncompleteRead, RemoteDisconnected
import requests.exceptions
import time
from datetime import datetime
import sys
from app.config import (
    GROWTH_MULTIPLIER,
    HIGH_ROI_THRESHOLD,
    HIGH_LOSS_THRESHOLD
)

# Устанавливаем кодировку для stdout
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

def clean_symbol(symbol):
    """Удаляет 'USDT' из названия символа"""
    return symbol.replace('USDT', '')

class BybitExchange(BaseExchange):
    def __init__(self, api_key, api_secret, test_server=False, position_mode='Hedge', limit_order_offset=0.1):
        super().__init__(api_key, api_secret)
        self.client = HTTP(
            api_key=api_key,
            api_secret=api_secret,
            testnet=test_server,
            timeout=30,
            recv_window=20000
        )
        self.position_mode = position_mode
        self.limit_order_offset = limit_order_offset  # Отступ цены для лимитного ордера в процентах
        self.daily_pnl = {}
        self.last_reset_day = None
        self.max_profit_values = {}
        self.max_loss_values = {}

    def reset_daily_pnl(self, positions):
        """Сброс значений PnL в 00:00"""
        self.daily_pnl = {}
        for position in positions:
            symbol = clean_symbol(position['symbol'])
            self.daily_pnl[symbol] = float(position['unrealisedPnl'])
        self.last_reset_day = datetime.now().date()

    def get_positions(self):
        try:
            retries = 3
            retry_delay = 5
            
            for attempt in range(retries):
                try:
                    all_positions = []
                    cursor = None
                    rapid_growth_positions = []
                    
                    while True:
                        params = {
                            "category": "linear",
                            "settleCoin": "USDT",
                            "limit": 100
                        }
                        if cursor:
                            params["cursor"] = cursor
                        
                        try:
                            response = self.client.get_positions(**params)
                            positions = response['result']['list']
                            
                            active_positions = [p for p in positions if abs(float(p['size'])) > 0]
                            all_positions.extend(active_positions)
                            
                            cursor = response['result'].get('nextPageCursor')
                            if not cursor:
                                break
                                
                        except (ConnectionError, IncompleteRead, RemoteDisconnected, requests.exceptions.ConnectionError) as e:
                            print("Connection error on attempt {}: {}".format(attempt + 1, str(e)))
                            if attempt < retries - 1:
                                time.sleep(retry_delay)
                                continue
                            raise
                    
                    if not all_positions:
                        print("No active positions")
                        return [], []

                    if self.last_reset_day is None or datetime.now().date() != self.last_reset_day:
                        self.reset_daily_pnl(all_positions)
                    
                    processed_positions = []
                    for position in all_positions:
                        symbol = clean_symbol(position['symbol'])
                        current_pnl = float(position['unrealisedPnl'])
                        position_size = abs(float(position['size']))
                        roi = (current_pnl / (float(position['avgPrice']) * position_size) * 100)
                        
                        if current_pnl > 0:
                            if symbol not in self.max_profit_values or current_pnl > self.max_profit_values[symbol]:
                                self.max_profit_values[symbol] = current_pnl
                        else:
                            if symbol not in self.max_loss_values or current_pnl < self.max_loss_values[symbol]:
                                self.max_loss_values[symbol] = current_pnl
                        
                        position_info = {
                            'symbol': symbol,
                            'pnl': current_pnl,
                            'max_profit': self.max_profit_values.get(symbol, 0),
                            'max_loss': self.max_loss_values.get(symbol, 0),
                            'roi': roi,
                            'high_roi': roi > HIGH_ROI_THRESHOLD,
                            'high_loss': current_pnl < HIGH_LOSS_THRESHOLD,
                            'side': 'Long' if position['side'] == 'Buy' else 'Short',
                            'size': position_size
                        }
                        
                        processed_positions.append(position_info)
                        
                        if symbol in self.daily_pnl:
                            start_pnl = self.daily_pnl[symbol]
                            if start_pnl > 0 and current_pnl > 0:
                                growth_ratio = current_pnl / start_pnl
                                if growth_ratio >= GROWTH_MULTIPLIER:
                                    rapid_growth_positions.append({
                                        'symbol': symbol,
                                        'start_pnl': start_pnl,
                                        'current_pnl': current_pnl,
                                        'growth_ratio': growth_ratio
                                    })
                        else:
                            self.daily_pnl[symbol] = current_pnl
                    
                    return processed_positions, rapid_growth_positions
                    
                except Exception as e:
                    if attempt < retries - 1:
                        print("Attempt {} failed: {}, retrying in {} seconds...".format(attempt + 1, str(e), retry_delay))
                        time.sleep(retry_delay)
                        continue
                    raise
                    
        except Exception as e:
            print("Error getting positions: {}".format(str(e)))
            return [], []

    def get_closed_pnl(self, sort_by='time'):
        try:
            print("[BYBIT] Getting closed PnL...")
            all_closed_pnl = []
            
            # Получаем текущее время
            end_time = int(time.time() * 1000)
            
            # Разбиваем запрос на периоды по 7 дней
            for i in range(4):  # Получаем данные за 28 дней (4 недели)
                period_end = end_time - (i * 7 * 24 * 60 * 60 * 1000)
                period_start = period_end - (7 * 24 * 60 * 60 * 1000)
                
                try:
                    cursor = None
                    while True:
                        params = {
                            "category": "linear",
                            "settleCoin": "USDT",
                            "limit": 100,
                            "startTime": str(period_start),
                            "endTime": str(period_end)
                        }
                        if cursor:
                            params["cursor"] = cursor
                        
                        print(f"[BYBIT] Fetching data for period {i+1}/4: {datetime.fromtimestamp(period_start/1000).strftime('%Y-%m-%d')} - {datetime.fromtimestamp(period_end/1000).strftime('%Y-%m-%d')}")
                        
                        response = self.client.get_closed_pnl(**params)
                        
                        if not response or response.get('retCode') != 0:
                            break
                        
                        positions = response['result'].get('list', [])
                        if not positions:
                            break
                            
                        for pos in positions:
                            pnl_record = {
                                'symbol': clean_symbol(pos['symbol']),
                                'qty': float(pos.get('qty', 0)),
                                'entry_price': float(pos.get('avgEntryPrice', 0)),
                                'exit_price': float(pos.get('avgExitPrice', 0)),
                                'closed_pnl': float(pos.get('closedPnl', 0)),
                                'close_time': datetime.fromtimestamp(
                                    int(pos.get('updatedTime', 0))/1000
                                ).strftime('%Y-%m-%d %H:%M:%S')
                            }
                            all_closed_pnl.append(pnl_record)
                            
                        cursor = response['result'].get('nextPageCursor')
                        if not cursor:
                            break
                            
                except Exception as e:
                    print(f"[BYBIT] Error processing period {i+1}: {str(e)}")
                    continue
            
            # Сортировка
            if sort_by == 'pnl':
                all_closed_pnl.sort(key=lambda x: abs(float(x['closed_pnl'])), reverse=True)
            else:  # По умолчанию сортируем по времени
                all_closed_pnl.sort(key=lambda x: x['close_time'], reverse=True)
            
            print(f"[BYBIT] Found total {len(all_closed_pnl)} closed positions")
            return all_closed_pnl
            
        except Exception as e:
            print(f"[BYBIT] Error in get_closed_pnl: {str(e)}")
            return []

    def get_symbol_chart_data(self, symbol):
        """Получает исторические данные для графика"""
        try:
            response = self.client.get_kline(
                category="linear",
                symbol=f"{symbol}USDT",
                interval="5",  # 5 минут
                limit=24  # 2 часа данных
            )
            if response['retCode'] == 0:
                return [float(k[4]) for k in response['result']['list']]  # Берем цены закрытия
            return []
        except Exception as e:
            print(f"Error getting chart data for {symbol}: {e}")
            return []

    def get_sma200_position(self, symbol):
        """Определяет положение цены относительно SMA200"""
        retries = 3
        retry_delay = 5
        
        for attempt in range(retries):
            try:
                response = self.client.get_kline(
                    category="linear",
                    symbol=f"{symbol}USDT",
                    interval="D",
                    limit=200
                )
                
                if response['retCode'] == 0:
                    closes = [float(k[4]) for k in response['result']['list']]
                    if len(closes) >= 200:
                        sma200 = sum(closes[:200]) / 200
                        current_price = float(closes[0])
                        result = current_price > sma200
                        return result
                return None
                
            except (ConnectionError, IncompleteRead, RemoteDisconnected, requests.exceptions.ConnectionError) as e:
                print(f"Error getting SMA200 for {symbol}: {e}")
                if attempt < retries - 1:
                    time.sleep(retry_delay)
                    continue
                return None
                
            except Exception as e:
                print(f"Error getting SMA200 for {symbol}: {e}")
                return None

    def get_ticker(self, symbol):
        """Получение текущих данных тикера"""
        try:
            print(f"[BYBIT] Getting ticker for {symbol}")
            
            # Получаем данные тикера
            response = self.client.get_tickers(
                category="linear",
                symbol=f"{symbol}USDT"
            )
            print(f"[BYBIT] Raw response: {response}")
            
            if response['retCode'] == 0 and response['result']['list']:
                ticker = response['result']['list'][0]
                result = {
                    'symbol': symbol,
                    'last': float(ticker['lastPrice']),
                    'bid': float(ticker['bid1Price']),
                    'ask': float(ticker['ask1Price']),
                    'timestamp': response['time']
                }
                print(f"[BYBIT] Processed ticker data: {result}")
                return result
                
            print(f"[BYBIT] Invalid response: {response}")
            return None
            
        except Exception as e:
            print(f"[BYBIT] Error getting ticker: {str(e)}")
            import traceback
            print(f"[BYBIT] Traceback: {traceback.format_exc()}")
            return None

    def close_position(self, symbol, size, side, order_type="Limit"):
        try:
            print(f"[BYBIT] Закрытие позиции {symbol}, объём: {size}, сторона: {side}, т��п: {order_type}")
            
            # Проверяем существование активной позиции
            try:
                response = self.client.get_positions(
                    category="linear",
                    symbol=f"{symbol}USDT"
                )
                
                if not response or response.get('retCode') != 0:
                    return {
                        'success': False,
                        'message': 'Ошибка при проверке позиций'
                    }
                
                positions = response['result']['list']
                active_position = None
                
                # Ищем позицию с нужной стороной
                for pos in positions:
                    pos_side = 'Long' if pos['side'] == 'Buy' else 'Short'
                    if abs(float(pos['size'])) > 0 and pos_side == side:
                        active_position = pos
                        break
                
                if not active_position:
                    return {
                        'success': False,
                        'message': f'Нет активной {side} позиции для {symbol}'
                    }
                
                print(f"[BYBIT] Found active position: {active_position}")
                
            except Exception as e:
                print(f"[BYBIT] Ошибка при проверке позиций: {str(e)}")
                return {
                    'success': False,
                    'message': f'Ошибка при проверке позиций: {str(e)}'
                }
            
            # Получаем текущую цену
            ticker = self.get_ticker(symbol)
            if not ticker:
                return {
                    'success': False,
                    'message': 'Не удалось получить текущую рыночную цену'
                }
            
            # Определяем сторону для закрытия (противоположную текущей позиции)
            close_side = "Sell" if side == "Long" else "Buy"
            
            # Базовые параметры ордера
            order_params = {
                "category": "linear",
                "symbol": f"{symbol}USDT",
                "side": close_side,
                "orderType": order_type.upper(),  # Важно: используем верхний регистр
                "qty": str(size),
                "reduceOnly": True,
                "positionIdx": 1 if side == "Long" else 2
            }

            # Добавляем цену для лимитных ордеров
            if order_type.upper() == "LIMIT":  # Проверяем в верхнем регистре
                price_multiplier = (100 - self.limit_order_offset) / 100 if close_side == "Buy" else (100 + self.limit_order_offset) / 100
                limit_price = ticker['ask'] * price_multiplier if close_side == "Buy" else ticker['bid'] * price_multiplier
                order_params["price"] = str(round(limit_price, 2))
                order_params["timeInForce"] = "GTC"
                print(f"[BYBIT] Calculated limit price: {limit_price}")
            
            print(f"[BYBIT] Sending order with params: {order_params}")
            response = self.client.place_order(**order_params)
            print(f"[BYBIT] Order response: {response}")
            
            if response['retCode'] == 0:
                close_price = float(order_params.get('price', ticker['last']))
                return {
                    'success': True,
                    'order_id': response['result']['orderId'],
                    'message': f'{order_type} ордер успешно размещён',
                    'close_price': close_price
                }
            else:
                return {
                    'success': False,
                    'message': f"Не удалось разместить {order_type} ордер: {response['retMsg']}"
                }
                
        except Exception as e:
            print(f"[BYBIT] Ошибка при закрытии позиции: {str(e)}")
            import traceback
            print(f"[BYBIT] Трейсбек: {traceback.format_exc()}")
            return {
                'success': False,
                'message': f"Ошибка при закрытии позиции: {str(e)}"
            }

    def get_all_pairs(self):
        """Получение списка всех доступных бессрочных фьючерсов"""
        try:
            response = self.client.get_instruments_info(
                category="linear",
                status="Trading"
            )
            
            if response and response['result']['list']:
                # Фильтруем только бессрочные контракты (USDT)
                pairs = [
                    clean_symbol(item['symbol'])  # Используем существующую функцию clean_symbol
                    for item in response['result']['list']
                    if item['symbol'].endswith('USDT')
                ]
                return sorted(pairs)
            return []
        except Exception as e:
            print(f"Error getting Bybit pairs: {str(e)}")
            return []