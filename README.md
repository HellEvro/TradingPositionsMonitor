# Trading Positions Monitor

Система для мониторинга и управления позициями на криптовалютных биржах с веб-интерфейсом и Telegram-уведомлениями.

## Возможности

- Мониторинг позиций в реальном времени
- Поддержка нескольких бирж (Bybit, Binance, OKX)
- Hedge режим для всех бирж
- Закрытие позиций через веб-интерфейс
- Telegram-уведомления о важных событиях
- Отслеживание PnL и ROI
- Графики и статистика
- Темная и светлая темы интерфейса

## Быстрый старт

1. Клонируйте репозиторий и установите зависимости:
```bash
git clone https://github.com/HellEvro/TradingPositionsMonitor
cd TradingPositionsMonitor
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

2. Настройте конфигурацию:
```bash
cp app/config.example.py app/config.py
cp app/keys.example.py app/keys.py
```

3. Отредактируйте `app/keys.py`:
- Добавьте API ключи бирж
- Настройте Telegram (опционально)

4. Запустите приложение:
```bash
python app.py
```

5. Откройте в браузере: http://localhost:5000

## Подробная документация

Подробные инструкции по установке и настройке смотрите в [installation_guide.txt](installation_guide.txt)

## Требования

- Python 3.9 - 3.11 (рекомендуется Python 3.10)
- Современный веб-браузер
- API ключи поддерживаемых бирж

## Безопасность

- Используйте только API ключи с необходимыми разрешениями
- Не публикуйте файл keys.py
- Рекомендуется использовать SSL при внешнем доступе

## Поддержка

При возникновении проблем:
1. Проверьте логи в директории `logs/`
2. Убедитесь в правильности API ключей
3. Создайте issue в репозитории