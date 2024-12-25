import matplotlib
matplotlib.use('Agg')

import base64
from io import BytesIO
from flask import Flask, render_template, jsonify, request
import threading
import time
from datetime import datetime
import os
import webbrowser
from threading import Timer
from app.config import *
import matplotlib.pyplot as plt
import sys
from app.telegram_notifier import TelegramNotifier
from exchanges.exchange_factory import ExchangeFactory
import json
from threading import Lock
from app.language import get_current_language, save_language
import concurrent.futures
from functools import partial

# Добавим константы
class DEFAULTS:
    PNL_THRESHOLD = 100

# Глобальные переменные для хранения данных
positions_data = {
    'high_profitable': [],
    'profitable': [],
    'losing': [],
    'last_update': None,
    'closed_pnl': [],
    'total_trades': 0,
    'rapid_growth': [],
    'stats': {
        'total_pnl': 0,
        'total_profit': 0,
        'total_loss': 0,
        'high_profitable_count': 0,
        'profitable_count': 0,
        'losing_count': 0,
        'top_profitable': [],
        'top_losing': []
    }
}

# Глобальные переменные для максимальных значений
max_profit_values = {}
max_loss_values = {}

app = Flask(__name__, static_folder='static')
app.config['DEBUG'] = APP_DEBUG
app.config['TEMPLATES_AUTO_RELOAD'] = True
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0

telegram = TelegramNotifier()

# Создаем директорию для логов, если её нет
if not os.path.exists('logs'):
    os.makedirs('logs')

def log_to_file(filename, data):
    """Записывает данные в файл с временной меткой"""
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    with open(f'logs/{filename}', 'a', encoding='utf-8') as f:
        f.write(f"\n=== {timestamp} ===\n")
        f.write(data)
        f.write("\n")

def format_positions(positions):
    """Форматирует позиции для записи в лог"""
    if not positions:
        return "No positions"
    
    result = []
    for pos in positions:
        result.append(
            f"Symbol: {pos['symbol']}\n"
            f"PnL: {pos['pnl']:.2f} USDT\n"
            f"ROI: {pos['roi']:.2f}%\n"
        )
    return "\n".join(result)

def format_stats(stats):
    """Форматирует стаику для записи в лог"""
    return (
        f"Total PnL: {stats['total_pnl']:.2f} USDT\n"
        f"Total profit: {stats['total_profit']:.2f} USDT\n"
        f"Total loss: {stats['total_loss']:.2f} USDT\n"
        f"Number of high-profitable positions: {stats['high_profitable_count']}\n"
        f"Number of profitable positions: {stats['profitable_count']}\n"
        f"Number of losing positions: {stats['losing_count']}\n"
        f"\nTOP-3 profitable:\n{format_positions(stats['top_profitable'])}\n"
        f"\nTOP-3 losing:\n{format_positions(stats['top_losing'])}"
    )

stats_lock = Lock()

def background_update():
    global positions_data, last_stats_time
    last_log_minute = -1
    last_stats_time = None
    thread_id = threading.get_ident()
    
    while True:
        try:
            current_time = time.time()
            
            with stats_lock:
                should_send_stats = (
                    TELEGRAM_NOTIFY.get('STATISTICS', False) and 
                    (last_stats_time is None or 
                     current_time - last_stats_time >= TELEGRAM_NOTIFY['STATISTICS_INTERVAL'] + 1)
                )

            positions, rapid_growth = exchange.get_positions()
            if not positions:
                time.sleep(2)
                continue

            # Добавляем проверку каждой позиции для уведомлений
            for position in positions:
                telegram.check_position_notifications(position)

            # Проверяем быстрорастущие позиции
            if rapid_growth:
                telegram.check_rapid_growth(rapid_growth)

            high_profitable = []
            profitable = []
            losing = []
            
            total_profit = 0
            total_loss = 0
            
            # Обновляем общее количество сделок
            positions_data['total_trades'] = len(positions)
            positions_data['rapid_growth'] = rapid_growth
            
            # Распределяем позиции по категориям
            for position in positions:
                pnl = position['pnl']
                if pnl > 0:
                    if pnl >= 100:
                        high_profitable.append(position)
                    else:
                        profitable.append(position)
                    total_profit += pnl
                elif pnl < 0:
                    losing.append(position)
                    total_loss += pnl
            
            # Сортировка позиций
            high_profitable.sort(key=lambda x: x['pnl'], reverse=True)
            profitable.sort(key=lambda x: x['pnl'], reverse=True)
            losing.sort(key=lambda x: x['pnl'])
            
            # Получаем TOP-3
            all_profitable = high_profitable + profitable
            all_profitable.sort(key=lambda x: x['pnl'], reverse=True)
            top_profitable = all_profitable[:3] if all_profitable else []
            top_losing = losing[:3] if losing else []
            
            # Обновляем positions_data
            stats = {
                'total_pnl': total_profit + total_loss,
                'total_profit': total_profit,
                'total_loss': total_loss,
                'high_profitable_count': len(high_profitable),
                'profitable_count': len(high_profitable) + len(profitable),
                'losing_count': len(losing),
                'top_profitable': top_profitable,
                'top_losing': top_losing,
                'total_trades': len(positions)
            }
            
            positions_data.update({
                'high_profitable': high_profitable,
                'profitable': profitable,
                'losing': losing,
                'stats': stats,
                'last_update': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            })

            # Отправка статистики в Telegram только если нужно
            if should_send_stats:
                try:
                    with stats_lock:
                        print(f"[Thread {thread_id}] Acquired stats_lock for sending")
                        print(f"[Thread {thread_id}] Sending statistics...")
                        telegram.send_statistics(positions_data['stats'])
                        last_stats_time = current_time
                        print(f"[Thread {thread_id}] Stats sent at {datetime.fromtimestamp(current_time).strftime('%H:%M:%S.%f')}")
                        print(f"[Thread {thread_id}] Released stats_lock after sending")
                except Exception as e:
                    print(f"[Thread {thread_id}] Error sending statistics: {e}")

            print(f"[Thread {thread_id}] Updated positions: {positions_data['total_trades']} ...")
            time.sleep(2)
            
        except Exception as e:
            print(f"Error in background_update: {str(e)}")
            telegram.send_error(str(e))
            time.sleep(5)

# Флаг для отслеживания первого апуска
FIRST_RUN = True

def open_browser():
    """Открывает браузер только при первом запуске"""
    global FIRST_RUN
    if FIRST_RUN and not os.environ.get('WERKZEUG_RUN_MAIN'):
        webbrowser.open(f'http://{APP_HOST}:{APP_PORT}')
        FIRST_RUN = False

@app.route('/')
def index():
    return render_template('index.html', get_current_language=get_current_language)

def analyze_symbol(symbol, force_update=False):
    """Анализирует отдельный символ"""
    clean_symbol = symbol.replace('USDT', '')
    analysis = determine_trend_and_position(clean_symbol, force_update)
    if analysis:
        return {
            'symbol': symbol,
            'trend_analysis': analysis
        }
    return None

def analyze_positions_parallel(positions, max_workers=10):
    """Параллельный анализ позиций"""
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        analyzed = list(filter(None, executor.map(
            lambda p: analyze_symbol(p['symbol']),
            positions
        )))
        
        for position, analysis in zip(positions, analyzed):
            if analysis and analysis['symbol'] == position['symbol']:
                position['trend_analysis'] = analysis['trend_analysis']
                
        return [p for p in positions if 'trend_analysis' in p]

def analyze_pairs_parallel(pairs, max_workers=10):
    """Параллельный анализ пар"""
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        return list(filter(None, executor.map(analyze_symbol, pairs)))

@app.route('/get_positions')
def get_positions():
    pnl_threshold = float(request.args.get('pnl_threshold', 100))
    
    try:
        all_available_pairs = exchange.get_all_pairs()
    except Exception as e:
        print(f"Ошибка при получении списка пар: {str(e)}")
        all_available_pairs = []
    
    if not positions_data['high_profitable'] and not positions_data['profitable'] and not positions_data['losing']:
        return jsonify({
            'high_profitable': [],
            'profitable': [],
            'losing': [],
            'stats': {
                'total_pnl': 0,
                'total_profit': 0,
                'total_loss': 0,
                'high_profitable_count': 0,
                'profitable_count': 0,
                'losing_count': 0,
                'top_profitable': [],
                'top_losing': [],
                'total_trades': 0
            },
            'rapid_growth': [],
            'last_update': time.strftime('%Y-%m-%d %H:%M:%S'),
            'growth_multiplier': GROWTH_MULTIPLIER,
            'all_pairs': []
        })

    # Получаем все позиции
    all_positions = (positions_data['high_profitable'] + 
                    positions_data['profitable'] + 
                    positions_data['losing'])
    
    # Создаем множество символов из активных позиций
    active_position_symbols = set(position['symbol'] for position in all_positions)
    
    # Фильтруем доступные пары
    available_pairs = [pair for pair in all_available_pairs if pair not in active_position_symbols]
    
    # Распределяем позиции по категориям
    high_profitable = []
    profitable = []
    losing = []
    total_profit = 0
    total_loss = 0
    
    for position in all_positions:
        pnl = position['pnl']
        if pnl > 0:
            if pnl >= pnl_threshold:
                high_profitable.append(position)
            else:
                profitable.append(position)
            total_profit += pnl
        elif pnl < 0:
            losing.append(position)
            total_loss += pnl

    # Сортируем позиции
    high_profitable.sort(key=lambda x: x['pnl'], reverse=True)
    profitable.sort(key=lambda x: x['pnl'], reverse=True)
    losing.sort(key=lambda x: x['pnl'])
    
    # Получаем TOP-3
    all_profitable = high_profitable + profitable
    all_profitable.sort(key=lambda x: x['pnl'], reverse=True)
    top_profitable = all_profitable[:3] if all_profitable else []
    top_losing = losing[:3] if losing else []

    # Формируем статистику
    stats = {
        'total_pnl': total_profit + total_loss,
        'total_profit': total_profit,
        'total_loss': total_loss,
        'high_profitable_count': len(high_profitable),
        'profitable_count': len(profitable),
        'losing_count': len(losing),
        'top_profitable': top_profitable,
        'top_losing': top_losing,
        'total_trades': len(all_positions)
    }
    
    return jsonify({
        'high_profitable': high_profitable,
        'profitable': profitable,
        'losing': losing,
        'stats': stats,
        'rapid_growth': positions_data['rapid_growth'],
        'last_update': positions_data['last_update'],
        'growth_multiplier': GROWTH_MULTIPLIER,
        'all_pairs': available_pairs
    })

@app.route('/api/positions')
def api_positions():
    """API endpoint for positions - redirects to get_positions"""
    return get_positions()

@app.route('/api/closed_pnl')
def get_closed_pnl():
    """Получение закрытых позиций"""
    try:
        sort_by = request.args.get('sort', 'time')
        print(f"[API] Getting closed PNL, sort by: {sort_by}")
        
        # Получаем баланс и PNL
        wallet_data = exchange.get_wallet_balance()
        
        # Получаем закрытые позиции
        closed_pnl = exchange.get_closed_pnl(sort_by)
        print(f"[API] Found {len(closed_pnl)} closed positions")
        
        return jsonify({
            'success': True,
            'closed_pnl': closed_pnl,
            'wallet_data': {
                'total_balance': wallet_data['total_balance'],
                'available_balance': wallet_data['available_balance'],
                'realized_pnl': wallet_data['realized_pnl']
            }
        })
    except Exception as e:
        print(f"[API] Error getting closed PNL: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

class MiniChartService:
    def __init__(self):
        self.charts_cache = {}
        self.update_interval = 300
        # Устанвливаем бэкенд для всех графиков
        matplotlib.use('Agg', force=True)

    def generate_chart(self, symbol, data, theme='dark'):
        try:
            plt.style.use('dark_background' if theme == 'dark' else 'default')
            
            # Создаем новую фигуру для каждого графика
            fig = plt.figure(figsize=(2, 0.75))
            ax = fig.add_subplot(111)
            
            # Определяем тренд
            trend_color = CHART_COLORS['POSITIVE']['BORDER'] if data[-1] > data[0] else CHART_COLORS['NEGATIVE']['BORDER']
            
            # Настройки в зависимости от темы
            if theme == 'dark':
                ax.plot(data, color=trend_color, linewidth=1)
                fig.patch.set_facecolor('#2d2d2d')
                ax.set_facecolor('#2d2d2d')
                ax.tick_params(colors='white')
            else:
                ax.plot(data, color=trend_color, linewidth=1)
                fig.patch.set_facecolor('#ffffff')
                ax.set_facecolor('#ffffff')
                ax.tick_params(colors='black')
            
            ax.axis('off')
            plt.margins(0)
            
            buffer = BytesIO()
            fig.savefig(buffer, 
                       format='png', 
                       dpi=72, 
                       bbox_inches='tight', 
                       pad_inches=0, 
                       facecolor=fig.get_facecolor(),
                       edgecolor='none',
                       transparent=False)
            plt.close(fig)  # Важно закрывать фигуру
            
            buffer.seek(0)
            image_base64 = base64.b64encode(buffer.getvalue()).decode()
            buffer.close()
            
            return image_base64
        except Exception as e:
            print(f"Error generating chart: {e}")
            return ''

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
                prices = [float(k[4]) for k in response['result']['list']]  # Берем цены закрытия
                if len(prices) >= 2:  # Проверяем, что есть хотя бы 2 точки для определения тренда
                    return prices
            return []
        except Exception as e:
            print(f"Error getting chart data for {symbol}: {e}")
            return []

# Создаем экземпляр сервиса
mini_chart_service = MiniChartService()

@app.route('/get_symbol_chart/<symbol>')
def get_symbol_chart(symbol):
    try:
        theme = request.args.get('theme', 'dark')
        
        data = exchange.get_symbol_chart_data(symbol)
        if not data:
            return jsonify({'chart': ''})
        
        chart_base64 = mini_chart_service.generate_chart(symbol, data, theme)
        
        # Кируе дл обеих тем
        cache_key = f"{symbol}_{theme}"
        mini_chart_service.charts_cache[cache_key] = {
            'data': chart_base64,
            'timestamp': datetime.now()
        }
        
        return jsonify({'chart': chart_base64})
    except Exception as e:
        print(f"Error in get_symbol_chart: {e}")
        return jsonify({'chart': ''})

@app.route('/get_sma200_position/<symbol>')
def get_sma200_position(symbol):
    try:
        print(f"Calculating SMA200 for {symbol}...")
        above_sma200 = exchange.get_sma200_position(symbol)
        print(f"SMA200 result for {symbol}: {'ABOVE' if above_sma200 else 'BELOW'}")
        return jsonify({'above_sma200': above_sma200})
    except Exception as e:
        print(f"Error in get_sma200_position for {symbol}: {e}")
        return jsonify({'above_sma200': None})

def calculate_statistics(positions):
    """Calculates statistics for positions"""
    total_profit = 0
    total_loss = 0
    high_profitable = []
    profitable = []
    losing = []

    for position in positions:
        pnl = position['pnl']
        if pnl > 0:
            if pnl >= 100:
                high_profitable.append(position)
            else:
                profitable.append(position)
            total_profit += pnl
        else:
            losing.append(position)
            total_loss += pnl

    return {
        'total_pnl': total_profit + total_loss,
        'total_profit': total_profit,
        'total_loss': total_loss,
        'total_trades': len(positions),
        'profitable_count': len(high_profitable) + len(profitable),
        'losing_count': len(losing),
        'top_profitable': sorted(high_profitable + profitable, key=lambda x: x['pnl'], reverse=True)[:3],
        'top_losing': sorted(losing, key=lambda x: x['pnl'])[:3]
    }

def send_daily_report():
    """Отправка ежедневного отчета"""
    while True:
        now = datetime.now()
        if now.strftime('%H:%M') == TELEGRAM_NOTIFY['DAILY_REPORT_TIME']:
            positions, _ = exchange.get_positions()
            if positions:
                stats = calculate_statistics(positions)
                telegram.send_daily_report(stats)
        time.sleep(60)  # Проверяем каждую минуту

# Глобальная переменная для хранения текущей биржи
current_exchange = None

def init_exchange():
    """Инициализация биржи"""
    try:
        exchange_config = EXCHANGES[ACTIVE_EXCHANGE]
        print(f"\nTesting connection to {ACTIVE_EXCHANGE}...")
        
        exchange = ExchangeFactory.create_exchange(
            ACTIVE_EXCHANGE,
            exchange_config['api_key'],
            exchange_config['api_secret'],
            exchange_config.get('passphrase')  # Добавляем passphrase для OKX
        )
        
        print(f"Successfully connected to {ACTIVE_EXCHANGE}")
        return exchange
    except Exception as e:
        print(f"Error testing new exchange connection: {str(e)}")
        return None

@app.route('/api/exchanges', methods=['GET'])
def get_exchanges():
    """Получение списка доступных бирж"""
    exchanges = [{
        'name': name,
        'enabled': config['enabled'],
        'active': name == ACTIVE_EXCHANGE
    } for name, config in EXCHANGES.items()]
    return jsonify({'exchanges': exchanges})

@app.route('/api/exchange', methods=['POST'])
def switch_exchange():
    """Переключение активной биржи"""
    global current_exchange
    try:
        data = request.get_json()
        exchange_name = data.get('exchange')
        
        if exchange_name not in EXCHANGES:
            return jsonify({'error': 'Exchange not found'}), 404
            
        if not EXCHANGES[exchange_name]['enabled']:
            return jsonify({'error': 'Exchange is disabled'}), 400
        
        try:
            # Создаем новый экземпляр биржи для проверки подключения
            exchange_config = EXCHANGES[exchange_name]
            new_exchange = ExchangeFactory.create_exchange(
                exchange_name,
                exchange_config['api_key'],
                exchange_config['api_secret'],
                exchange_config.get('passphrase')  # Добавляем passphrase для OKX
            )
            
            # Пробуем получить позиции для проверки работоспособности
            positions, _ = new_exchange.get_positions()
            
            # Если все хорошо, обновляем конфигурацию
            with open('app/config.py', 'r', encoding='utf-8') as f:
                config_content = f.read()
            
            # Обновляем активную биржу в конфиге
            new_config = config_content.replace(
                f"ACTIVE_EXCHANGE = '{ACTIVE_EXCHANGE}'",
                f"ACTIVE_EXCHANGE = '{exchange_name}'"
            )
            
            with open('app/config.py', 'w', encoding='utf-8') as f:
                f.write(new_config)
            
            # Обновляем текущую биржу
            current_exchange = new_exchange
            
            return jsonify({
                'success': True,
                'message': f'Switched to {exchange_name}'
            })
            
        except Exception as e:
            print(f"Error testing new exchange connection: {str(e)}")
            return jsonify({
                'error': f'Failed to connect to {exchange_name}: {str(e)}'
            }), 500
            
    except Exception as e:
        print(f"Error in switch_exchange: {str(e)}")
        return jsonify({'error': str(e)}), 500

# Инициализируем биржу при запуске
exchange = init_exchange()
if not exchange:
    print("Failed to initialize exchange")
    sys.exit(1)

# Добавляем функцию clean_symbol если она где-то используется
def clean_symbol(symbol):
    """Удаляет 'USDT' из названия символа"""
    return symbol.replace('USDT', '')

@app.route('/api/set_language', methods=['POST'])
def set_language():
    data = request.get_json()
    language = data.get('language', 'en')
    print(f"Setting language to: {language}")
    save_language(language)
    telegram.set_language(language)
    return jsonify({'status': 'success', 'language': language})

@app.route('/api/ticker/<symbol>')
def get_ticker(symbol):
    try:
        print(f"[TICKER] Getting ticker for {symbol}...")
        
        # Проверяем инициализацию биржи
        if not exchange:
            print("[TICKER] Exchange not initialized")
            return jsonify({'error': 'Exchange not initialized'}), 500
            
        # Получаем данные тикера
        ticker_data = exchange.get_ticker(symbol)
        print(f"[TICKER] Raw ticker data: {ticker_data}")
        
        if ticker_data:
            print(f"[TICKER] Successfully got ticker for {symbol}: {ticker_data}")
            return jsonify(ticker_data)
            
        print(f"[TICKER] No ticker data available for {symbol}")
        return jsonify({'error': 'No ticker data available'}), 404
        
    except Exception as e:
        print(f"[TICKER] Error getting ticker for {symbol}: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/close_position', methods=['POST'])
def close_position():
    """Закрытие позиции"""
    try:
        data = request.json
        if not data or not all(k in data for k in ['symbol', 'size', 'side']):
            return jsonify({
                'success': False,
                'message': 'Не указаны обязательные параметры (symbol, size, side)'
            }), 400

        print(f"[API] Closing position: {data}")
        result = exchange.close_position(
            symbol=data['symbol'],
            size=float(data['size']),
            side=data['side'],
            order_type=data.get('order_type', 'Limit')  # По умолчанию используем Limit для обратной совместимости
        )
        
        print(f"[API] Close position result: {result}")
        return jsonify(result)
        
    except Exception as e:
        print(f"[API] Error closing position: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'Ошибка при закрытии позиции: {str(e)}'
        }), 500

@app.route('/api/get_language')
def get_language():
    """Получение текущего языка"""
    try:
        current_lang = get_current_language()
        return jsonify({
            'success': True,
            'language': current_lang
        })
    except Exception as e:
        print(f"Error getting language: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/pairs')
def get_pairs():
    """Получение списка всех доступных пар"""
    try:
        pairs = exchange.get_all_pairs()
        return jsonify({
            'success': True,
            'pairs': pairs
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/chart/<symbol>')
def get_chart_data(symbol):
    try:
        timeframe = request.args.get('timeframe', '1h')
        period = request.args.get('period', '1w')
        
        # Используем глобальную переменную exchange
        data = exchange.get_chart_data(symbol, timeframe, period)
        
        # Проверяем успешность ответа
        if not data.get('success'):
            return jsonify(data), 500
            
        # Возвращаем данные без дополнительного оборачивания
        return jsonify(data)
        
    except Exception as e:
        app.logger.error(f'Error getting chart data: {str(e)}')
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/indicators/<symbol>')
def get_indicators(symbol):
    try:
        timeframe = request.args.get('timeframe', '1h')
        
        # Используем глобальную переменную exchange
        data = exchange.get_indicators(symbol, timeframe)
        
        return jsonify({
            'success': True,
            'data': data
        })
    except Exception as e:
        app.logger.error(f'Error getting indicators: {str(e)}')
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/blacklist', methods=['POST'])
def manage_blacklist():
    """Управление черным списком"""
    try:
        data = request.get_json()
        action = data.get('action')
        symbol = data.get('symbol')
        
        if not action or not symbol:
            return jsonify({
                'success': False,
                'error': 'Missing required parameters'
            }), 400
            
        blacklist_file = 'data/blacklist.json'
        os.makedirs('data', exist_ok=True)
        
        try:
            with open(blacklist_file, 'r') as f:
                blacklist = json.load(f)
        except:
            blacklist = []
            
        if action == 'add':
            if symbol not in blacklist:
                blacklist.append(symbol)
        elif action == 'remove':
            if symbol in blacklist:
                blacklist.remove(symbol)
                
        with open(blacklist_file, 'w') as f:
            json.dump(blacklist, f)
            
        return jsonify({
            'success': True,
            'blacklist': blacklist
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# Добавляем глобальные переменные для кэширования
ticker_analysis_cache = {}
CACHE_TIMEOUT = 300  # 5 минут

def determine_trend_and_position(symbol, force_update=False):
    """Определяет тренд и позицию цены на графике с кэшированием"""
    global ticker_analysis_cache
    current_time = time.time()
    
    # Проверяем кэш, если не требуется принудительное обновление
    if not force_update and symbol in ticker_analysis_cache:
        cached_data = ticker_analysis_cache[symbol]
        if current_time - cached_data['timestamp'] < CACHE_TIMEOUT:
            return cached_data['data']
    
    try:
        # Получаем исторические данные
        data = exchange.get_chart_data(symbol, '1d', '1M')
        if not data.get('success'):
            return None
            
        candles = data.get('data', {}).get('candles', [])
        if not candles:
            return None
            
        # Находим минимальную и максимальную цену
        min_price = min(float(candle['low']) for candle in candles)
        max_price = max(float(candle['high']) for candle in candles)
        current_price = float(candles[-1]['close'])
        
        # Определяем позицию цены в процентах от диапазона
        price_range = max_price - min_price
        if price_range == 0:
            return None
            
        position_percent = ((current_price - min_price) / price_range) * 100
        
        # Определяем тренд
        period = 14  # период для определения тренда
        if len(candles) < period:
            return None
            
        recent_prices = [float(candle['close']) for candle in candles[-period:]]
        first_half = sum(recent_prices[:period//2]) / (period//2)
        second_half = sum(recent_prices[period//2:]) / (period//2)
        
        if second_half > first_half * 1.02:  # 2% разница для определения роста
            trend = 'рост'
        elif first_half > second_half * 1.02:  # 2% разница для определения падения
            trend = 'падение'
        else:
            trend = 'флэт'
            
        # Определяем состояние тикера
        state = None
        if 0 <= position_percent <= 10:
            if trend in ['флэт', 'рост']:
                state = 'дно рынка'
            else:
                state = 'падение'
        elif 10 < position_percent <= 40:
            state = trend
        elif 40 < position_percent <= 60:
            state = trend
        elif 60 < position_percent <= 90:
            if trend == 'флэт':
                state = 'диапазон распродажи'
            elif trend == 'падение':
                state = 'диапазон падения'
            else:
                state = 'рост'
        elif 90 < position_percent <= 100:
            if trend == 'флэт':
                state = 'хай рынка'
            elif trend == 'падение':
                state = 'падение'
            else:
                state = 'диапазон распродажи'
        
        result = {
            'trend': trend,
            'position_percent': position_percent,
            'state': state
        }
        
        # Сохраняем результат в кэш
        ticker_analysis_cache[symbol] = {
            'data': result,
            'timestamp': current_time
        }
        
        return result
        
    except Exception:
        return None

def clear_old_cache():
    """Очищает устаревшие данные из кэша"""
    global ticker_analysis_cache
    current_time = time.time()
    expired_symbols = [
        symbol for symbol, data in ticker_analysis_cache.items()
        if current_time - data['timestamp'] >= CACHE_TIMEOUT
    ]
    for symbol in expired_symbols:
        del ticker_analysis_cache[symbol]

@app.route('/api/ticker_analysis/<symbol>')
def get_ticker_analysis(symbol):
    """Получение анализа тикера (тренд и позиция на графике)"""
    try:
        force_update = request.args.get('force_update', '0') == '1'
        analysis = determine_trend_and_position(symbol, force_update)
        if analysis:
            return jsonify({
                'success': True,
                'data': analysis,
                'cached': not force_update and symbol in ticker_analysis_cache
            })
        return jsonify({
            'success': False,
            'error': 'Could not analyze ticker'
        }), 400
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

def background_cache_cleanup():
    """Фоновая очистка кэша"""
    while True:
        try:
            clear_old_cache()
        except Exception as e:
            print(f"Error in cache cleanup: {str(e)}")
        time.sleep(60)  # Проверяем каждую минуту

# Кэш для хранения данных свечей
candles_cache = {}
CACHE_TIMEOUT = 300  # 5 минут

@app.route('/api/candles/<symbol>')
def get_candles(symbol):
    """Получение свечей для расчета тренда на клиенте"""
    current_time = time.time()
    
    # Проверяем кэш
    if symbol in candles_cache:
        cached_data = candles_cache[symbol]
        if current_time - cached_data['timestamp'] < CACHE_TIMEOUT:
            return jsonify(cached_data['data'])
    
    try:
        # Получаем данные за последний месяц
        data = exchange.get_chart_data(symbol, '1d', '1M')
        if not data.get('success'):
            return jsonify({'success': False, 'error': 'Не удалось получить данные'})
        
        # Сохраняем в кэш
        candles_cache[symbol] = {
            'data': data,
            'timestamp': current_time
        }
        
        return jsonify(data)
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

def clear_old_cache():
    """Очистка устаревших данных из кэша"""
    current_time = time.time()
    expired_symbols = [
        symbol for symbol, data in candles_cache.items()
        if current_time - data['timestamp'] >= CACHE_TIMEOUT
    ]
    for symbol in expired_symbols:
        del candles_cache[symbol]

def background_cache_cleanup():
    """Фоновая очистка кэша"""
    while True:
        try:
            clear_old_cache()
        except Exception:
            pass
        time.sleep(60)  # Проверяем каждую минуту

if __name__ == '__main__':
    # Создаем директорию для логов
    if not os.path.exists('logs'):
        os.makedirs('logs')
    
    # Запускаем только в основном процессе
    if not os.environ.get('WERKZEUG_RUN_MAIN'):
        Timer(1.5, open_browser).start()
    else:
        # Запускаем фоновые процессы только в дочернем процессе
        update_thread = threading.Thread(target=background_update)
        update_thread.daemon = True
        update_thread.start()
        
        # Запускаем поток для отправки дневного отчета
        if TELEGRAM_NOTIFY['DAILY_REPORT']:
            daily_report_thread = threading.Thread(target=send_daily_report)
            daily_report_thread.daemon = True
            daily_report_thread.start()
            
        # Запускаем поток очистки кэша
        cache_cleanup_thread = threading.Thread(target=background_cache_cleanup)
        cache_cleanup_thread.daemon = True
        cache_cleanup_thread.start()
    
    # Запускаем Flask-сервер
    app.run(debug=APP_DEBUG, host=APP_HOST, port=APP_PORT, use_reloader=True) 