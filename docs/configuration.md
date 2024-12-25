# Руководство по настройке InfoBot

## Содержание
1. [Основные настройки](#основные-настройки)
2. [Настройка бирж](#настройка-бирж)
3. [Настройка уведомлений](#настройка-уведомлений)
4. [Расширенные настройки](#расширенные-настройки)

## Основные настройки

### Параметры сервера
```python
SERVER_HOST = '0.0.0.0'  # Адрес сервера
SERVER_PORT = 5000       # Порт
DEBUG_MODE = False       # Режим отладки
```

### Настройки логирования
```python
LOG_LEVEL = 'INFO'      # Уровень логирования (DEBUG/INFO/WARNING/ERROR)
LOG_FORMAT = '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
LOG_DIR = 'logs'        # Директория для лог-файлов
```

## Настройка бирж

### Общие параметры
```python
EXCHANGES = {
    'BYBIT': {
        'enabled': True,
        'position_mode': 'Hedge',    # Hedge/OneWay
        'leverage_mode': 'Cross',    # Cross/Isolated
        'update_interval': 5,        # Интервал обновления в секундах
        'limit_order_offset': 0.01   # Отступ для лимитных ордеров (1%)
    },
    'BINANCE': {
        'enabled': True,
        'position_mode': 'Hedge',
        'leverage_mode': 'Cross',
        'update_interval': 5,
        'limit_order_offset': 0.02
    },
    'OKX': {
        'enabled': True,
        'position_mode': 'Hedge',
        'leverage_mode': 'Cross',
        'update_interval': 5,
        'limit_order_offset': 0.015
    }
}
```

### Настройки торговых пар
```python
TRADING_PAIRS = {
    'BYBIT': ['BTC/USDT', 'ETH/USDT'],
    'BINANCE': ['BTC/USDT', 'ETH/USDT'],
    'OKX': ['BTC/USDT', 'ETH/USDT']
}
```

## Настройка уведомлений

### Telegram настройки
```python
TELEGRAM = {
    'enabled': True,
    'bot_token': 'ваш_токен_бота',
    'chat_id': 'ваш_chat_id',
    'notification_level': 'IMPORTANT'  # ALL/IMPORTANT/CRITICAL
}
```

### Типы уведомлений
```python
NOTIFICATIONS = {
    'POSITION_OPENED': True,    # Открытие позиции
    'POSITION_CLOSED': True,    # Закрытие позиции
    'HIGH_PNL': True,          # Высокий PnL
    'HIGH_LOSS': True,         # Большой убыток
    'ERROR': True,             # Ошибки системы
    'DAILY_REPORT': True       # Ежедневный отчет
}
```

### Пороговые значения
```python
THRESHOLDS = {
    'HIGH_PNL': 1000,         # USD
    'HIGH_LOSS': -500,        # USD
    'RAPID_CHANGE': 5,        # % за 5 минут
    'VOLUME_ALERT': 100000    # Объем в USD
}
```

## Расширенные настройки

### Настройки веб-интерфейса
```python
WEB_UI = {
    'refresh_rate': 5,        # Частота обновления в секундах
    'chart_periods': [        # Периоды для графиков
        '1m', '5m', '15m', '1h', '4h', '1d'
    ],
    'default_theme': 'dark',  # dark/light
    'max_positions': 50       # Максимум позиций в таблице
}
```

### Настройки производительности
```python
PERFORMANCE = {
    'max_workers': 4,         # Количество потоков
    'cache_timeout': 300,     # Время жизни кэша (сек)
    'batch_size': 100,        # Размер пакета данных
    'retry_attempts': 3       # Попытки переподключения
}
```

### Настройки безопасности
```python
SECURITY = {
    'ip_whitelist': [],       # Разрешенные IP
    'max_requests': 100,      # Максимум запросов в минуту
    'session_timeout': 3600,  # Время сессии (сек)
    'ssl_verify': True        # Проверка SSL сертификатов
}
``` 