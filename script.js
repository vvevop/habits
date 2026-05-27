// Используем URL из глобального объекта конфигурации
const API_URL = AppConfig.API_URL;

// Локальное состояние приложения
let currentUsername = localStorage.getItem('habit_tracker_user') || '';
let habits = [];

// DOM элементы
const userSection = document.getElementById('user-section');
const authCard = document.getElementById('auth-card');
const trackerSection = document.getElementById('tracker-section');
const authForm = document.getElementById('auth-form');
const usernameInput = document.getElementById('username-input');
const addHabitForm = document.getElementById('add-habit-form');
const habitTextInput = document.getElementById('habit-text-input');
const habitsList = document.getElementById('habits-list');
const loadingIndicator = document.getElementById('loading-indicator');

/**
 * Инициализация приложения при загрузке страницы.
 */
document.addEventListener('DOMContentLoaded', () => {
    setupUI();
    initEventListeners();
});

/**
 * Отрисовка интерфейса в зависимости от наличия авторизации.
 */
function setupUI() {
    if (currentUsername) {
        // Если пользователь авторизован
        authCard.classList.add('hidden');
        trackerSection.classList.remove('hidden');
        
        userSection.innerHTML = `
            <span class="user-name">Привет, ${escapeHTML(currentUsername)}!</span>
            <button id="logout-btn" class="btn-text">Выйти</button>
        `;
        
        // Слушатель для кнопки Выхода
        document.getElementById('logout-btn').addEventListener('click', logout);
        
        // Загрузка привычек пользователя
        loadHabits();
    } else {
        // Если пользователя нет в localStorage
        trackerSection.classList.add('hidden');
        authCard.classList.remove('hidden');
        userSection.innerHTML = '';
    }
}

/**
 * Установка слушателей событий (Минимум 3 обработчика).
 */
function initEventListeners() {
    // 1. Форма входа/регистрации имени пользователя
    authForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = usernameInput.value.trim();
        if (name) {
            login(name);
        }
    });

    // 2. Форма добавления привычки
    addHabitForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = habitTextInput.value.trim();
        if (text) {
            habitTextInput.disabled = true;
            await handleAddHabit(text);
            habitTextInput.disabled = false;
        }
    });

    // 3. Делегирование кликов на список привычек (чекбокс и удаление)
    habitsList.addEventListener('click', async (e) => {
        const target = e.target;
        const habitItem = target.closest('.habit-item');
        if (!habitItem) return;

        const habitId = habitItem.dataset.id;

        // Клик по чекбоксу
        if (target.classList.contains('habit-checkbox')) {
            const isCompleted = target.checked;
            await handleToggleHabit(habitId, isCompleted);
        }

        // Клик по кнопке удаления
        if (target.classList.contains('delete-btn')) {
            target.disabled = true;
            await handleDeleteHabit(habitId);
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
    habits = [];
    renderHabits();
    setupUI();
}

/* ==========================================
   API ВЗАИМОДЕЙСТВИЕ (Запросы к серверу)
   ========================================== */

/**
 * GET: Загрузка списка привычек для конкретного пользователя.
 */
async function getHabits() {
    const url = `${API_URL}?username=${encodeURIComponent(currentUsername)}`;
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'Accept': 'application/json'
        }
    });

    if (!response.ok) {
        throw new Error(`Ошибка загрузки: ${response.statusText}`);
    }
    return await response.json();
}

/**
 * POST: Добавление новой привычки.
 */
async function addHabit(text) {
    const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify({
            username: currentUsername,
            text: text
        })
    });

    if (!response.ok) {
        throw new Error(`Ошибка добавления: ${response.statusText}`);
    }
    return await response.json();
}

/**
 * PUT: Обновление статуса выполнения привычки.
 */
async function toggleHabit(id, isCompleted) {
    const url = `${API_URL}/${id}`; // ID передается в пути
    const response = await fetch(url, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify({
            username: currentUsername,
            isCompleted: isCompleted
        })
    });

    if (!response.ok) {
        throw new Error(`Ошибка обновления статуса: ${response.statusText}`);
    }
    return await response.json();
}

/**
 * DELETE: Удаление привычки.
 */
async function deleteHabit(id) {
    // ID передается в пути, а username как query-параметр
    const url = `${API_URL}/${id}?username=${encodeURIComponent(currentUsername)}`;
    const response = await fetch(url, {
        method: 'DELETE',
        headers: {
            'Accept': 'application/json'
        }
    });

    if (!response.ok) {
        // Сервер может вернуть 404 если привычка не найдена, это тоже ошибка
        throw new Error(`Ошибка удаления: ${response.statusText}`);
    }
    // DELETE запросы с кодом 204 не возвращают тело, поэтому .json() вызывать не нужно
}

/* ==========================================
   ОБРАБОТЧИКИ СОБЫТИЙ И ОБНОВЛЕНИЕ DOM
   ========================================== */

/**
 * Первоначальное получение данных и отображение лоадера.
 */
async function loadHabits() {
    toggleLoader(true);
    try {
        habits = await getHabits();
        renderHabits();
    } catch (error) {
        console.error('Ошибка при загрузке привычек:', error);
        alert('Не удалось загрузить список привычек. Пожалуйста, попробуйте позже.');
    } finally {
        toggleLoader(false);
    }
}

/**
 * Обработка добавления новой привычки.
 */
async function handleAddHabit(text) {
    try {
        const newHabit = await addHabit(text);
        if (newHabit && newHabit.id) {
            habits.push(newHabit);
        } else {
            // Если что-то пошло не так, перезапрашиваем полный список для консистентности
            habits = await getHabits();
        }
        habitTextInput.value = '';
        renderHabits();
    } catch (error) {
        console.error('Ошибка добавления привычки:', error);
        alert('Не удалось добавить привычку. Повторите попытку.');
    }
}

/**
 * Обработка переключения статуса чекбокса.
 */
async function handleToggleHabit(id, isCompleted) {
    // Оптимистичное обновление в UI для отзывчивости интерфейса
    const habitIndex = habits.findIndex(h => h.id == id);
    if (habitIndex > -1) {
        habits[habitIndex].isCompleted = isCompleted;
        updateHabitDOMState(id, isCompleted);
    }

    try {
        // Отправляем запрос на сервер
        await toggleHabit(id, isCompleted);
    } catch (error) {
        console.error('Ошибка изменения статуса:', error);
        // Откат состояния в UI при ошибке сервера
        if (habitIndex > -1) {
            habits[habitIndex].isCompleted = !isCompleted;
            updateHabitDOMState(id, !isCompleted);
        }
        alert('Не удалось обновить статус задачи на сервере.');
    }
}

/**
 * Обработка удаления привычки.
 */
async function handleDeleteHabit(id) {
    try {
        await deleteHabit(id);
        // Удаляем элемент из локального массива и обновляем DOM без перезагрузки
        habits = habits.filter(h => h.id != id);
        renderHabits();
    } catch (error) {
        console.error('Ошибка удаления привычки:', error);
        alert('Не удалось удалить привычку.');
        // Перерисовываем список, чтобы разблокировать кнопку удаления (если она осталась)
        renderHabits();
    }
}

/* ==========================================
   ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
   ========================================== */

/**
 * Отрисовка списка привычек на основе локального массива.
 */
function renderHabits() {
    habitsList.innerHTML = '';
    
    if (habits.length === 0) {
        habitsList.innerHTML = '<li class="loading-indicator">Список привычек пуст. Добавьте первую!</li>';
        return;
    }

    habits.forEach(habit => {
        const isCompleted = !!habit.isCompleted;
        const li = document.createElement('li');
        li.className = `habit-item ${isCompleted ? 'completed' : ''}`;
        li.dataset.id = habit.id;

        li.innerHTML = `
            <div class="habit-item-left">
                <input type="checkbox" class="habit-checkbox" ${isCompleted ? 'checked' : ''}>
                <span class="habit-text">${escapeHTML(habit.text)}</span>
            </div>
            <button class="btn btn-danger delete-btn">Удалить</button>
        `;
        habitsList.appendChild(li);
    });
}

/**
 * Быстрое обновление DOM без полной перерисовки при клике на чекбокс.
 */
function updateHabitDOMState(id, isCompleted) {
    const item = habitsList.querySelector(`.habit-item[data-id="${id}"]`);
    if (item) {
        const checkbox = item.querySelector('.habit-checkbox');
        checkbox.checked = isCompleted;
        if (isCompleted) {
            item.classList.add('completed');
        } else {
            item.classList.remove('completed');
        }
    }
}

/**
 * Управление отображением лоадера.
 */
function toggleLoader(show) {
    if (show) {
        loadingIndicator.classList.remove('hidden');
    } else {
        loadingIndicator.classList.add('hidden');
    }
}

/**
 * Безопасное экранирование строк от XSS уязвимостей.
 */
function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}