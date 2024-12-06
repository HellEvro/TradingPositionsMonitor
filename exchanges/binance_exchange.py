from binance.client import Client
from .base_exchange import BaseExchange
from datetime import datetime
import time
import traceback

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
                print("[BINANCE] Установлен режим Hedge")
            else:
                self.client.futures_change_position_mode(dualSidePosition=False)
                print("[BINANCE] Установлен режим OneWay")
        except Exception as e:
            if "No need to change position side" not in str(e):
                print(f"[BINANCE] Ошибка при установке режима позиций: {str(e)}")

    def get_positions(self):
        try:
            # Получаем все фьючерсные позиции
            positions = self.client.futures_position_information()
            processed_positions = []
            rapid_growth_positions = []
            
            # Фильтруем только активные позиции
            active_positions = [p for p in positions if float(p['positionAmt']) != 0]
            
            for position in active_positions:
                symbol = clean_symbol(position['symbol'])
                current_pnl = float(position['unRealizedProfit'])
                position_value = float(position['positionAmt']) * float(position['entryPrice'])
                roi = (current_pnl / position_value * 100) if position_value != 0 else 0
                
                # Обновляем максимальные значения
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
                    'high_roi': roi > 100,  # Используем те же пороги, что и для Bybit
                    'high_loss': current_pnl < -40,
                    'side': 'Long' if float(position['positionAmt']) > 0 else 'Short',
                    'size': abs(float(position['positionAmt']))
                }
                
                processed_positions.append(position_info)
                
                # Проверяем быстрый рост
                if symbol in self.daily_pnl:
                    start_pnl = self.daily_pnl[symbol]
                    if start_pnl > 0 and current_pnl > 0:
                        growth_ratio = current_pnl / start_pnl
                        if growth_ratio >= 2.0:  # Тот же множитель, что и для Bybit
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
            print(f"Error getting Binance positions: {e}")
            return [], []

    def get_closed_pnl(self, sort_by='time'):
        try:
            print("[BINANCE] Getting closed PnL...")
            all_closed_pnl = []
            
            try:
                # Получаем все сделки без временных ограничений
                trades = self.client.futures_account_trades(limit=1000)
                print(f"[BINANCE] Fetched {len(trades)} trades")
                
                # Фильтруем и обрабатываем сделки
                for trade in trades:
                    if float(trade['realizedPnl']) != 0:
                        pnl_record = {
                            'symbol': clean_symbol(trade['symbol']),
                            'qty': abs(float(trade['qty'])),
                            'entry_price': float(trade['price']),
                            'exit_price': float(trade['price']),
                            'closed_pnl': float(trade['realizedPnl']),
                            'close_time': datetime.fromtimestamp(
                                int(trade['time'])/1000
                            ).strftime('%Y-%m-%d %H:%M:%S')
                        }
                        all_closed_pnl.append(pnl_record)
                
                # Используем orderId для пагинации, если нужно больше данных
                if trades:
                    last_order_id = trades[-1]['orderId']
                    while True:
                        # Получаем следующую страницу данных
                        next_trades = self.client.futures_account_trades(
                            orderId=last_order_id,
                            limit=1000
                        )
                        
                        if not next_trades:
                            break
                            
                        print(f"[BINANCE] Fetched additional {len(next_trades)} trades")
                        
                        # Обрабатываем дополнительные сделки
                        for trade in next_trades:
                            if float(trade['realizedPnl']) != 0:
                                pnl_record = {
                                    'symbol': clean_symbol(trade['symbol']),
                                    'qty': abs(float(trade['qty'])),
                                    'entry_price': float(trade['price']),
                                    'exit_price': float(trade['price']),
                                    'closed_pnl': float(trade['realizedPnl']),
                                    'close_time': datetime.fromtimestamp(
                                        int(trade['time'])/1000
                                    ).strftime('%Y-%m-%d %H:%M:%S')
                                }
                                all_closed_pnl.append(pnl_record)
                        
                        if len(next_trades) < 1000:
                            break
                            
                        last_order_id = next_trades[-1]['orderId']
                        time.sleep(0.1)  # Нольшая задержка между запросами
                
                # Сортировка всех полученных данных
                if sort_by == 'pnl':
                    all_closed_pnl.sort(key=lambda x: abs(x['closed_pnl']), reverse=True)
                else:
                    all_closed_pnl.sort(key=lambda x: x['close_time'], reverse=True)
                
                print(f"[BINANCE] Found total {len(all_closed_pnl)} closed positions")
                return all_closed_pnl
                
            except Exception as e:
                print(f"[BINANCE] Error fetching closed positions: {str(e)}")
                return []
                
        except Exception as e:
            print(f"[BINANCE] Error in get_closed_pnl: {str(e)}")
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
            print(f"[BINANCE] Closing position {symbol}, size: {size}, side: {side}, type: {order_type}")
            
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
                
                print(f"[BINANCE] Found active position: {active_position}")
                
            except Exception as e:
                print(f"[BINANCE] Error checking position: {str(e)}")
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
                order_params['timeInForce'] = 'GTC'  # Обязательный параметр для лимитных ордеров
                print(f"[BINANCE] Calculated limit price: {limit_price}")
            
            print(f"[BINANCE] Sending order with params: {order_params}")
            response = self.client.futures_create_order(**order_params)
            print(f"[BINANCE] Order response: {response}")
            
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
            print(f"[BINANCE] Traceback: {traceback.format_exc()}")
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
                clean_symbol(symbol['symbol'])  # Используем существующую функцию clean_symbol
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