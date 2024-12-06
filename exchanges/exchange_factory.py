from .bybit_exchange import BybitExchange
from .binance_exchange import BinanceExchange
from .okx_exchange import OkxExchange

class ExchangeFactory:
    @staticmethod
    def create_exchange(exchange_name, api_key, api_secret, passphrase=None):
        print(f"\nInitializing {exchange_name} exchange...")
        try:
            from app.config import EXCHANGES
            
            # Получаем настройки из конфига
            exchange_config = EXCHANGES.get(exchange_name, {})
            position_mode = exchange_config.get('position_mode', 'Hedge')
            limit_order_offset = exchange_config.get('limit_order_offset', 0.01)
            
            if exchange_name == 'BYBIT':
                test_server = exchange_config.get('test_server', False)
                exchange = BybitExchange(
                    api_key, 
                    api_secret, 
                    test_server=test_server,
                    position_mode=position_mode,
                    limit_order_offset=limit_order_offset
                )
                print(f"Successfully connected to {exchange_name} ({position_mode} mode, offset: {limit_order_offset}%)")
                return exchange
            elif exchange_name == 'BINANCE':
                exchange = BinanceExchange(
                    api_key, 
                    api_secret,
                    position_mode=position_mode,
                    limit_order_offset=limit_order_offset
                )
                print(f"Successfully connected to {exchange_name} ({position_mode} mode, offset: {limit_order_offset}%)")
                return exchange
            elif exchange_name == 'OKX':
                if not passphrase:
                    print("Error: OKX requires passphrase")
                    raise ValueError("OKX requires passphrase")
                exchange = OkxExchange(
                    api_key, 
                    api_secret, 
                    passphrase,
                    position_mode=position_mode,
                    limit_order_offset=limit_order_offset
                )
                print(f"Successfully connected to {exchange_name} ({position_mode} mode, offset: {limit_order_offset}%)")
                return exchange
            else:
                print(f"Error: Unknown exchange {exchange_name}")
                raise ValueError(f"Unknown exchange: {exchange_name}")
        except Exception as e:
            print(f"Error connecting to {exchange_name}: {str(e)}")
            raise 