// Добавим флаг для блокировки обновления меню
window.isLanguageChanging = false;

async function toggleLanguage() {
    try {
        console.log('toggleLanguage called');
        
        // Сохраняем текущий текст меню
        const savedMenuText = localStorage.getItem('currentMenuText');
        
        // Меняем язык
        const currentLang = document.documentElement.lang;
        const newLang = currentLang === 'ru' ? 'en' : 'ru';
        document.documentElement.lang = newLang;
        
        // Сохраняем новый язык на сервере
        await fetch('/api/language', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ language: newLang })
        });
        
        // Обновляем интерфейс
        updateInterface();
        
        // Восстанавливаем текст меню
        if (savedMenuText) {
            const currentPage = document.getElementById('currentPage');
            if (currentPage) {
                currentPage.textContent = savedMenuText;
            }
        }
        
    } catch (error) {
        console.error('Error toggling language:', error);
    }
}

function updateInterface() {
    // Обновляем все элементы с атрибутом data-translate, кроме currentPage
    document.querySelectorAll('[data-translate]').forEach(element => {
        // Пропускаем элемент с id="currentPage"
        if (element.id === 'currentPage') return;
        
        const key = element.getAttribute('data-translate');
        element.textContent = languageUtils.translate(key);
    });
} 