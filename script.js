// Используем URL из глобального объекта конфигурации
const API_URL = AppConfig.API_URL;

// --- Глобальное состояние приложения ---
let currentUsername = localStorage.getItem('habit_tracker_user') || '';
let allHabits = []; // Массив, который всегда хранит все привычки с сервера
let currentFilter = 'all';

// --- DOM элементы ---
const userSection = document.getElementById('user-section');
const authCard = document.getElementById('auth-card');
const trackerSection = document.getElementById('tracker-section');
const authForm = document.getElementById('auth-form');
const usernameInput = document.getElementById('username-input');
const addHabitForm = document.getElementById('add-habit-form');
const habitTextInput = document.getElementById('habit-text-input');
const habitsList = document.getElementById('habits-list');
const loadingIndicator = document.getElementById('loading-indicator');
const notificationContainer = document.getElementById('notification-container');
const filterControls = document.querySelector('.filter-controls');
const emptyState = document.getElementById('empty-state');


/**
 * Инициализация приложения при загрузке страницы.
 */
document.addEventListener('DOMContentLoaded', () => {
    setupUI();
    initEventListeners();
    initSmoothPlaceholder(); // Плавная бегущая строка для подсказки
});

/**
 * Отрисовка интерфейса в зависимости от наличия авторизации.
 */
function setupUI() {
    if (currentUsername) {
        authCard.classList.add('hidden');
        trackerSection.classList.remove('hidden');
        
        userSection.innerHTML = `
            <span class="user-name">Привет, ${escapeHTML(currentUsername)}!</span>
            <button id="logout-btn" class="btn-text">Выйти</button>
        `;
        
        document.getElementById('logout-btn').addEventListener('click', logout);
        
        loadHabits();
    } else {
        trackerSection.classList.add('hidden');
        authCard.classList.remove('hidden');
        userSection.innerHTML = '';
    }
}

/**
 * Установка всех слушателей событий.
 */
function initEventListeners() {
    authForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = usernameInput.value.trim();
        if (name) login(name);
    });

    addHabitForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = habitTextInput.value.trim();
        if (text) {
            const addButton = e.submitter;
            addButton.disabled = true;
            await handleAddHabit(text);
            addButton.disabled = false;
        }
    });

    habitsList.addEventListener('click', async (e) => {
        const target = e.target;
        const habitItem = target.closest('.habit-item');
        if (!habitItem) return;

        const habitId = Number(habitItem.dataset.id);

        if (target.classList.contains('habit-checkbox')) {
            const isCompleted = target.checked;
            await handleToggleHabit(habitId, isCompleted);
        }

        if (target.classList.contains('delete-btn')) {
            target.disabled = true;
            await handleDeleteHabit(habitId);
        }
    });

    filterControls.addEventListener('click', (e) => {
        const target = e.target.closest('.filter-btn');
        if (target) {
            currentFilter = target.dataset.filter;
            
            document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
            target.classList.add('active');
            
            renderHabits();
        }
    });
}

/**
 * Сохранение имени пользователя и обновление UI.
 */
function login(name) {
    currentUsername = name;
    localStorage.setItem('habit_tracker_user', name);
    usernameInput.value = '';
    setupUI();
}

/**
 * Сброс сессии пользователя.
 */
function logout() {
    currentUsername = '';
    localStorage.removeItem('habit_tracker_user');
    allHabits = [];
    renderHabits();
    setupUI();
}

// ==========================================
//   API ВЗАИМОДЕЙСТВИЕ (Запросы к серверу)
// ==========================================

async function getHabits() {
    const url = `${API_URL}?username=${encodeURIComponent(currentUsername)}`;
    const response = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!response.ok) throw new Error(`Ошибка загрузки: ${response.statusText}`);
    return await response.json();
}

async function addHabit(text) {
    const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ username: currentUsername, text: text })
    });
    if (!response.ok) throw new Error(`Ошибка добавления: ${response.statusText}`);
    return await response.json();
}

async function toggleHabit(id, isCompleted) {
    const url = `${API_URL}/${id}`;
    const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ username: currentUsername, isCompleted: isCompleted })
    });
    if (!response.ok) throw new Error(`Ошибка обновления: ${response.statusText}`);
    return await response.json();
}

async function deleteHabit(id) {
    const url = `${API_URL}/${id}?username=${encodeURIComponent(currentUsername)}`;
    const response = await fetch(url, { method: 'DELETE', headers: { 'Accept': 'application/json' } });
    if (!response.ok) throw new Error(`Ошибка удаления: ${response.statusText}`);
}

// ==========================================
//   ОБРАБОТЧИКИ СОБЫТИЙ И ОБНОВЛЕНИЕ DOM
// ==========================================

async function loadHabits() {
    toggleLoader(true);
    try {
        allHabits = await getHabits();
        renderHabits();
    } catch (error) {
        console.error('Ошибка при загрузке привычек:', error);
        showNotification('Не удалось загрузить список привычек.', 'error');
    } finally {
        toggleLoader(false);
    }
}

async function handleAddHabit(text) {
    try {
        const newHabit = await addHabit(text);
        allHabits.push(newHabit);
        habitTextInput.value = '';
        renderHabits();
        showNotification('Привычка успешно добавлена!', 'success');
        
        // Обновляем плейсхолдер
        const inputEvent = new Event('input');
        habitTextInput.dispatchEvent(inputEvent);
    } catch (error) {
        console.error('Ошибка добавления привычки:', error);
        showNotification('Не удалось добавить привычку.', 'error');
    }
}

async function handleToggleHabit(id, isCompleted) {
    const habitIndex = allHabits.findIndex(h => h.id === id);
    if (habitIndex > -1) {
        allHabits[habitIndex].isCompleted = isCompleted;
        updateHabitDOMState(id, isCompleted);
        
        // Перерисовываем список, если фильтр не 'all', чтобы скрыть/показать элемент
        if (currentFilter !== 'all') {
            setTimeout(renderHabits, 300); // Даем время на анимацию
        }
    }

    try {
        await toggleHabit(id, isCompleted);
    } catch (error) {
        console.error('Ошибка изменения статуса:', error);
        if (habitIndex > -1) {
            allHabits[habitIndex].isCompleted = !isCompleted;
            updateHabitDOMState(id, !isCompleted);
        }
        showNotification('Ошибка обновления статуса.', 'error');
    }
}

async function handleDeleteHabit(id) {
    const habitElement = habitsList.querySelector(`.habit-item[data-id="${id}"]`);
    
    if (habitElement) {
        habitElement.classList.add('fade-out');
        // Ждем завершения анимации перед удалением из DOM и массива
        setTimeout(async () => {
            try {
                await deleteHabit(id);
                allHabits = allHabits.filter(h => h.id !== id);
                renderHabits();
                showNotification('Привычка удалена.', 'success');
            } catch (error) {
                console.error('Ошибка удаления привычки:', error);
                showNotification('Не удалось удалить привычку.', 'error');
                habitElement.classList.remove('fade-out'); // Возвращаем видимость при ошибке
                habitElement.querySelector('.delete-btn').disabled = false;
            }
        }, 300);
    }
}

// ==========================================
//   ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ==========================================

/**
 * Фильтрует и отображает привычки в соответствии с текущим фильтром.
 */
function renderHabits() {
    let filteredHabits = allHabits;
    if (currentFilter === 'active') {
        filteredHabits = allHabits.filter(h => !h.isCompleted);
    } else if (currentFilter === 'completed') {
        filteredHabits = allHabits.filter(h => h.isCompleted);
    }

    habitsList.innerHTML = '';
    
    if (filteredHabits.length === 0) {
        emptyState.classList.remove('hidden');
    } else {
        emptyState.classList.add('hidden');
        filteredHabits.forEach(habit => {
            const li = createHabitElement(habit);
            habitsList.appendChild(li);
        });
    }
}

/**
 * Создает DOM-элемент для одной привычки.
 */
function createHabitElement(habit) {
    const isCompleted = !!habit.isCompleted;
    const li = document.createElement('li');
    li.className = `habit-item ${isCompleted ? 'completed' : ''} fade-in`;
    li.dataset.id = habit.id;

    li.innerHTML = `
        <div class="habit-item-left">
            <input type="checkbox" class="habit-checkbox" ${isCompleted ? 'checked' : ''}>
            <span class="habit-text">${escapeHTML(habit.text)}</span>
        </div>
        <button class="btn btn-danger delete-btn">Удалить</button>
    `;
    return li;
}

/**
 * Быстро обновляет состояние DOM-элемента привычки.
 */
function updateHabitDOMState(id, isCompleted) {
    const item = habitsList.querySelector(`.habit-item[data-id="${id}"]`);
    if (item) {
        item.classList.toggle('completed', isCompleted);
    }
}

/**
 * Показывает или скрывает индикатор загрузки.
 */
function toggleLoader(show) {
    loadingIndicator.classList.toggle('hidden', !show);
    habitsList.classList.toggle('hidden', show);
}

/**
 * Показывает всплывающее уведомление.
 * @param {string} message - Сообщение для пользователя.
 * @param {string} type - 'success', 'error', 'warning' или 'info'.
 */
function showNotification(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    // Подбираем иконку под соответствующий тип
    let icon = '';
    if (type === 'success') icon = '✓';
    else if (type === 'error') icon = '✕';
    else if (type === 'warning') icon = '⚠';
    else if (type === 'info') icon = 'ℹ';

    // Рендерим внутреннюю структуру
    toast.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <span class="toast-message">${escapeHTML(message)}</span>
    `;

    notificationContainer.appendChild(toast);

    // Запускаем анимацию появления
    setTimeout(() => toast.classList.add('show'), 10);

    // Запускаем скрытие через 3.5 секунды
    setTimeout(() => {
        toast.classList.remove('show');
        toast.classList.add('hide'); // Инициирует улет вправо и схлопывание высоты

        // Полностью удаляем элемент из DOM только после окончания анимации
        toast.addEventListener('transitionend', function handler(e) {
            // Реагируем на завершение ключевого свойства анимации схлопывания
            if (e.propertyName === 'max-height') {
                toast.remove();
                toast.removeEventListener('transitionend', handler);
            }
        });
    }, 3500);
}


/**
 * Безопасное экранирование строк от XSS уязвимостей.
 */
function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;',
            "'": '&#39;', '"': '&quot;'
        }[tag] || tag)
    );
}

/**
 * Создает плавную, аппаратную бегущую строку для плейсхолдера
 */
function initSmoothPlaceholder() {
    const input = document.getElementById('habit-text-input');
    if (!input) return;

    const originalPlaceholder = input.placeholder;
    input.removeAttribute('placeholder'); // Отключаем стандартный плейсхолдер во избежание наложения

    // Создаем обертку
    const wrapper = document.createElement('div');
    wrapper.className = 'smooth-placeholder-wrapper';
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    // Создаем контейнер плейсхолдера
    const container = document.createElement('div');
    container.className = 'smooth-placeholder-container';

    // Создаем трек для сдвига
    const track = document.createElement('div');
    track.className = 'smooth-placeholder-track';

    // Создаем текстовые ноды (оригинал и копия для бесшовности)
    const textNode = document.createElement('span');
    textNode.className = 'smooth-placeholder-text';
    textNode.textContent = originalPlaceholder;

    const duplicateNode = document.createElement('span');
    duplicateNode.className = 'smooth-placeholder-text';
    duplicateNode.textContent = originalPlaceholder;

    track.appendChild(textNode);
    track.appendChild(duplicateNode);
    container.appendChild(track);
    wrapper.appendChild(container);

    // Функция переключения видимости подсказки
    const togglePlaceholder = () => {
        if (input.value.length > 0 || document.activeElement === input) {
            container.classList.add('hidden');
        } else {
            container.classList.remove('hidden');
        }
    };

    // Слушатели событий
    input.addEventListener('input', togglePlaceholder);
    input.addEventListener('focus', togglePlaceholder);
    input.addEventListener('blur', togglePlaceholder);

    // Первичная инициализация состояния
    togglePlaceholder();
}