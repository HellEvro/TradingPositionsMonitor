from binance.client import Client
from .base_exchange import BaseExchange
from datetime import datetime, timedelta
import time
import traceback
import pandas as pd
import numpy as np

def clean_symbol(symbol):
    return symbol.replace('USDT', '')

class BinanceExchange(BaseExchange):
    def __init__(self, api_key, api_secret, position_mode='Hedge', limit_order_offset=0.01):
        super().__init__(api_key, api_secret, position_mode, limit_order_offset)
        self.client = Client(api_key, api_secret)
        self.daily_pnl = {}
        self.last_reset_day = None
        self.max_profit_values = {}
        self.max_loss_values = {}
        
        # Устанавливаем режим позиций
        try:
            if position_mode == 'Hedge':
                self.client.futures_change_position_mode(dualSidePosition=True)
            else:
                self.client.futures_change_position_mode(dualSidePosition=False)
        except Exception as e:
            if "No need to change position side" not in str(e):
                print(f"[BINANCE] Error setting position mode: {str(e)}")

    def get_positions(self):
        try:
            positions = self.client.futures_position_information()
            processed_positions = []
            rapid_growth_positions = []
            
            active_positions = [p for p in positions if float(p['positionAmt']) != 0]
            
            for position in active_positions:
                symbol = clean_symbol(position['symbol'])
                current_pnl = float(position['unRealizedProfit'])
                position_value = float(position['positionAmt']) * float(position['entryPrice'])
                roi = (current_pnl / position_value * 100) if position_value != 0 else 0
                
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
                    'high_roi': roi > 100,
                    'high_loss': current_pnl < -40,
                    'side': 'Long' if float(position['positionAmt']) > 0 else 'Short',
                    'size': abs(float(position['positionAmt']))
                }
                
                processed_positions.append(position_info)
                
                if symbol in self.daily_pnl:
                    start_pnl = self.daily_pnl[symbol]
                    if start_pnl > 0 and current_pnl > 0:
                        growth_ratio = current_pnl / start_pnl
                        if growth_ratio >= 2.0:
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
            return [], []

    def get_closed_pnl(self, sort_by='time'):
        """Получает историю закрытых позиций с PNL"""
        try:
            all_closed_pnl = []
            
            end_time = int(time.time() * 1000)
            start_time = end_time - (30 * 24 * 60 * 60 * 1000)  # 30 дней назад
            
            current_start = start_time
            while current_start < end_time:
                current_end = min(current_start + (7 * 24 * 60 * 60 * 1000), end_time)
                
                try:
                    trades = self.client.futures_account_trades(
                        startTime=current_start,
                        endTime=current_end,
                        limit=1000
                    )
                    
                    trades_by_position = {}
                    
                    # Группируем сделки по символу и positionSide
                    for trade in trades:
                        symbol = clean_symbol(trade['symbol'])
                        position_side = trade['positionSide']
                        key = f"{symbol}_{position_side}"
                        
                        if key not in trades_by_position:
                            trades_by_position[key] = []
                        trades_by_position[key].append(trade)
                    
                    # Обрабатываем каждую позицию
                    for key, position_trades in trades_by_position.items():
                        # Сортируем сделки по времени
                        position_trades.sort(key=lambda x: int(x['time']))
                        
                        # Находим сделки с PnL
                        pnl_trades = [t for t in position_trades if float(t['realizedPnl']) != 0]
                        
                        for pnl_trade in pnl_trades:
                            # Находим соответствующую сделку открытия
                            # Это последняя сделка перед текущей с противоположной стороной
                            entry_trade = None
                            pnl_trade_time = int(pnl_trade['time'])
                            pnl_trade_side = pnl_trade['side']
                            
                            # Ищем сделки открытия в обратном порядке
                            for t in reversed(position_trades):
                                if (int(t['time']) < pnl_trade_time and 
                                    t['side'] != pnl_trade_side):
                                    entry_trade = t
                                    break
                            
                            if entry_trade:
                                pnl_record = {
                                    'symbol': clean_symbol(pnl_trade['symbol']),
                                    'qty': abs(float(pnl_trade['qty'])),
                                    'entry_price': float(entry_trade['price']),
                                    'exit_price': float(pnl_trade['price']),
                                    'closed_pnl': float(pnl_trade['realizedPnl']),
                                    'close_time': datetime.fromtimestamp(
                                        int(pnl_trade['time'])/1000
                                    ).strftime('%Y-%m-%d %H:%M:%S'),
                                    'exchange': 'binance'
                                }
                                all_closed_pnl.append(pnl_record)
                    
                except Exception:
                    break
                
                current_start = current_end
            
            if sort_by == 'pnl':
                all_closed_pnl.sort(key=lambda x: abs(float(x['closed_pnl'])), reverse=True)
            else:  # sort by time
                all_closed_pnl.sort(key=lambda x: x['close_time'], reverse=True)
            
            return all_closed_pnl
            
        except Exception:
            return []

    def get_symbol_chart_data(self, symbol):
        try:
            # Преобразуем символ в формат Binance
            binance_symbol = f"{symbol}USDT"
            
            # Проверяем, существует ли такой символ
            exchange_info = self.client.futures_exchange_info()
            valid_symbols = [s['symbol'] for s in exchange_info['symbols']]
            
            if binance_symbol not in valid_symbols:
                print(f"Symbol {binance_symbol} not found in Binance")
                return []
            
            klines = self.client.futures_klines(
                symbol=binance_symbol,
                interval=Client.KLINE_INTERVAL_5MINUTE,
                limit=24
            )
            return [float(k[4]) for k in klines]  # Берем цены закрытия
        except Exception as e:
            print(f"Error getting Binance chart data for {symbol}: {e}")
            return []

    def get_sma200_position(self, symbol):
        try:
            # Преобразуем символ в формат Binance
            binance_symbol = f"{symbol}USDT"
            
            # Проверяем, существует ли такой символ
            exchange_info = self.client.futures_exchange_info()
            valid_symbols = [s['symbol'] for s in exchange_info['symbols']]
            
            if binance_symbol not in valid_symbols:
                print(f"Symbol {binance_symbol} not found in Binance")
                return None
            
            klines = self.client.futures_klines(
                symbol=binance_symbol,
                interval=Client.KLINE_INTERVAL_1DAY,
                limit=200
            )
            
            if len(klines) >= 200:
                closes = [float(k[4]) for k in klines]
                sma200 = sum(closes[:200]) / 200
                current_price = float(klines[0][4])
                return current_price > sma200
                
            return None
            
        except Exception as e:
            print(f"Error getting Binance SMA200 for {symbol}: {e}")
            return None

    def get_ticker(self, symbol):
        """Получение текущих данных тикера"""
        try:
            binance_symbol = f"{symbol}USDT"
            ticker = self.client.futures_orderbook_ticker(symbol=binance_symbol)
            mark_price = self.client.futures_mark_price(symbol=binance_symbol)
            return {
                'symbol': symbol,
                'last': float(mark_price['markPrice']),
                'bid': float(ticker['bidPrice']),
                'ask': float(ticker['askPrice']),
                'timestamp': int(time.time() * 1000)
            }
        except Exception as e:
            print(f"Ошибка получения тикера для {symbol}: {e}")
            return None

    def close_position(self, symbol, size, side, order_type="Limit"):
        try:
            # Проверяем существование позиции
            try:
                positions = self.client.futures_position_information(symbol=f"{symbol}USDT")
                active_position = None
                
                for pos in positions:
                    pos_side = "Long" if float(pos['positionAmt']) > 0 else "Short"
                    if float(pos['positionAmt']) != 0 and pos_side == side:
                        active_position = pos
                        break
                
                if not active_position:
                    return {
                        'success': False,
                        'message': f'No active {side} position found for {symbol}'
                    }
                
            except Exception as e:
                return {
                    'success': False,
                    'message': f'Error checking position: {str(e)}'
                }
            
            # Получаем текущую цену
            ticker = self.get_ticker(symbol)
            if not ticker:
                return {
                    'success': False,
                    'message': 'Could not get current price'
                }
            
            # Определяем направление закрытия
            close_side = "SELL" if side == "Long" else "BUY"
            
            # Базовые параметры ордера
            order_params = {
                'symbol': f"{symbol}USDT",
                'side': close_side,
                'type': order_type.upper(),
                'quantity': str(size)
            }
            
            # Добавляем positionSide для режима хеджирования
            if self.position_mode == 'Hedge':
                order_params['positionSide'] = "LONG" if side == "Long" else "SHORT"
            
            # Добавляем параметры для лимитных ордеров
            if order_type.upper() == "LIMIT":
                price_multiplier = (100 - self.limit_order_offset) / 100 if close_side == "BUY" else (100 + self.limit_order_offset) / 100
                limit_price = ticker['ask'] * price_multiplier if close_side == "BUY" else ticker['bid'] * price_multiplier
                order_params['price'] = str(round(limit_price, 4))
                order_params['timeInForce'] = 'GTC'
            
            response = self.client.futures_create_order(**order_params)
            
            if response and response.get('orderId'):
                close_price = float(order_params.get('price', ticker['last']))
                return {
                    'success': True,
                    'order_id': response['orderId'],
                    'message': f'{order_type} order placed successfully',
                    'close_price': close_price
                }
            else:
                error_msg = response.get('msg', 'Unknown error')
                return {
                    'success': False,
                    'message': f'Failed to place {order_type} order: {error_msg}'
                }
                
        except Exception as e:
            print(f"[BINANCE] Error closing position: {str(e)}")
            return {
                'success': False,
                'message': f'Error closing position: {str(e)}'
            }

    def get_all_pairs(self):
        """Получение списка всех доступных бессрочных фьючерсов"""
        try:
            exchange_info = self.client.futures_exchange_info()
            
            # Фильтруем только активные бессрочные контракты
            pairs = [
                clean_symbol(symbol['symbol'])  # Илуем существующую функцию clean_symbol
                for symbol in exchange_info['symbols']
                if symbol['status'] == 'TRADING' 
                and symbol['contractType'] == 'PERPETUAL'
                and symbol['symbol'].endswith('USDT')
            ]
            return sorted(pairs)
        except Exception as e:
            print(f"Error getting Binance pairs: {str(e)}")
            return []

    def close_positions(self, positions_to_close):
        """Закрытие нескольких позиций
        Args:
            positions_to_close (list): Список позиций для закрытия
        """
        try:
            results = []
            
            # Размещаем ордера на закрытие всех позиций
            for position in positions_to_close:
                symbol = position['symbol']
                size = position['size']
                side = position['side']
                order_type = position.get('order_type', 'Limit')
                
                try:
                    # Проверяем существование позиции
                    positions = self.client.futures_position_information(symbol=f"{symbol}USDT")
                    active_position = None
                    
                    for pos in positions:
                        pos_side = "Long" if float(pos['positionAmt']) > 0 else "Short"
                        if float(pos['positionAmt']) != 0 and pos_side == side:
                            active_position = pos
                            break
                    
                    if not active_position:
                        results.append({
                            'symbol': symbol,
                            'success': False,
                            'message': f'No active {side} position found for {symbol}'
                        })
                        continue
                    
                    print(f"[BINANCE] Found active position: {active_position}")
                    
                    # Получаем текущую цену
                    ticker = self.get_ticker(symbol)
                    if not ticker:
                        results.append({
                            'symbol': symbol,
                            'success': False,
                            'message': 'Could not get current price'
                        })
                        continue
                    
                    # Определяем направление закрытия
                    close_side = "SELL" if side == "Long" else "BUY"
                    
                    # Базовые параметры ордера
                    order_params = {
                        'symbol': f"{symbol}USDT",
                        'side': close_side,
                        'type': order_type.upper(),
                        'quantity': str(size)
                    }
                    
                    # Добавляем positionSide для режима хеджирования
                    if self.position_mode == 'Hedge':
                        order_params['positionSide'] = "LONG" if side == "Long" else "SHORT"
                    
                    # Добавляем параметры для лимитных ордеров
                    if order_type.upper() == "LIMIT":
                        price_multiplier = (100 - self.limit_order_offset) / 100 if close_side == "BUY" else (100 + self.limit_order_offset) / 100
                        limit_price = ticker['ask'] * price_multiplier if close_side == "BUY" else ticker['bid'] * price_multiplier
                        order_params['price'] = str(round(limit_price, 4))
                        order_params['timeInForce'] = 'GTC'  # Обязательный параметр для лимитных ордеров
                        print(f"[BINANCE] Calculated limit price: {limit_price}")
                    
                    print(f"[BINANCE] Sending order with params: {order_params}")
                    response = self.client.futures_create_order(**order_params)
                    print(f"[BINANCE] Order response: {response}")
                    
                    if response and response.get('orderId'):
                        close_price = float(order_params.get('price', ticker['last']))
                        results.append({
                            'symbol': symbol,
                            'success': True,
                            'order_id': response['orderId'],
                            'message': f'{order_type} order placed successfully',
                            'close_price': close_price
                        })
                    else:
                        error_msg = response.get('msg', 'Unknown error')
                        results.append({
                            'symbol': symbol,
                            'success': False,
                            'message': f'Failed to place {order_type} order: {error_msg}'
                        })
                    
                except Exception as e:
                    print(f"[BINANCE] Error closing position for {symbol}: {str(e)}")
                    results.append({
                        'symbol': symbol,
                        'success': False,
                        'message': f'Error closing position: {str(e)}'
                    })
            
            return results
            
        except Exception as e:
            print(f"[BINANCE] Error in close_positions: {str(e)}")
            print(f"[BINANCE] Traceback: {traceback.format_exc()}")
            return [{
                'symbol': position['symbol'],
                'success': False,
                'message': f'Error in close_positions: {str(e)}'
            } for position in positions_to_close]

    def get_chart_data(self, symbol, timeframe='1h', period='1w'):
        try:
            print(f"[BINANCE] Запрос данных для {symbol}, таймфрейм: {timeframe}, период: {period}")
            
            # Специальная обработка для таймфрейма "all"
            if timeframe == 'all':
                # Последовательно пробуем разные интервалы
                intervals = [
                    (Client.KLINE_INTERVAL_1MINUTE, '1m'),
                    (Client.KLINE_INTERVAL_5MINUTE, '5m'),
                    (Client.KLINE_INTERVAL_15MINUTE, '15m'),
                    (Client.KLINE_INTERVAL_30MINUTE, '30m'),
                    (Client.KLINE_INTERVAL_1HOUR, '1h'),
                    (Client.KLINE_INTERVAL_4HOUR, '4h'),
                    (Client.KLINE_INTERVAL_1DAY, '1d'),
                    (Client.KLINE_INTERVAL_1WEEK, '1w'),
                    (Client.KLINE_INTERVAL_1MONTH, '1M')
                ]
                
                selected_interval = None
                selected_klines = None
                
                for interval, interval_name in intervals:
                    try:
                        print(f"[BINANCE] Пробуем интервал {interval_name}")
                        klines = self.client.futures_klines(
                            symbol=f"{symbol}USDT",
                            interval=interval,
                            limit=1000
                        )
                        
                        if len(klines) <= 500:
                            selected_interval = interval
                            selected_klines = klines
                            print(f"[BINANCE] Выбран интервал {interval_name} ({len(klines)} свечей)")
                            break
                        
                        # Если это последний интервал, используем его независимо от количества свечей
                        if interval == Client.KLINE_INTERVAL_1MONTH:
                            selected_interval = interval
                            selected_klines = klines
                            print(f"[BINANCE] Использован последний интервал {interval_name} ({len(klines)} свечей)")
                    except Exception as e:
                        print(f"[BINANCE] Ошибка при получении данных для интервала {interval_name}: {e}")
                        continue
                
                if selected_interval and selected_klines:
                    klines = selected_klines
                else:
                    raise Exception("Не удалось получить данные ни для одного интервала")
            else:
                # Стандартная обработка для конкретного таймфрейма
                timeframe_map = {
                    '1m': Client.KLINE_INTERVAL_1MINUTE,
                    '5m': Client.KLINE_INTERVAL_5MINUTE,
                    '15m': Client.KLINE_INTERVAL_15MINUTE,
                    '30m': Client.KLINE_INTERVAL_30MINUTE,
                    '1h': Client.KLINE_INTERVAL_1HOUR,
                    '4h': Client.KLINE_INTERVAL_4HOUR,
                    '1d': Client.KLINE_INTERVAL_1DAY,
                    '1w': Client.KLINE_INTERVAL_1WEEK
                }
                
                interval = timeframe_map.get(timeframe)
                if not interval:
                    print(f"[BINANCE] Неподдерживаемый таймфрейм: {timeframe}")
                    return {
                        'success': False,
                        'error': f'Неподдерживаемый таймфрейм: {timeframe}'
                    }
                
                klines = self.client.futures_klines(
                    symbol=f"{symbol}USDT",
                    interval=interval,
                    limit=1000
                )

            print(f"[BINANCE] Получено {len(klines)} свечей")
            if klines:
                print(f"[BINANCE] Пример первой свечи: {klines[0]}")
            
            # Преобразуем данные в формат свечей
            candles = []
            for k in klines:
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
            
            result = {
                'success': True,
                'data': {
                    'candles': candles
                }
            }
            
            print(f"[BINANCE] Подготовлен ответ с {len(candles)} свечами")
            return result
            
        except Exception as e:
            print(f"[BINANCE] Ошибка получения данных графика: {e}")
            print(f"[BINANCE] Полный traceback: {traceback.format_exc()}")
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
            print(f"[BINANCE] Запрос индикаторов для {symbol}, таймфрейм: {timeframe}")
            
            # Конвертируем таймфрейм в формат Binance
            timeframe_map = {
                '1m': Client.KLINE_INTERVAL_1MINUTE,
                '5m': Client.KLINE_INTERVAL_5MINUTE,
                '15m': Client.KLINE_INTERVAL_15MINUTE,
                '30m': Client.KLINE_INTERVAL_30MINUTE,
                '1h': Client.KLINE_INTERVAL_1HOUR,
                '4h': Client.KLINE_INTERVAL_4HOUR,
                '1d': Client.KLINE_INTERVAL_1DAY,
                '1w': Client.KLINE_INTERVAL_1WEEK
            }
            
            interval = timeframe_map.get(timeframe)
            if not interval:
                print(f"[BINANCE] Неподдерживаемый таймфрейм: {timeframe}")
                return {
                    'success': False,
                    'error': f'Неподдерживаемый таймфрейм: {timeframe}'
                }

            # Получаем последние 100 свечей для расчета индикаторов
            klines = self.client.get_klines(
                symbol=f"{symbol}USDT",
                interval=interval,
                limit=100
            )

            if not klines:
                return {
                    'success': False,
                    'error': 'Не удалось получить данные свечей'
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
            print(f"[BINANCE] Ошибка при расчете индикаторов: {str(e)}")
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
            # Получаем баланс фьючерсного аккаунта
            account = self.client.futures_account()
            
            # Получаем значения из ответа API
            total_balance = float(account['totalWalletBalance'])
            available_balance = float(account['availableBalance'])
            unrealized_pnl = float(account['totalUnrealizedProfit'])
            
            # Получаем реализованный PNL за последние 30 дней
            end_time = int(time.time() * 1000)
            start_time = end_time - (30 * 24 * 60 * 60 * 1000)  # 30 дней назад
            
            # Получаем историю доходов постранично
            realized_pnl = 0
            current_start = start_time
            
            while current_start < end_time:
                try:
                    current_end = min(current_start + (7 * 24 * 60 * 60 * 1000), end_time)  # Максимум 7 дней
                    income_history = self.client.futures_income_history(
                        incomeType="REALIZED_PNL",
                        startTime=current_start,
                        endTime=current_end,
                        limit=1000
                    )
                    
                    if not income_history:
                        break
                        
                    realized_pnl += sum(float(income['income']) for income in income_history)
                    current_start = current_end
                    
                except Exception as e:
                    break
            
            # Общий PNL = реализованный + нереализованный
            total_pnl = realized_pnl + unrealized_pnl
            
            return {
                'total_balance': total_balance,
                'available_balance': available_balance,
                'realized_pnl': total_pnl
            }
            
        except Exception as e:
            print(f"[BINANCE] Error getting wallet balance: {str(e)}")
            return {
                'total_balance': 0.0,
                'available_balance': 0.0,
                'realized_pnl': 0.0
            }