from .base_exchange import BaseExchange
import ccxt
from datetime import datetime
import time
import traceback

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
        self.client = ccxt.okx({
            'apiKey': api_key,
            'secret': api_secret,
            'password': passphrase,
            'enableRateLimit': True
        })
        self.daily_pnl = {}
        self.last_reset_day = None
        self.max_profit_values = {}
        self.max_loss_values = {}
        
        # Загружаем рынки при инициализации
        print("Loading OKX markets...")
        self.markets = self.client.load_markets()
        print(f"Loaded {len(self.markets)} markets")
        
        # Определяем текущий режим позиций
        try:
            account_config = self.client.private_get_account_config()
            if account_config and account_config.get('code') == '0':
                config_data = account_config.get('data', [{}])[0]
                self.position_mode = 'Hedge' if config_data.get('posMode') == 'long_short_mode' else 'OneWay'
                print(f"[OKX] Определен текущий режим позиций: {self.position_mode}")
                
                # Проверяем, что режим позиций соответствует запрошенному
                if self.position_mode != position_mode:
                    print(f"[OKX] Внимание: Текущий режим позиций ({self.position_mode}) отличается от запрошенного ({position_mode})")
                    # Здесь можно добавить код для изменения режима позиций, если это необходимо
            else:
                print(f"[OKX] Не удалось определить режим позиций, используем {position_mode}")
                self.position_mode = position_mode
        except Exception as e:
            print(f"[OKX] Ошибка при определении режима позиций: {str(e)}")
            print("[OKX] Используем режим по умолчанию:", position_mode)
            self.position_mode = position_mode

    def get_positions(self):
        try:
            print("\nFetching OKX positions...")
            positions = self.client.fetch_positions()
            
            processed_positions = []
            rapid_growth_positions = []
            
            for position in positions:
                try:
                    contracts = float(position['contracts'])
                    if contracts == 0:
                        continue
                    
                    symbol = clean_symbol(position['symbol'])
                    print(f"Processing position: {symbol}")
                    
                    current_pnl = float(position['unrealizedPnl'])
                    position_value = float(position['notional'])
                    roi = (current_pnl / position_value * 100) if position_value != 0 else 0
                    
                    # Обновляем максимальные значения
                    if current_pnl > 0:
                        if symbol not in self.max_profit_values or current_pnl > self.max_profit_values[symbol]:
                            self.max_profit_values[symbol] = current_pnl
                            print(f"New max profit for {symbol}: {current_pnl}")
                    else:
                        if symbol not in self.max_loss_values or current_pnl < self.max_loss_values[symbol]:
                            self.max_loss_values[symbol] = current_pnl
                            print(f"New max loss for {symbol}: {current_pnl}")

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
                    
                    # Проверяем быстрый рост
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
                                print(f"Added to rapid growth positions")
                    else:
                        self.daily_pnl[symbol] = current_pnl
                        print(f"Initialized daily PnL for {symbol}: {current_pnl}")
                        
                except Exception as pos_error:
                    print(f"Error processing position: {str(pos_error)}")
                    continue

            print(f"Processed {len(processed_positions)} positions")
            return processed_positions, rapid_growth_positions
            
        except Exception as e:
            print(f"Error getting OKX positions: {str(e)}")
            return [], []

    def get_closed_pnl(self, sort_by='time'):
        try:
            print("[OKX] Getting closed PnL...")
            all_closed_pnl = []
            processed_trades = set()  # Множество для отслеживания уже обработанных сделок
            
            try:
                # Получаем историю за несколько периодов
                for i in range(5):  # Получаем 5 страниц истории
                    params = {
                        'instType': 'SWAP',
                        'state': 'filled',
                        'limit': '100'
                    }
                    
                    if i > 0:
                        # Для следующих страниц добавляем before из последней сделки предыдущей страницы
                        if all_closed_pnl:
                            last_trade_time = int(datetime.strptime(all_closed_pnl[-1]['close_time'], '%Y-%m-%d %H:%M:%S').timestamp() * 1000)
                            params['before'] = str(last_trade_time)
                    
                    orders = self.client.private_get_trade_fills(params)
                    trades_count = len(orders.get('data', []))
                    print(f"[OKX] API Response for page {i+1}: {trades_count} trades")
                    
                    if not orders or orders.get('code') != '0' or not orders.get('data') or trades_count == 0:
                        break
                    
                    trades = orders['data']
                    
                    # Группируем сделки по позициям и posSide
                    positions = {}
                    for trade in trades:
                        try:
                            # Создаем уникальный идентификатор сделки
                            trade_id = f"{trade['tradeId']}_{trade['fillTime']}"
                            if trade_id in processed_trades:
                                continue
                            
                            symbol = clean_symbol(trade['instId'])
                            pos_side = trade['posSide']
                            key = f"{symbol}_{pos_side}"
                            
                            if key not in positions:
                                positions[key] = []
                            positions[key].append(trade)
                            processed_trades.add(trade_id)
                        except (ValueError, KeyError) as e:
                            print(f"[OKX] Error processing trade: {e}, trade data: {trade}")
                            continue
                    
                    # Обрабатываем каждую позицию
                    for key, symbol_trades in positions.items():
                        try:
                            # Сортируем сделки по времени
                            symbol_trades.sort(key=lambda x: int(x['fillTime']))
                            
                            # Находим сделки закрытия (с fillPnl != 0)
                            closing_trades = [t for t in symbol_trades if float(t.get('fillPnl', 0)) != 0]
                            
                            for close_trade in closing_trades:
                                symbol = clean_symbol(close_trade['instId'])
                                pnl_record = {
                                    'symbol': symbol,
                                    'qty': abs(float(close_trade.get('fillSz', 0))),
                                    'entry_price': float(close_trade.get('fillPx', 0)),
                                    'exit_price': float(close_trade.get('fillPx', 0)),
                                    'closed_pnl': float(close_trade.get('fillPnl', 0)),
                                    'close_time': datetime.fromtimestamp(
                                        int(close_trade['fillTime']) / 1000
                                    ).strftime('%Y-%m-%d %H:%M:%S')
                                }
                                all_closed_pnl.append(pnl_record)
                                print(f"[OKX] Added PNL record: {pnl_record}")
                    
                        except Exception as e:
                            print(f"[OKX] Error processing position {key}: {e}")
                            continue
                    
                    time.sleep(0.5)  # Задержка между запросами страниц
                
                # Сортировка результатов
                if sort_by == 'pnl':
                    all_closed_pnl.sort(key=lambda x: abs(x['closed_pnl']), reverse=True)
                else:
                    all_closed_pnl.sort(key=lambda x: x['close_time'], reverse=True)
                
                print(f"[OKX] Found total {len(all_closed_pnl)} unique closed positions")
                return all_closed_pnl
                
            except Exception as e:
                print(f"[OKX] Error fetching closed positions: {str(e)}")
                print(f"[OKX] Error details: {traceback.format_exc()}")
                return []
                
        except Exception as e:
            print(f"[OKX] Error in get_closed_pnl: {str(e)}")
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