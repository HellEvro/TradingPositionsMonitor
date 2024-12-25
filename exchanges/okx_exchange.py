from .base_exchange import BaseExchange
import ccxt
from datetime import datetime
import time
import traceback
import pandas as pd
import math
import numpy as np

def clean_symbol(symbol):
    """Очищает символ от USDT и форматирования OKX"""
    # Удаляем все лишние символы и оставляем только базовую валюту
    if not symbol:
        return ''
    # Убираем SWAP, USDT и другие суффиксы
    base = symbol.split('-')[0] if '-' in symbol else symbol
    base = base.split('/')[0] if '/' in base else base
    base = base.split(':')[0] if ':' in base else base
    # Убираем USDT из оставшейся части
    return base.replace('USDT', '')

class OkxExchange(BaseExchange):
    def __init__(self, api_key, api_secret, passphrase, position_mode='Hedge', limit_order_offset=0.01):
        super().__init__(api_key, api_secret, position_mode, limit_order_offset)
        try:
            self.client = ccxt.okx({
                'apiKey': api_key,
                'secret': api_secret,
                'password': passphrase,
                'enableRateLimit': True,
                'options': {
                    'defaultType': 'swap',
                    'adjustForTimeDifference': True
                },
                'timeout': 30000,
                'urls': {
                    'api': {
                        'public': 'https://www.okx.com/api/v5/public',
                        'private': 'https://www.okx.com/api/v5'
                    }
                }
            })
            
            self.daily_pnl = {}
            self.last_reset_day = None
            self.max_profit_values = {}
            self.max_loss_values = {}
            
            # Загружаем рынки при инициализации
            try:
                self.markets = self.client.load_markets()
            except Exception as market_error:
                print(f"Error loading markets: {str(market_error)}")
                raise Exception("Failed to load markets")
            
            # Определяем текущий режим позиций
            try:
                account_config = self.client.private_get_account_config()
                if account_config and account_config.get('code') == '0':
                    config_data = account_config.get('data', [{}])[0]
                    self.position_mode = 'Hedge' if config_data.get('posMode') == 'long_short_mode' else 'OneWay'
                    
                    # Проверяем, что режим позиций соответствует запрошенному
                    if self.position_mode != position_mode:
                        print(f"[OKX] Warning: Current position mode ({self.position_mode}) differs from requested ({position_mode})")
                else:
                    self.position_mode = position_mode
            except Exception as e:
                print(f"[OKX] Error determining position mode: {str(e)}")
                self.position_mode = position_mode
                
        except Exception as e:
            print(f"Error initializing OKX exchange: {str(e)}")
            raise Exception(f"Failed to initialize OKX exchange: {str(e)}")

    def get_positions(self):
        try:
            positions = self.client.fetch_positions()
            processed_positions = []
            rapid_growth_positions = []
            
            for position in positions:
                try:
                    contracts = float(position['contracts'])
                    if contracts == 0:
                        continue
                    
                    symbol = clean_symbol(position['symbol'])
                    current_pnl = float(position['unrealizedPnl'])
                    position_value = float(position['notional'])
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
                        'side': 'Long' if position['side'] == 'long' else 'Short',
                        'size': float(position['contracts'])
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
                        
                except Exception as pos_error:
                    print(f"[OKX] Error processing position: {str(pos_error)}")
                    continue

            return processed_positions, rapid_growth_positions
            
        except Exception as e:
            print(f"[OKX] Error getting positions: {str(e)}")
            return [], []

    def get_closed_pnl(self, sort_by='time'):
        """Получает историю закрытых позиций с PNL"""
        try:
            print("[OKX] Starting get_closed_pnl")
            all_closed_pnl = []
            
            # Получаем историю за последние 7 дней
            end_time = int(time.time() * 1000)
            start_time = end_time - (7 * 24 * 60 * 60 * 1000)  # 7 days
            
            try:
                # Используем прямой запрос к API OKX для получения истории закрытых позиций
                params = {
                    'instType': 'SWAP',
                    'state': 'closed',  # Получаем только закрытые позиции
                    'limit': '50'  # Увеличиваем лимит
                }
                
                print(f"[OKX] Fetching closed positions with params: {params}")
                closed_positions = self.client.private_get_account_positions(params)
                print(f"[OKX] Raw response: {closed_positions}")
                
                if closed_positions and closed_positions.get('code') == '0' and closed_positions.get('data'):
                    positions = closed_positions['data']
                    print(f"[OKX] Got {len(positions)} positions")
                    
                    for position in positions:
                        try:
                            # Проверяем наличие всех необходимых данных
                            if not all(k in position for k in ['instId', 'pos', 'avgPx', 'markPx', 'realizedPnl', 'upl', 'uTime']):
                                print(f"[OKX] Skipping position due to missing fields: {position}")
                                continue
                            
                            # Рассчитываем общий PNL (реализованный + нереализованный)
                            realized_pnl = float(position.get('realizedPnl', 0))
                            unrealized_pnl = float(position.get('upl', 0))
                            total_pnl = realized_pnl + unrealized_pnl
                            
                            # Пропускаем позиции с нулевым PNL
                            if total_pnl == 0:
                                print(f"[OKX] Skipping position with zero PNL: {position}")
                                continue
                            
                            symbol = clean_symbol(position['instId'])
                            position_size = abs(float(position.get('pos', 0)))
                            
                            # Получаем историю сделок для этой позиции
                            print(f"[OKX] Fetching trades for {symbol}")
                            trades = self.client.fetch_my_trades(
                                symbol=position['instId'],
                                limit=100
                            )
                            print(f"[OKX] Got trades response: {trades}")
                            
                            trades_by_position = {}
                            
                            # Группируем сделки по positionSide
                            for trade in trades:
                                pos_side = trade['info']['posSide']
                                if pos_side not in trades_by_position:
                                    trades_by_position[pos_side] = []
                                trades_by_position[pos_side].append(trade)
                            
                            print(f"[OKX] Processing {len(trades)} trades")
                            
                            # Обрабатываем каждую группу сделок
                            for pos_side, position_trades in trades_by_position.items():
                                # Сортируем сделки по времени
                                position_trades.sort(key=lambda x: x['timestamp'])
                                
                                # Находим все сделки с PnL (закрывающие сделки)
                                for i, trade in enumerate(position_trades):
                                    if float(trade['info']['fillPnl']) != 0:
                                        # Ищем соответствующую сделку открытия
                                        entry_trade = None
                                        for prev_trade in reversed(position_trades[:i]):
                                            if prev_trade['side'] != trade['side'] and float(prev_trade['info']['fillPnl']) == 0:
                                                entry_trade = prev_trade
                                                break
                                        
                                        if entry_trade:
                                            pnl_record = {
                                                'symbol': clean_symbol(trade['info']['instId']),
                                                'qty': float(trade['info']['fillSz']),
                                                'entry_price': float(entry_trade['info']['fillPx']),
                                                'exit_price': float(trade['info']['fillPx']),
                                                'closed_pnl': float(trade['info']['fillPnl']),
                                                'close_time': datetime.fromtimestamp(
                                                    int(trade['info']['fillTime']) / 1000
                                                ).strftime('%Y-%m-%d %H:%M:%S'),
                                                'exchange': 'okx'
                                            }
                                            print(f"[OKX] Created PNL record: {pnl_record}")
                                            all_closed_pnl.append(pnl_record)
                            
                        except Exception as e:
                            print(f"[OKX] Error processing position: {str(e)}")
                            print(f"[OKX] Position data: {position}")
                            import traceback
                            print(f"[OKX] Traceback: {traceback.format_exc()}")
                            continue
                    
                    # Сортировка результатов
                    if sort_by == 'pnl':
                        all_closed_pnl.sort(key=lambda x: abs(float(x['closed_pnl'])), reverse=True)
                    else:  # sort by time
                        all_closed_pnl.sort(key=lambda x: x['close_time'], reverse=True)
                    
                    print(f"[OKX] Returning {len(all_closed_pnl)} PNL records")
                    return all_closed_pnl
                else:
                    print(f"[OKX] No positions data received or error in response: {closed_positions}")
                    return []
                
            except Exception as e:
                print(f"[OKX] Error fetching closed positions: {str(e)}")
                import traceback
                print(f"[OKX] Traceback: {traceback.format_exc()}")
                return []
                
        except Exception as e:
            print(f"[OKX] Error in get_closed_pnl: {str(e)}")
            import traceback
            print(f"[OKX] Traceback: {traceback.format_exc()}")
            return []

    def get_symbol_chart_data(self, symbol):
        """Получает исторические данные для графика"""
        try:
            # Используем тот же формат, что в позициях: XRP-USDT-SWAP
            market_symbol = f"{symbol}-USDT-SWAP"
            print(f"\nGetting chart data for {market_symbol}")
            
            try:
                # Используем параметры OKX API
                params = {
                    'instId': market_symbol,
                    'bar': '5m',
                    'limit': '24'
                }
                candles = self.client.publicGetMarketCandles(params)
                
                if candles and candles.get('data'):
                    print(f"Got {len(candles['data'])} candles")
                    return [float(candle[4]) for candle in reversed(candles['data'])]
                    
                print(f"No candles data")
                return []
                
            except Exception as e:
                print(f"Error fetching OHLCV: {str(e)}")
                return []
                
        except Exception as e:
            print(f"Error getting OKX chart data: {str(e)}")
            return []

    def get_sma200_position(self, symbol):
        """Определяет положение цены относительно SMA200"""
        try:
            # Используем тот же формат, что в позициях: XRP-USDT-SWAP
            market_symbol = f"{symbol}-USDT-SWAP"
            
            klines = self.client.fetch_ohlcv(
                market_symbol,
                timeframe='1d',
                limit=200
            )
            
            if len(klines) >= 200:
                closes = [float(k[4]) for k in klines]
                sma200 = sum(closes[:200]) / 200
                current_price = float(klines[0][4])
                return current_price > sma200
                
            return None
            
        except Exception as e:
            print(f"Error getting OKX SMA200 for {symbol}: {e}")
            return None

    def get_ticker(self, symbol):
        """Получение текущих данных тикера"""
        try:
            market_symbol = f"{symbol}-USDT-SWAP"
            ticker = self.client.fetch_ticker(market_symbol)
            return {
                'symbol': symbol,
                'last': float(ticker['last']),
                'bid': float(ticker['bid']),
                'ask': float(ticker['ask']),
                'timestamp': int(ticker['timestamp'])
            }
        except Exception as e:
            print(f"Ошибка получения тикера для {symbol}: {e}")
            return None

    def close_position(self, symbol, size, side, order_type="Limit"):
        """Закрытие позиции
        Args:
            symbol (str): Trading symbol
            size (float): Position size to close
            side (str): Position side ("Long" or "Short")
            order_type (str): Order type ("Market" or "Limit")
        """
        try:
            print(f"[OKX] Closing position {symbol}, size: {size}, side: {side}, type: {order_type}")
            
            # Формируем символ в формате OKX
            market_symbol = f"{symbol}-USDT-SWAP"
            
            # Проверяем существование позиции
            try:
                positions = self.client.fetch_positions([market_symbol])
                active_position = None
                
                for pos in positions:
                    if float(pos['contracts']) > 0 and pos['side'] == side.lower():
                        active_position = pos
                        break
                
                if not active_position:
                    return {
                        'success': False,
                        'message': f'No active {side} position found for {symbol}'
                    }
                
                print(f"[OKX] Found active position: {active_position}")
                
                # Получаем режим маржи из позиции
                margin_mode = active_position.get('marginMode', '').lower()
                if not margin_mode:
                    margin_mode = 'isolated'  # По умолчанию используем isolated
                print(f"[OKX] Using margin mode: {margin_mode}")
                
                # Определяем тип позиции (хедж или нет)
                is_hedged = active_position.get('hedged', False)
                print(f"[OKX] Position is {'hedged' if is_hedged else 'one-way'}")
                
            except Exception as e:
                print(f"[OKX] Error checking position: {str(e)}")
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
            close_side = "sell" if side == "Long" else "buy"
            
            # Базовые параметры ордера
            order_params = {
                'instId': f"{symbol}-USDT-SWAP",
                'tdMode': active_position.get('marginMode', 'isolated').lower(),
                'side': close_side,
                'sz': str(size),
                'ordType': order_type.lower(),
                'reduceOnly': True
            }
            
            # Добавляем posSide в режиме хеджирования
            if self.position_mode == 'Hedge':
                order_params['posSide'] = "long" if side == "Long" else "short"
            
            # Добавляем параметры для лимитных ордеров
            if order_type.upper() == "LIMIT":
                price_multiplier = (100 - self.limit_order_offset) / 100 if close_side == "buy" else (100 + self.limit_order_offset) / 100
                limit_price = ticker['ask'] * price_multiplier if close_side == "buy" else ticker['bid'] * price_multiplier
                if limit_price <= 0:
                    return {
                        'success': False,
                        'message': 'Invalid limit price calculated'
                    }
                order_params['px'] = str(round(limit_price, 6))
                print(f"[OKX] Calculated limit price: {limit_price}")
            
            print(f"[OKX] Sending order with params: {order_params}")
            response = self.client.private_post_trade_order(order_params)
            print(f"[OKX] Order response: {response}")
            
            if response and response.get('code') == '0':
                order_id = response['data'][0]['ordId']
                close_price = float(order_params.get('px', ticker['last']))
                return {
                    'success': True,
                    'order_id': order_id,
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
            print(f"[OKX] Error closing position: {str(e)}")
            print(f"[OKX] Traceback: {traceback.format_exc()}")
            return {
                'success': False,
                'message': f'Error closing position: {str(e)}'
            }

    def get_all_pairs(self):
        """Получение списка всех доступных бессрочных фьючерсов"""
        try:
            instruments = self.client.fetch_markets()
            
            # Фильтруем только бессрочные фьючерсы
            pairs = [
                clean_symbol(market['id'])  # Используем существующую функцию clean_symbol
                for market in instruments
                if market['type'] == 'swap'  # swap = бессрочный контракт в OKX
                and market['quote'] == 'USDT'
                and market['active']
            ]
            return sorted(pairs)
        except Exception as e:
            print(f"Error getting OKX pairs: {str(e)}")
            return []

    def get_chart_data(self, symbol, timeframe='1h', period='1w'):
        """Получает данные для графика"""
        try:
            # Маппинг таймфреймов OKX
            timeframe_map = {
                '1m': '1m',
                '5m': '5m',
                '15m': '15m',
                '30m': '30m',
                '1h': '1H',
                '4h': '4H',
                '1d': '1D',
                '1w': '1W'
            }
            
            # Обработка таймфрейма "all"
            if timeframe == 'all':
                intervals = ['1m', '5m', '15m', '30m', '1h', '4h', '1d']
                selected_interval = None
                selected_klines = None
                max_klines = 0

                for interval in intervals:
                    try:
                        market_symbol = f"{symbol}-USDT-SWAP"
                        params = {
                            'instId': market_symbol,
                            'bar': timeframe_map[interval],
                            'limit': '1000'
                        }
                        response = self.client.publicGetMarketCandles(params)
                        
                        if response and response.get('data'):
                            klines = response['data']
                            if len(klines) > max_klines:
                                max_klines = len(klines)
                                selected_interval = interval
                                selected_klines = klines
                    except Exception as e:
                        print(f"[OKX] Ошибка при получении данных для интервала {interval}: {str(e)}")
                        continue

                if selected_interval and selected_klines:
                    print(f"[OKX] Выбран интервал {selected_interval} с {len(selected_klines)} свечами")
                    candles = []
                    for k in reversed(selected_klines):
                        try:
                            candle = {
                                'time': int(float(k[0])),
                                'open': float(k[1]),
                                'high': float(k[2]),
                                'low': float(k[3]),
                                'close': float(k[4]),
                                'volume': float(k[5])
                            }
                            candles.append(candle)
                        except (ValueError, IndexError) as e:
                            print(f"[OKX] Ошибка при обработке свечи: {e}, данные: {k}")
                            continue
                    
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
                        'error': 'Не удалось получить данные ни для одного интервала'
                    }
            
            # Стандартная обработка для конкретного таймфрейма
            interval = timeframe_map.get(timeframe)
            if not interval:
                print(f"[OKX] Неподдерживаемый таймфрейм: {timeframe}")
                return {
                    'success': False,
                    'error': f'Неподдерживаемый таймфрейм: {timeframe}'
                }
            
            market_symbol = f"{symbol}-USDT-SWAP"
            print(f"[OKX] Getting chart data for {market_symbol} with interval {interval}")
            
            try:
                params = {
                    'instId': market_symbol,
                    'bar': interval,
                    'limit': '1000'
                }
                response = self.client.publicGetMarketCandles(params)
                
                if not response or not response.get('data'):
                    print(f"[OKX] Нет данных свечей")
                    return {
                        'success': False,
                        'error': 'Нет данных свечей'
                    }
                
                candles = []
                for k in reversed(response['data']):
                    try:
                        candle = {
                            'time': int(float(k[0])),
                            'open': float(k[1]),
                            'high': float(k[2]),
                            'low': float(k[3]),
                            'close': float(k[4]),
                            'volume': float(k[5])
                        }
                        candles.append(candle)
                    except (ValueError, IndexError) as e:
                        print(f"[OKX] Ошибка при обработке свечи: {e}, данные: {k}")
                        continue
                
                candles.sort(key=lambda x: x['time'])
                
                print(f"[OKX] Подготовлен ответ с {len(candles)} свечами")
                return {
                    'success': True,
                    'data': {
                        'candles': candles
                    }
                }
                
            except Exception as e:
                print(f"[OKX] Ошибка получения OHLCV: {str(e)}")
                return {
                    'success': False,
                    'error': str(e)
                }
                
        except Exception as e:
            print(f"[OKX] Ошибка получения данных графика: {str(e)}")
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
            print(f"[OKX] Запрос индикаторов для {symbol}, таймфрейм: {timeframe}")
            
            # Конвертируем таймфрейм в формат OKX
            timeframe_map = {
                '1m': '1m',
                '5m': '5m',
                '15m': '15m',
                '30m': '30m',
                '1h': '1H',
                '4h': '4H',
                '1d': '1D',
                '1w': '1W'
            }
            
            interval = timeframe_map.get(timeframe)
            if not interval:
                print(f"[OKX] Неподдерживаемый таймфрейм: {timeframe}")
                return {
                    'success': False,
                    'error': f'Неподдерживаемый таймфрейм: {timeframe}'
                }

            # Получаем последние 100 свечей для расчета индикаторов
            response = self.client.get_candlesticks(
                instId=f"{symbol}-USDT-SWAP",
                bar=interval,
                limit=100
            )

            if not response or response.get('code') != '0':
                return {
                    'success': False,
                    'error': 'Не удалось получить данные свечей'
                }

            klines = response.get('data', [])
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
            print(f"[OKX] Ошибка при расчете индикаторов: {str(e)}")
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
            # Получаем баланс аккаунта
            account_response = self.client.fetch_balance({'type': 'swap'})
            
            if not account_response:
                raise Exception("Empty account response")
            
            # Получаем значения из ответа API
            total_balance = float(account_response.get('total', {}).get('USDT', 0))
            available_balance = float(account_response.get('free', {}).get('USDT', 0))
            
            # Получаем позиции для расчета нереализованного PNL
            positions = self.client.fetch_positions()
            unrealized_pnl = sum(float(pos['unrealizedPnl']) for pos in positions if pos['contracts'] != 0)
            
            # Получаем реализованный PNL
            realized_pnl = 0.0
            
            try:
                # Получаем историю PNL за последние 7 дней
                end_time = int(time.time() * 1000)
                start_time = end_time - (7 * 24 * 60 * 60 * 1000)
                
                params = {
                    'instType': 'SWAP',
                    'begin': str(start_time),
                    'end': str(end_time),
                    'limit': '100'
                }
                
                # Используем метод для получения истории сделок
                trades = self.client.private_get_trade_fills(params)
                
                if trades and trades.get('code') == '0' and trades.get('data'):
                    for trade in trades['data']:
                        pnl = float(trade.get('fillPnl', 0))
                        if pnl != 0:
                            realized_pnl += pnl
                
            except Exception as e:
                print(f"[OKX] Error fetching PNL history: {str(e)}")
            
            # Общий PNL = реализованный + нереализованный
            total_pnl = realized_pnl + unrealized_pnl
            
            return {
                'total_balance': total_balance,
                'available_balance': available_balance,
                'realized_pnl': total_pnl
            }
            
        except Exception as e:
            print(f"[OKX] Error in get_wallet_balance: {str(e)}")
            return {
                'total_balance': 0.0,
                'available_balance': 0.0,
                'realized_pnl': 0.0
            }