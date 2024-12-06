import os

# Словари с переводами для Telegram
TELEGRAM_MESSAGES = {
    'en': {
        'rapid_growth': '🚀 <b>Rapid Growth Alert</b>\n\nSymbol: {symbol}\nGrowth: x{growth_ratio}\nCurrent PnL: {current_pnl} USDT',
        'high_roi': '🎯 <b>High ROI Alert</b>\n\nSymbol: {symbol}\nROI: {roi}%\nPnL: {pnl} USDT',
        'high_loss': '⚠️ <b>High Loss Alert</b>\n\nSymbol: {symbol}\nPnL: {pnl} USDT\nROI: {roi}%',
        'high_pnl': '💰 <b>High PnL Alert</b>\n\nSymbol: {symbol}\nPnL: {pnl} USDT\nROI: {roi}%',
        'daily_report': '📊 <b>Daily Report</b> ({date})\n\n💰 Total PnL: {total_pnl} USDT\n📈 Total Profit: {total_profit} USDT\n📉 Total Loss: {total_loss} USDT\n\n📊 Statistics:\n- Total Trades: {total_trades}\n- Profitable: {profitable_count}\n- Losing: {losing_count}\n\n🏆 TOP-3 Profitable:\n{top_profitable}\n\n💔 TOP-3 Losing:\n{top_losing}',
        'statistics': '📊 Statistics Report\nTime: {time}\n\n💰 Total PnL: {total_pnl} USDT\n📈 Total Profit: {total_profit} USDT\n📉 Total Loss: {total_loss} USDT\n\n📊 Positions:\n• Total: {total_trades}\n• Profitable: {profitable_count}\n• Losing: {losing_count}\n\n🏆 TOP-3 Profitable:\n{top_profitable}\n\n💔 TOP-3 Losing:\n{top_losing}',
        'noPositions': 'No positions',
        'noMatches': 'No matches'
    },
    'ru': {
        'rapid_growth': '🚀 <b>Быстрый Рост</b>\n\nСимвол: {symbol}\nРост: x{growth_ratio}\nТекущий PnL: {current_pnl} USDT',
        'high_roi': '🎯 <b>Высокий ROI</b>\n\nСимвол: {symbol}\nROI: {roi}%\nPnL: {pnl} USDT',
        'high_loss': '⚠️ <b>Большой Убыток</b>\n\nСимвол: {symbol}\nPnL: {pnl} USDT\nROI: {roi}%',
        'high_pnl': '💰 <b>Высокий PnL</b>\n\nСимвол: {symbol}\nPnL: {pnl} USDT\nROI: {roi}%',
        'daily_report': '📊 <b>Дневной Отчет</b> ({date})\n\n💰 Общий PnL: {total_pnl} USDT\n📈 Общая прибыль: {total_profit} USDT\n📉 Общий убыток: {total_loss} USDT\n\n📊 Статистика:\n- Всего сделок: {total_trades}\n- Прибыльных: {profitable_count}\n- Убыточных: {losing_count}\n\n🏆 ТОП-3 прибыльных:\n{top_profitable}\n\n💔 ТОП-3 убыточных:\n{top_losing}',
        'statistics': '📊 Статистика\nВремя: {time}\n\n💰 Общий PnL: {total_pnl} USDT\n📈 Общая прибыль: {total_profit} USDT\n📉 Общий убыток: {total_loss} USDT\n\n📊 Позиции:\n• Всего: {total_trades}\n• Прибыльных: {profitable_count}\n• Убыточных: {losing_count}\n\n🏆 ТОП-3 прибыльных:\n{top_profitable}\n\n💔 ТОП-3 убыточных:\n{top_losing}',
        'noPositions': 'Нет позиций',
        'noMatches': 'Нет совпадений'
    }
}

# Создаем файл для хранения текущего языка
def save_language(lang):
    try:
        os.makedirs('app', exist_ok=True)
        with open('app/current_language.txt', 'w') as f:
            f.write(lang)
        print(f"Language saved successfully: {lang}")
        return True
    except Exception as e:
        print(f"Error saving language: {e}")
        return False

def get_current_language():
    try:
        os.makedirs('app', exist_ok=True)
        
        if not os.path.exists('app/current_language.txt'):
            with open('app/current_language.txt', 'w') as f:
                f.write('en')
        
        with open('app/current_language.txt', 'r') as f:
            lang = f.read().strip() or 'en'
            print(f"Current language read from file: {lang}")
            return lang
    except Exception as e:
        print(f"Error reading language: {e}")
        return 'en'

def get_telegram_message(message_type, lang=None):
    """Получение сообщения для Telegram на нужном языке"""
    if lang is None:
        lang = get_current_language()
    return TELEGRAM_MESSAGES.get(lang, TELEGRAM_MESSAGES['en']).get(message_type)