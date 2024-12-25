# Exchange API keys
EXCHANGES = {
    'BYBIT': {
        'enabled': True,
        'api_key': "your_bybit_api_key",
        'api_secret': "your_bybit_api_secret",
        'test_server': False,
        'position_mode': 'Hedge',
        'limit_order_offset': 0.015
    },
    'BINANCE': {
        'enabled': False,  # Disabled by default
        'api_key': "your_binance_api_key",
        'api_secret': "your_binance_api_secret",
        'position_mode': 'Hedge',
        'limit_order_offset': 0.015
    },
    'OKX': {
        'enabled': False,  # Disabled by default
        'api_key': "your_okx_api_key",
        'api_secret': "your_okx_api_secret",
        'passphrase': "your_okx_passphrase",
        'position_mode': 'Hedge',
        'limit_order_offset': 0.015
    }
}

# Telegram settings
TELEGRAM_BOT_TOKEN = "your_telegram_bot_token"  # Get from @BotFather
TELEGRAM_CHAT_ID = "your_telegram_chat_id"      # Your chat ID for notifications 