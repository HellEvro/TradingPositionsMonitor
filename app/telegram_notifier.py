import requests
from datetime import datetime
import logging
from app.config import *
import json
import os
import threading
import atexit
import sys
from threading import Lock
from app.language import get_current_language, get_telegram_message

class TelegramNotifier:
    def __init__(self):
        # Создаем директорию для логов, если она не существует
        log_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'logs')
        os.makedirs(log_dir, exist_ok=True)
        
        logging.basicConfig(
            filename=os.path.join(log_dir, 'telegram.log'),
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            level=logging.INFO
        )
        self.logger = logging.getLogger('TelegramNotifier')

        # Затем инициализируем остальные атрибуты
        self.bot_token = TELEGRAM_BOT_TOKEN
        self.chat_id = TELEGRAM_CHAT_ID
        self.api_url = f"https://api.telegram.org/bot{self.bot_token}"
        self.enabled = TELEGRAM_NOTIFICATIONS_ENABLED
        
        # Добавляем текущий язык
        self.language = get_current_language()
        
        # Обновляем путь к файлу состояний
        self.states_file = 'app/telegram_states.json'
        
        # Добавляем словари для отслеживания
        self.last_notification_time = {}
        self.last_values = {}  # Словарь для хранения последних значений
        self.notification_cooldown = 10
        
        # Добавляем пороговые значения для отслеживания пересечений
        self.thresholds = {
            'high_pnl': DEFAULT_PNL_THRESHOLD,  # 1000 USDT
            'high_roi': HIGH_ROI_THRESHOLD,     # 100%
            'high_loss': HIGH_LOSS_THRESHOLD,   # -40 USDT
            'rapid_growth': GROWTH_MULTIPLIER    # 2.0
        }
        
        # Загружаем сохраненные состояния или создаем новые
        if os.path.exists(self.states_file):
            try:
                with open(self.states_file, 'r') as f:
                    states = json.load(f)
                    if 'last_update' in states:
                        last_update = datetime.strptime(states['last_update'], '%Y-%m-%d %H:%M:%S')
                        # Если прошло больше часа, сбрасываем состояния
                        if (datetime.now() - last_update).total_seconds() > 3600:
                            self._init_empty_states()
                        else:
                            self.high_roi_positions = set(states.get('high_roi', []))
                            self.high_loss_positions = set(states.get('high_loss', []))
                            self.rapid_growth_positions = set(states.get('rapid_growth', []))
                            self.high_pnl_positions = set(states.get('high_pnl', []))
                    else:
                        self._init_empty_states()
            except Exception as e:
                self.logger.error(f"Error loading states: {e}")
                self._init_empty_states()
        else:
            self._init_empty_states()

        # Добавляем блокировку д��я безопасного вывода
        self.print_lock = Lock()
        
        # Регистрируем обработчик завершения
        atexit.register(self.cleanup)
        
    def cleanup(self):
        """Очистка ресурсов при завершении"""
        try:
            with self.print_lock:
                sys.stdout.flush()
        except:
            pass
            
    def safe_print(self, message):
        """Безопасный вывод сообщений"""
        try:
            with self.print_lock:
                print(message)
                sys.stdout.flush()
        except:
            pass

    def _init_empty_states(self):
        """Инициализация пустых состояний"""
        self.high_roi_positions = set()
        self.high_loss_positions = set()
        self.rapid_growth_positions = set()
        self.high_pnl_positions = set()
        
        # Удаляем существующий файл состояний
        if os.path.exists(self.states_file):
            os.remove(self.states_file)
        
        # Сохраняем пустые состояния
        self._save_states()

    def _save_states(self):
        """Сохранение состояний в файл"""
        states = {
            'high_roi': list(self.high_roi_positions),
            'high_loss': list(self.high_loss_positions),
            'rapid_growth': list(self.rapid_growth_positions),
            'high_pnl': list(self.high_pnl_positions),
            'last_update': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        }
        try:
            # Создаем директорию app, если её нет
            os.makedirs('app', exist_ok=True)
            
            with open(self.states_file, 'w') as f:
                json.dump(states, f, indent=2)
            self.logger.info(f"States saved successfully: {states}")
        except Exception as e:
            self.logger.error(f"Error saving states: {e}")

    def send_message(self, message, parse_mode='HTML'):
        """Отправка сообщения в Telegram"""
        
        if not self.enabled:
            return
        
        try:
            url = f"{self.api_url}/sendMessage"
            data = {
                "chat_id": self.chat_id,
                "text": message,
                "parse_mode": parse_mode
            }
            
            response = requests.post(url, data=data)
            
            if not response.ok:
                self.logger.error(f"Failed to send message: {response.text}")
            
        except Exception as e:
            self.logger.error(f"Error sending message: {str(e)}")

    def send_error(self, error):
        if not TELEGRAM_NOTIFY.get('ERRORS', False):
            self.logger.info("Error notifications disabled, skipping")
            return
            
        message = f"❌ <b>Error</b>\n\n{error}\n\nTime: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
        self.send_message(message)

    def send_position_alert(self, position, alert_type):
        if not TELEGRAM_NOTIFY.get(alert_type.upper(), False):
            self.logger.info(f"Alert type {alert_type} disabled, skipping")
            return
        
        symbol = position['symbol']
        current_time = datetime.now()
        
        # Получаем текущее значение с учетом разных ключей
        current_value = {
            'high_pnl': position.get('pnl', position.get('current_pnl', 0)),
            'high_roi': position.get('roi', 0),
            'high_loss': position.get('pnl', position.get('current_pnl', 0)),
            'rapid_growth': position.get('growth_ratio', 0)
        }.get(alert_type)

        # Проверяем пересечение порогового значения
        if symbol in self.last_values:
            last_value = self.last_values[symbol].get(alert_type)
            threshold = self.thresholds[alert_type]
            
            if last_value is not None:
                # Для high_pnl и high_roi
                if alert_type in ['high_pnl', 'high_roi']:
                    # Если предыдущее значение было выше порога и текущее тоже выше
                    if last_value >= threshold and current_value >= threshold:
                        self.logger.info(f"Skipping {alert_type} alert for {symbol}: still above threshold")
                        return
                    # Если текущее значение ниже порога, обновляем last_value и пропускаем
                    if current_value < threshold:
                        self.last_values[symbol][alert_type] = current_value
                        return
                
                # Для high_loss
                elif alert_type == 'high_loss':
                    # Если предыдущее значение было ниже порога и текущее тоже ниже
                    if last_value <= threshold and current_value <= threshold:
                        self.logger.info(f"Skipping {alert_type} alert for {symbol}: still below threshold")
                        return
                    # Если текущее значение выше порога, обновляем last_value и пропускаем
                    if current_value > threshold:
                        self.last_values[symbol][alert_type] = current_value
                        return
                
                # Для rapid_growth
                elif alert_type == 'rapid_growth':
                    # Если предыдущее значение было выше порога  текущее тоже выше
                    if last_value >= threshold and current_value >= threshold:
                        self.logger.info(f"Skipping rapid growth alert for {symbol}: still above threshold")
                        return
                    # Если текущее значение ниже порога, обновляем last_value и пропускаем
                    if current_value < threshold:
                        self.last_values[symbol][alert_type] = current_value
                        return

        # Проверяем веменной интервал
        if symbol in self.last_notification_time:
            time_since_last = (current_time - self.last_notification_time[symbol]).total_seconds()
            if time_since_last < self.notification_cooldown:
                self.logger.info(f"Skipping {alert_type} alert for {symbol}: cooldown period")
                return

        # Обновляем время и значение
        self.last_notification_time[symbol] = current_time
        if symbol not in self.last_values:
            self.last_values[symbol] = {}
        self.last_values[symbol][alert_type] = current_value

        # Проверяем условия для каждого типа уведомлений
        if alert_type == 'rapid_growth' and TELEGRAM_NOTIFY['RAPID_GROWTH']:
            if symbol in self.rapid_growth_positions:
                self.logger.info(f"Rapid growth alert for {symbol} already sent")
                return
            self.rapid_growth_positions.add(symbol)
            self._save_states()
            message = (
                f"📈 <b>Rapid Growth Alert</b>\n\n"
                f"Symbol: {symbol}\n"
                f"Growth: x{position.get('growth_ratio', 0):.2f}\n"
                f"Current PnL: {position.get('current_pnl', 0):.2f} USDT\n"
                f"Start PnL: {position.get('start_pnl', 0):.2f} USDT"
            )
            
        elif alert_type == 'high_roi' and TELEGRAM_NOTIFY['HIGH_ROI']:
            if symbol in self.high_roi_positions:
                self.logger.info(f"High ROI alert for {symbol} already sent and still above threshold")
                return
            self.high_roi_positions.add(symbol)
            self._save_states()
            message = (
                f"🎯 <b>High ROI Alert</b>\n\n"
                f"Symbol: {symbol}\n"
                f"ROI: {position.get('roi', 0):.2f}%\n"
                f"PnL: {position.get('pnl', position.get('current_pnl', 0)):.2f} USDT"
            )
            
        elif alert_type == 'high_loss' and TELEGRAM_NOTIFY['HIGH_LOSS']:
            if symbol in self.high_loss_positions:
                self.logger.info(f"High loss alert for {symbol} already sent and still below threshold")
                return
            self.high_loss_positions.add(symbol)
            self._save_states()
            message = (
                f"⚠️ <b>High Loss Alert</b>\n\n"
                f"Symbol: {symbol}\n"
                f"PnL: {position.get('pnl', position.get('current_pnl', 0)):.2f} USDT\n"
                f"ROI: {position.get('roi', 0):.2f}%"
            )
        elif alert_type == 'high_pnl' and TELEGRAM_NOTIFY['HIGH_PNL']:
            if symbol in self.high_pnl_positions:
                self.logger.info(f"High PnL alert for {symbol} already sent and still above threshold")
                return
            self.high_pnl_positions.add(symbol)
            self._save_states()
            message = (
                f"💰 <b>High PnL Alert</b>\n\n"
                f"Symbol: {symbol}\n"
                f"PnL: {position.get('pnl', position.get('current_pnl', 0)):.2f} USDT\n"
                f"ROI: {position.get('roi', 0):.2f}%"
            )
        else:
            self.logger.info(f"Unknown alert type or disabled: {alert_type}")
            return
        
        # Отправляем сообщение
        self.send_message(message)

    def update_position_states(self, positions, daily_pnl):
        """Обновляет состояния позиций и удаляет те, что вышли из своих состояний"""
        changed = False  # Флаг для отслеживания изменений
        current_symbols = set()
        
        for position in positions:
            symbol = position['symbol']
            current_symbols.add(symbol)
            
            # Проверяем и обновляем состояния
            if symbol in self.high_roi_positions:
                if position['roi'] <= HIGH_ROI_THRESHOLD:
                    self.high_roi_positions.remove(symbol)
                    self.logger.info(f"{symbol} removed from high ROI positions (ROI: {position['roi']}%)")
                    changed = True
            
            if symbol in self.high_loss_positions:
                if position['pnl'] > HIGH_LOSS_THRESHOLD:
                    self.high_loss_positions.remove(symbol)
                    self.logger.info(f"{symbol} removed from high loss positions (PnL: {position['pnl']} USDT)")
                    changed = True
            
            # Для rapid growth проверяем соотношение роста
            if symbol in self.rapid_growth_positions:
                if symbol in daily_pnl:
                    current_pnl = position['pnl']
                    start_pnl = daily_pnl[symbol]
                    if start_pnl > 0 and current_pnl > 0:
                        growth_ratio = current_pnl / start_pnl
                        if growth_ratio < GROWTH_MULTIPLIER:
                            self.rapid_growth_positions.remove(symbol)
                            self.logger.info(f"{symbol} removed from rapid growth positions (ratio: {growth_ratio:.2f})")
                            changed = True
                    else:
                        self.rapid_growth_positions.remove(symbol)
                        self.logger.info(f"{symbol} removed from rapid growth positions (negative PnL)")
                        changed = True
            
            # Проверяем high_pnl позиции
            if symbol in self.high_pnl_positions:
                if position['pnl'] <= DEFAULT_PNL_THRESHOLD:
                    self.high_pnl_positions.remove(symbol)
                    self.logger.info(f"{symbol} removed from high PnL positions (PnL: {position['pnl']:.2f} USDT)")
                    changed = True
        
        # Удаляем позиции, которых больше нет в списке
        for symbol_set in [self.high_roi_positions, self.high_loss_positions, self.rapid_growth_positions, self.high_pnl_positions]:
            symbols_to_remove = symbol_set - current_symbols
            for symbol in symbols_to_remove:
                symbol_set.remove(symbol)
                self.logger.info(f"Removed closed position {symbol} from tracking")
        
        # Сохраняем состояния только если были изменения
        if changed:
            self._save_states()

    def send_daily_report(self, stats):
        if not TELEGRAM_NOTIFY.get('DAILY_REPORT', False):
            self.logger.info("Daily report disabled, skipping")
            return
        
        current_time = datetime.now().strftime('%H:%M')
        if current_time != TELEGRAM_NOTIFY['DAILY_REPORT_TIME']:
            self.logger.info(f"Not time for daily report (current: {current_time}, scheduled: {TELEGRAM_NOTIFY['DAILY_REPORT_TIME']})")
            return

        top_profitable = '\n'.join([
            f"• {pos['symbol']}: {pos['pnl']:.2f} USDT"
            for pos in stats['top_profitable'][:3]
        ])
        
        top_losing = '\n'.join([
            f"• {pos['symbol']}: {pos['pnl']:.2f} USDT"
            for pos in stats['top_losing'][:3]
        ])

        message = get_telegram_message('daily_report', self.language).format(
            date=datetime.now().strftime('%Y-%m-%d'),
            total_pnl=f"{stats['total_pnl']:.2f}",
            total_profit=f"{stats['total_profit']:.2f}",
            total_loss=f"{stats['total_loss']:.2f}",
            total_trades=stats['total_trades'],
            profitable_count=stats['profitable_count'],
            losing_count=stats['losing_count'],
            top_profitable=top_profitable,
            top_losing=top_losing
        )
        
        self.send_message(message)

    def send_statistics(self, stats):
        """Отправка статистики в телеграм"""
        try:
            if not TELEGRAM_NOTIFY.get('STATISTICS', False):
                return

            top_profitable = '\n'.join([
                f"• {pos['symbol']}: {pos['pnl']:.2f} USDT"
                for pos in stats['top_profitable'][:3]
            ])
            
            top_losing = '\n'.join([
                f"• {pos['symbol']}: {pos['pnl']:.2f} USDT"
                for pos in stats['top_losing'][:3]
            ])

            message = get_telegram_message('statistics', self.language).format(
                time=datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                total_pnl=f"{stats['total_pnl']:.2f}",
                total_profit=f"{stats['total_profit']:.2f}",
                total_loss=f"{stats['total_loss']:.2f}",
                total_trades=stats['total_trades'],
                profitable_count=stats['profitable_count'],
                losing_count=stats['losing_count'],
                top_profitable=top_profitable,
                top_losing=top_losing
            )
            
            self.send_message(message)

        except Exception as e:
            self.logger.error(f"Error in send_statistics: {str(e)}")

    def check_position_notifications(self, position):
        """Проверяет позицию на различные условия для отправки уведомлений"""
        symbol = position['symbol']
        pnl = position['pnl']
        roi = position['roi']
        
        # Проверка на высокий PnL
        if (TELEGRAM_NOTIFY.get('HIGH_PNL') and 
            pnl >= DEFAULT_PNL_THRESHOLD and 
            symbol not in self.high_pnl_positions):
            self.high_pnl_positions.add(symbol)
            self._save_states()
            message = get_telegram_message('high_pnl', self.language).format(
                symbol=symbol,
                pnl=f"{pnl:.2f}",
                roi=f"{roi:.2f}"
            )
            self.send_message(message)
        
        # Проверка на высокий ROI
        if (TELEGRAM_NOTIFY.get('HIGH_ROI') and 
            roi >= HIGH_ROI_THRESHOLD and 
            symbol not in self.high_roi_positions):
            self.high_roi_positions.add(symbol)
            self._save_states()
            message = get_telegram_message('high_roi', self.language).format(
                symbol=symbol,
                roi=f"{roi:.2f}",
                pnl=f"{pnl:.2f}"
            )
            self.send_message(message)
        
        # Проверка на большой убыток
        if (TELEGRAM_NOTIFY.get('HIGH_LOSS') and 
            pnl <= HIGH_LOSS_THRESHOLD and 
            symbol not in self.high_loss_positions):
            self.high_loss_positions.add(symbol)
            self._save_states()
            message = get_telegram_message('high_loss', self.language).format(
                symbol=symbol,
                pnl=f"{pnl:.2f}",
                roi=f"{roi:.2f}"
            )
            self.send_message(message)

    def check_rapid_growth(self, rapid_growth_positions):
        """Проверяет позиции на быстрый рост"""
        if not TELEGRAM_NOTIFY.get('RAPID_GROWTH', False):
            return
        
        for position in rapid_growth_positions:
            symbol = position['symbol']
            if symbol not in self.rapid_growth_positions:
                growth_rate = position.get('growth_ratio')
                pnl = position.get('current_pnl')
                
                self.rapid_growth_positions.add(symbol)
                self._save_states()
                message = get_telegram_message('rapid_growth', self.language).format(
                    symbol=symbol,
                    growth_ratio=f"{growth_rate:.2f}",
                    current_pnl=f"{pnl:.2f}"
                )
                self.send_message(message)

    def set_language(self, language):
        """Установка языка уведомлений"""
        self.language = language if language in ['en', 'ru'] else 'en'
        self.logger.info(f"Telegram language set to: {self.language}")
