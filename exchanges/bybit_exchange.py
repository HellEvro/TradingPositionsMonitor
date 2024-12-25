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
import numpy as np
import pandas as pd
import logging

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
        self.limit_order_offset = limit_order_offset  # Отсутп цены для лимитного ордера в процентах
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
            
            # Разбиваем запрос на ериоды по 7 дней
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
            print(f"[BYBIT] Закрытие позиции {symbol}, объём: {size}, сторона: {side}, тип: {order_type}")
            
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
        """Получение списка всех доступных ессрочных фьючерсов"""
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

    def get_chart_data(self, symbol, timeframe='1h', period='1w'):
        """Получение данных для графика
        
        Args:
            symbol (str): Символ торговой пары
            timeframe (str): Таймфрейм ('1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', 'all')
            period (str): Период ('1d', '1w', '1M')
            
        Returns:
            dict: Данные для построения графика
        """
        try:
            # Специальная обработка для таймфрейма "all"
            if timeframe == 'all':
                # Последовательно пробуем разные интервалы
                intervals = [
                    ('1', '1m'),
                    ('5', '5m'),
                    ('15', '15m'),
                    ('30', '30m'),
                    ('60', '1h'),
                    ('240', '4h'),
                    ('D', '1d'),
                    ('W', '1w')
                ]
                
                selected_interval = None
                selected_klines = None
                
                for interval, interval_name in intervals:
                    try:
                        print(f"[BYBIT] Пробуем интервал {interval_name}")
                        response = self.client.get_kline(
                            category="linear",
                            symbol=f"{symbol}USDT",
                            interval=interval,
                            limit=1000
                        )
                        
                        if response['retCode'] == 0:
                            klines = response['result']['list']
                            if len(klines) <= 500:
                                selected_interval = interval
                                selected_klines = klines
                                print(f"[BYBIT] Выбран интервал {interval_name} ({len(klines)} свечей)")
                                break
                            
                            # Если это последний интервал, используем его независимо от количества свечей
                            if interval == 'W':
                                selected_interval = interval
                                selected_klines = klines
                                print(f"[BYBIT] Использован последний интервал {interval_name} ({len(klines)} свечей)")
                    except Exception as e:
                        print(f"[BYBIT] Ошибка при получении данных для интервала {interval_name}: {e}")
                        continue
                
                if selected_interval and selected_klines:
                    candles = []
                    for k in selected_klines:
                        candle = {
                            'time': int(k[0]),
                            'open': float(k[1]),
                            'high': float(k[2]),
                            'low': float(k[3]),
                            'close': float(k[4]),
                            'volume': float(k[5])
                        }
                        candles.append(candle)
                    
                    # Сортируем свечи от старых к новым
                    candles.sort(key=lambda x: x['time'])
                    
                    return {
                        'success': True,
                        'data': {
                            'candles': candles
                        }
                    }
                else:
                    return {
                        'success': False,
                        'error': "Не удалось получить данные ни для одного интервала"
                    }
            else:
                # Стандартная обработка для конкретного таймфрейма
                timeframe_map = {
                    '1m': '1',
                    '5m': '5',
                    '15m': '15',
                    '30m': '30',
                    '1h': '60',
                    '4h': '240',
                    '1d': 'D',
                    '1w': 'W'
                }
                
                interval = timeframe_map.get(timeframe)
                if not interval:
                    print(f"[BYBIT] Неподдерживаемый таймфрейм: {timeframe}")
                    return {
                        'success': False,
                        'error': f'Неподдерживаемый таймфрейм: {timeframe}'
                    }
                
                response = self.client.get_kline(
                    category="linear",
                    symbol=f"{symbol}USDT",
                    interval=interval,
                    limit=1000
                )
                
                if response['retCode'] == 0:
                    candles = []
                    for k in response['result']['list']:
                        candle = {
                            'time': int(k[0]),
                            'open': float(k[1]),
                            'high': float(k[2]),
                            'low': float(k[3]),
                            'close': float(k[4]),
                            'volume': float(k[5])
                        }
                        candles.append(candle)
                    
                    # Сортируем свечи от старых к новым
                    candles.sort(key=lambda x: x['time'])
                    
                    return {
                        'success': True,
                        'data': {
                            'candles': candles
                        }
                    }
                
                return {
                    'success': False,
                    'error': f"Ошибка API: {response.get('retMsg', 'Неизвестная ошибка')}"
                }
            
        except Exception as e:
            print(f"[BYBIT] Ошибка получения данных графика: {e}")
            return {
                'success': False,
                'error': str(e)
            }

    def get_indicators(self, symbol, timeframe='1h'):
        """Получение значений индикаторов
        
        Args:
            symbol (str): Символ торговой пары
            timeframe (str): Таймфрейм
            
        Returns:
            dict: Значения индикаторов
        """
        try:
            print(f"[BYBIT] Запрос индикаторов для {symbol}, таймфрейм: {timeframe}")
            
            # Конвертируем таймфрейм в формат Bybit
            timeframe_map = {
                '1m': '1',
                '5m': '5',
                '15m': '15',
                '30m': '30',
                '1h': '60',
                '4h': '240',
                '1d': 'D',
                '1w': 'W'
            }
            
            interval = timeframe_map.get(timeframe)
            if not interval:
                print(f"[BYBIT] Неподдерживаемый таймфрейм: {timeframe}")
                return {
                    'success': False,
                    'error': f'Неподдерживаемый таймфрейм: {timeframe}'
                }

            # Получаем последние 100 свечей для расчета индикаторов
            response = self.client.get_kline(
                category="linear",
                symbol=f"{symbol}USDT",
                interval=interval,
                limit=100
            )

            if not response or response.get('retCode') != 0:
                return {
                    'success': False,
                    'error': 'Не удалось получить данные свечей'
                }

            klines = response.get('result', {}).get('list', [])
            if not klines:
                return {
                    'success': False,
                    'error': 'Нет данных свечей'
                }

            # Преобразуем данные в массивы для расчетов
            closes = np.array([float(k[4]) for k in klines])  # Цены закрытия
            highs = np.array([float(k[2]) for k in klines])   # Максимумы
            lows = np.array([float(k[3]) for k in klines])    # Минимумы
            volumes = np.array([float(k[5]) for k in klines])  # Объемы
            timestamps = [int(k[0]) for k in klines]          # Временные метки

            # 1. Расчет RSI
            rsi = self._calculate_rsi(closes)
            current_rsi = rsi[-1]
            
            # Определение состояния RSI
            rsi_status = "Нейтральный"
            if current_rsi >= 70:
                rsi_status = "Перекуплен"
            elif current_rsi <= 30:
                rsi_status = "Перепродан"

            # 2. Расчет тренда
            trend_info = self._calculate_trend(closes)
            
            # 3. Расчет объемов
            volume_info = self._calculate_volume_metrics(volumes)

            # 4. Расчет уровней поддержки и сопротивления
            support_resistance = self._calculate_support_resistance(highs, lows, closes)

            # 5. Расчет точек входа/выхода
            entry_exit = self._calculate_entry_exit_points(
                closes[-1], 
                support_resistance['support'], 
                support_resistance['resistance'],
                trend_info['direction']
            )

            # 6. Расчет торгового канала
            channel = self._calculate_trading_channel(highs, lows)

            # Формируем рекомендацию
            recommendation = self._generate_recommendation(
                current_rsi,
                trend_info['direction'],
                closes[-1],
                support_resistance,
                volume_info['volume_trend']
            )

            return {
                'success': True,
                'data': {
                    'time': {
                        'timestamp': timestamps[-1],
                        'datetime': datetime.fromtimestamp(timestamps[-1]/1000).strftime('%Y-%m-%d %H:%M:%S')
                    },
                    'price': {
                        'current': closes[-1],
                        'high_24h': max(highs[-24:]) if len(highs) >= 24 else highs[-1],
                        'low_24h': min(lows[-24:]) if len(lows) >= 24 else lows[-1]
                    },
                    'rsi': {
                        'value': round(current_rsi, 2),
                        'status': rsi_status
                    },
                    'trend': {
                        'direction': trend_info['direction'],
                        'strength': trend_info['strength']
                    },
                    'volume': {
                        'current_24h': volume_info['current_24h'],
                        'change_percent': volume_info['change_percent'],
                        'trend': volume_info['volume_trend']
                    },
                    'levels': {
                        'support': support_resistance['support'],
                        'resistance': support_resistance['resistance']
                    },
                    'entry_exit': {
                        'entry_point': entry_exit['entry_point'],
                        'stop_loss': entry_exit['stop_loss'],
                        'target': entry_exit['target']
                    },
                    'channel': {
                        'upper': channel['upper'],
                        'lower': channel['lower'],
                        'position': channel['position']
                    },
                    'recommendation': recommendation
                }
            }

        except Exception as e:
            print(f"[BYBIT] Ошибка при расчете индикаторов: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }

    def _calculate_rsi(self, closes, period=14):
        """Расчет RSI"""
        deltas = np.diff(closes)
        seed = deltas[:period+1]
        up = seed[seed >= 0].sum()/period
        down = -seed[seed < 0].sum()/period
        rs = up/down
        rsi = np.zeros_like(closes)
        rsi[:period] = 100. - 100./(1. + rs)

        for i in range(period, len(closes)):
            delta = deltas[i-1]
            if delta > 0:
                upval = delta
                downval = 0.
            else:
                upval = 0.
                downval = -delta

            up = (up*(period-1) + upval)/period
            down = (down*(period-1) + downval)/period
            rs = up/down
            rsi[i] = 100. - 100./(1. + rs)

        return rsi

    def _calculate_trend(self, closes):
        """Расчет тренда и его силы"""
        # Используем 20-периодную SMA для определения тренда
        sma20 = np.mean(closes[-20:])
        current_price = closes[-1]
        
        # Определяем направление тренда
        if current_price > sma20 * 1.02:  # Цена выше SMA на 2%
            direction = "Восходящий"
        elif current_price < sma20 * 0.98:  # Цена ниже SMA на 2%
            direction = "Нисходящий"
        else:
            direction = "Боковой"

        # Рассчитываем силу тренда на основе отклонения от SMA
        deviation = abs((current_price - sma20) / sma20 * 100)
        if deviation < 2:
            strength = "Слабый"
        elif deviation < 5:
            strength = "Умеренный"
        else:
            strength = "Сильный"

        return {
            'direction': direction,
            'strength': strength
        }

    def _calculate_volume_metrics(self, volumes):
        """Расчет метрик объема"""
        current_24h = sum(volumes[-24:]) if len(volumes) >= 24 else sum(volumes)
        prev_24h = sum(volumes[-48:-24]) if len(volumes) >= 48 else sum(volumes)
        
        # Изменение объема
        if prev_24h > 0:
            change_percent = ((current_24h - prev_24h) / prev_24h) * 100
        else:
            change_percent = 0

        # Определяем тренд объема
        if change_percent > 10:
            volume_trend = "Растущий"
        elif change_percent < -10:
            volume_trend = "Падающий"
        else:
            volume_trend = "Стабильный"

        return {
            'current_24h': current_24h,
            'change_percent': round(change_percent, 2),
            'volume_trend': volume_trend
        }

    def _calculate_support_resistance(self, highs, lows, closes):
        """Расчет уровней поддержки и сопротивления"""
        # Используем метод кластеризации цен
        all_prices = np.concatenate([highs, lows, closes])
        price_clusters = {}

        # Группируем цены в кластеры с погрешностью 0.5%
        for price in all_prices:
            found_cluster = False
            for cluster_price in list(price_clusters.keys()):
                if abs(price - cluster_price) / cluster_price < 0.005:
                    price_clusters[cluster_price] += 1
                    found_cluster = True
                    break
            if not found_cluster:
                price_clusters[price] = 1

        # Сортируем кластеры по количеству точек
        sorted_clusters = sorted(price_clusters.items(), key=lambda x: x[1], reverse=True)
        
        current_price = closes[-1]
        support = current_price
        resistance = current_price

        # Находим ближайшие уровни поддержки и сопротивления
        for price, _ in sorted_clusters:
            if price < current_price and price > support:
                support = price
            elif price > current_price and price < resistance:
                resistance = price

        return {
            'support': support,
            'resistance': resistance
        }

    def _calculate_entry_exit_points(self, current_price, support, resistance, trend):
        """Расчет точек входа, выхода и стоп-лосса"""
        # Расчет точки входа
        if trend == "Восходящий":
            entry_point = support + (resistance - support) * 0.382  # Уровень Фибоначчи
        else:
            entry_point = resistance - (resistance - support) * 0.382

        # Расчет стоп-лосса (2% от точки входа)
        stop_loss = entry_point * 0.98 if trend == "Восходящий" else entry_point * 1.02

        # Расчет целевой цены (соотношение риск/прибыль 1:2)
        risk = abs(entry_point - stop_loss)
        target = entry_point + (risk * 2) if trend == "Восходящий" else entry_point - (risk * 2)

        return {
            'entry_point': round(entry_point, 8),
            'stop_loss': round(stop_loss, 8),
            'target': round(target, 8)
        }

    def _calculate_trading_channel(self, highs, lows):
        """Расчет торгового канала"""
        # Используем последние 20 свечей для канала
        period = 20
        recent_highs = highs[-period:]
        recent_lows = lows[-period:]

        upper = np.max(recent_highs)
        lower = np.min(recent_lows)
        current = (highs[-1] + lows[-1]) / 2

        # Определяем положение текущей цены в канале
        channel_height = upper - lower
        if channel_height > 0:
            position_percent = ((current - lower) / channel_height) * 100
            if position_percent < 25:
                position = "Нижняя часть канала"
            elif position_percent > 75:
                position = "Верхняя часть канала"
            else:
                position = "Середина канала"
        else:
            position = "Неопределено"

        return {
            'upper': upper,
            'lower': lower,
            'position': position
        }

    def _generate_recommendation(self, rsi, trend_direction, current_price, support_resistance, volume_trend):
        """Генерация торговой рекомендации"""
        if rsi >= 70 and trend_direction == "Восходящий" and volume_trend == "Падающий":
            return "Возможна коррекция - рекомендуется фиксация прибыли"
        elif rsi <= 30 and trend_direction == "Нисходящий" and volume_trend == "Растущий":
            return "Возможен отскок - рекомендуется поиск точки входа"
        elif trend_direction == "Восходящий" and current_price < support_resistance['resistance']:
            return "Восходящий тренд - рассмотреть покупку на откате"
        elif trend_direction == "Нисходящий" and current_price > support_resistance['support']:
            return "Нисходящий тренд - рассмотреть продажу на росте"
        else:
            return "Нейтральная ситуация - рекомендуется наблюдение"

    def get_wallet_balance(self):
        """Получает общий баланс кошелька и реализованный PNL"""
        try:
            # Получаем баланс кошелька
            wallet_response = self.client.get_wallet_balance(
                accountType="UNIFIED",
                coin="USDT"
            )
            
            if wallet_response['retCode'] != 0:
                raise Exception(f"Failed to get wallet balance: {wallet_response['retMsg']}")
                
            wallet_data = wallet_response['result']['list'][0]
            
            # Получаем значения из правильных полей
            total_balance = float(wallet_data['totalWalletBalance'])  # Общий баланс
            available_balance = float(wallet_data['totalAvailableBalance'])  # Доступный баланс
            
            # Получаем реализованный PNL из данных кошелька
            coin_data = wallet_data['coin'][0]  # Берем данные для USDT
            realized_pnl = float(coin_data['cumRealisedPnl'])  # Используем накопленный реализованный PNL
            
            return {
                'total_balance': total_balance,
                'available_balance': available_balance,
                'realized_pnl': realized_pnl
            }
            
        except Exception as e:
            print(f"Error getting wallet balance: {str(e)}")
            print(f"Full wallet response: {wallet_response}")  # добавляем полный вывод ответа
            return {
                'total_balance': 0.0,
                'available_balance': 0.0,
                'realized_pnl': 0.0
            }