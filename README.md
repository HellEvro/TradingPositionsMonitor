# InfoBot - Система мониторинга и управления криптовалютными позициями

Система для мониторинга и управления позициями на криптовалютных биржах (Bybit, Binance, OKX) с веб-интерфейсом и Telegram-уведомлениями.

## Возможности

- Мониторинг позиций в реальном времени
- Поддержка нескольких бирж (Bybit, Binance, OKX)
- Hedge режим для всех бирж
- Закрытие позиций через веб-интерфейс
- Telegram-уведомления о важных событиях
- Отслеживание PnL и ROI
- Автоматическое определение режима маржи
- Настраиваемые лимитные ордера с offset
- Темная и светлая темы интерфейса
- Графики и статистика

## Требования

- Python 3.8+
- pip (менеджер пакетов Python)
- Доступ к API бирж (API ключи)

## Установка

1. Клонируйте репозиторий:
```bash
git clone [url репозитория]
cd InfoBot
```

2. Создайте виртуальное окружение:
```bash
python -m venv venv
```

3. Активируйте виртуальное окружение:
- Windows:
```bash
venv\Scripts\activate
```
- Linux/Mac:
```bash
source venv/bin/activate
```

4. Установите зависимости:
```bash
pip install -r requirements.txt
```

## Настройка

1. Скопируйте файл конфигурации:
```bash
cp app/config.example.py app/config.py
```

2. Отредактируйте `app/config.py`:
- Добавьте API ключи бирж
- Настройте параметры подключения
- Укажите настройки Telegram (опционально)

### Настройки бирж

```python
EXCHANGES = {
    'BYBIT': {
        'enabled': True,
        'api_key': "ваш_api_key",
        'api_secret': "ваш_api_secret",
        'test_server': True,  # True для тестового сервера
        'position_mode': 'Hedge',
        'limit_order_offset': 0.01  # Отступ для лимитных ордеров (1%)
    },
    'BINANCE': {
        'enabled': True,
        'api_key': "ваш_api_key",
        'api_secret': "ваш_api_secret",
        'position_mode': 'Hedge',
        'limit_order_offset': 0.02  # Отступ для лимитных ордеров (2%)
    },
    'OKX': {
        'enabled': True,
        'api_key': "ваш_api_key",
        'api_secret': "ваш_api_secret",
        'passphrase': "ваш_пароль",
        'position_mode': 'Hedge',
        'limit_order_offset': 0.015  # Отступ для лимитных ордеров (1.5%)
    }
}
```

### Настройка Telegram

1. Получите токен бота у @BotFather
2. Узнайте ваш Chat ID
3. Обновите настройки в config.py:

```python
TELEGRAM_BOT_TOKEN = "ваш_токен_бота"
TELEGRAM_CHAT_ID = "ваш_chat_id"
TELEGRAM_NOTIFICATIONS_ENABLED = True
```

## Запуск

1. Активируйте виртуальное окружение (если еще не активировано)
2. Запустите сервер:
```bash
python app.py
```

3. Откройте в браузере:
```
http://localhost:5000
```

## Тестирование

Для проверки подключения к биржам:
```bash
python test_exchanges.py
```

## Настройка уведомлений

В `config.py` можно настроить различные типы уведомлений:

```python
TELEGRAM_NOTIFY = {
    'ERRORS': True,              # Ошибки
    'RAPID_GROWTH': True,        # Быстрый рост позиций
    'HIGH_ROI': True,            # Высокий ROI
    'HIGH_LOSS': True,           # Большие убытки
    'HIGH_PNL': True,            # Высокий PnL
    'DAILY_REPORT': True,        # Ежедневный отчет
    'STATISTICS': True,          # Статистика
}
```

## Безопасность

- Храните API ключи в безопасном месте
- Используйте только необходимые разрешения для API ключей
- Не публикуйте конфигурационные файлы с реальными ключами
- Рекомендуется использовать SSL при доступе через интернет

## Поддержка

При возникновении проблем:
1. Проверьте логи в директории `logs`
2. Убедитесь в правильности API ключей
3. Проверьте подключение к интернету
4. Убедитесь, что биржи доступны