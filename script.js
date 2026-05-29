// Используем URL из глобального объекта конфигурации
const API_BASE_URL = AppConfig.API_URL.replace('/api/habits', ''); // Получаем базовый URL

// --- Глобальное состояние приложения ---
let authToken = localStorage.getItem('habit_tracker_token') || '';
let currentUsername = localStorage.getItem('habit_tracker_user') || '';
let allHabits = []; // Массив всех привычек с сервера
let currentFilter = 'all';
let currentDate = new Date(); // Текущая отображаемая дата

// --- DOM элементы ---
const userSection = document.getElementById('user-section');
const authCard = document.getElementById('auth-card');
const trackerSection = document.getElementById('tracker-section');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const resetForm = document.getElementById('reset-form');
const addHabitForm = document.getElementById('add-habit-form');
const habitTextInput = document.getElementById('habit-text-input');
const habitsList = document.getElementById('habits-list');
const loadingIndicator = document.getElementById('loading-indicator');
const notificationContainer = document.getElementById('notification-container');
const filterControls = document.querySelector('.filter-controls');
const emptyState = document.getElementById('empty-state');
const prevDayBtn = document.getElementById('prev-day-btn');
const nextDayBtn = document.getElementById('next-day-btn');
const todayBtn = document.getElementById('today-btn');
const currentDateDisplay = document.getElementById('current-date-display');
const calendarContainer = document.getElementById('calendar-container');

/**
 * Инициализация приложения при загрузке страницы.
 */
document.addEventListener('DOMContentLoaded', () => {
    // Внедряем SVG иконку
    const toggleBtn = document.getElementById('toggle-add-settings-btn');
    if (toggleBtn) {
        const cogSpan = toggleBtn.querySelector('#cog-container');
        if (cogSpan) cogSpan.innerHTML = getCogSVG();
    }
    
    setupUI();
    initEventListeners();
});

function getCogSVG() {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="cog-icon"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`;
}

/**
 * Отрисовка интерфейса в зависимости от наличия токена авторизации.
 */
function setupUI() {
    if (authToken) {
        authCard.classList.add('hidden');
        trackerSection.classList.remove('hidden');
        
        userSection.innerHTML = `
            <span class="user-name">Привет, ${escapeHTML(currentUsername)}!</span>
            <button id="logout-btn" class="btn-text">Выйти</button>
        `;
        
        document.getElementById('logout-btn').addEventListener('click', logoutUser);
        
        updateDateDisplay();
        loadHabits();
    } else {
        trackerSection.classList.add('hidden');
        authCard.classList.remove('hidden');
        userSection.innerHTML = '';
        switchAuthTab('login');
    }
}

/**
 * Установка всех слушателей событий.
 */
function initEventListeners() {
    // Переключение вкладок Вход/Регистрация
    document.getElementById('login-tab-btn').addEventListener('click', () => switchAuthTab('login'));
    document.getElementById('register-tab-btn').addEventListener('click', () => switchAuthTab('register'));
    
    // Ссылки сброса пароля
    document.getElementById('goto-reset-btn').addEventListener('click', () => switchAuthTab('reset'));
    document.getElementById('back-to-login-btn').addEventListener('click', () => switchAuthTab('login'));

    loginForm.addEventListener('submit', handleLogin);
    registerForm.addEventListener('submit', handleRegister);
    resetForm.addEventListener('submit', handleResetPassword);

    addHabitForm.addEventListener('submit', handleAddHabit);
    
    habitsList.addEventListener('click', handleHabitListClick);
    filterControls.addEventListener('click', handleFilterClick);
    prevDayBtn.addEventListener('click', () => changeDay(-1));
    nextDayBtn.addEventListener('click', () => changeDay(1));
    todayBtn.addEventListener('click', () => {
        currentDate = new Date();
        updateDateDisplay();
        renderCalendar();
        renderHabits();
    });

    const toggleAddSettingsBtn = document.getElementById('toggle-add-settings-btn');
    const addHabitSettingsPanel = document.getElementById('add-habit-settings-panel');
    if (toggleAddSettingsBtn && addHabitSettingsPanel) {
        toggleAddSettingsBtn.addEventListener('click', () => {
            addHabitSettingsPanel.classList.toggle('collapsed');
        });
    }
}

function switchAuthTab(tabName) {
    const loginBtn = document.getElementById('login-tab-btn');
    const registerBtn = document.getElementById('register-tab-btn');
    const loginF = document.getElementById('login-form');
    const registerF = document.getElementById('register-form');
    const resetF = document.getElementById('reset-form');

    // Сброс полей при переключении
    loginF.reset();
    registerF.reset();
    resetF.reset();

    if (tabName === 'login') {
        loginBtn.classList.add('active');
        registerBtn.classList.remove('active');
        loginF.classList.remove('hidden');
        registerF.classList.add('hidden');
        resetF.classList.add('hidden');
    } else if (tabName === 'register') {
        loginBtn.classList.remove('active');
        registerBtn.classList.add('active');
        loginF.classList.add('hidden');
        registerF.classList.remove('hidden');
        resetF.classList.add('hidden');
    } else if (tabName === 'reset') {
        loginBtn.classList.remove('active');
        registerBtn.classList.remove('active');
        loginF.classList.add('hidden');
        registerF.classList.add('hidden');
        resetF.classList.remove('hidden');
    }
}

// ==========================================
//   ЛОГИКА АУТЕНТИФИКАЦИИ
// ==========================================

async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value.trim();
    if (!username || !password) {
        showNotification('Введите имя пользователя и пароль', 'error');
        return;
    }
    await loginUser(username, password);
}

async function handleRegister(e) {
    e.preventDefault();
    const username = document.getElementById('register-username').value.trim();
    const password = document.getElementById('register-password').value.trim();
    const secretWord = document.getElementById('register-secret').value.trim();
    if (!username || !password || !secretWord) {
        showNotification('Пожалуйста, заполните все поля регистрации', 'error');
        return;
    }
    await registerUser(username, password, secretWord);
}

async function handleResetPassword(e) {
    e.preventDefault();
    const username = document.getElementById('reset-username').value.trim();
    const secretWord = document.getElementById('reset-secret').value.trim();
    const newPassword = document.getElementById('reset-password').value.trim();

    if (!username || !secretWord || !newPassword) {
        showNotification('Пожалуйста, заполните все поля для сброса пароля', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: username,
                secret_word: secretWord,
                new_password: newPassword
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Не удалось сбросить пароль');
        }

        showNotification('Пароль успешно сброшен! Теперь вы можете войти.', 'success');
        switchAuthTab('login');
        document.getElementById('login-username').value = username;
        document.getElementById('login-password').focus();
    } catch (error) {
        console.error('Ошибка восстановления пароля:', error);
        showNotification(error.message, 'error');
    }
}

async function loginUser(username, password) {
    try {
        const formData = new FormData();
        formData.append('username', username);
        formData.append('password', password);

        const response = await fetch(`${API_BASE_URL}/token`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Неверные данные для входа');
        }

        const data = await response.json();
        authToken = data.access_token;
        currentUsername = username;
        localStorage.setItem('habit_tracker_token', authToken);
        localStorage.setItem('habit_tracker_user', currentUsername);
        
        setupUI();
        showNotification('Вход выполнен успешно!', 'success');
    } catch (error) {
        console.error('Ошибка входа:', error);
        showNotification(error.message, 'error');
    }
}

async function registerUser(username, password, secretWord) {
    try {
        const response = await fetch(`${API_BASE_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, secret_word: secretWord })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Ошибка регистрации');
        }

        showNotification('Регистрация прошла успешно! Теперь вы можете войти.', 'success');
        switchAuthTab('login'); 
        document.getElementById('login-username').value = username;
        document.getElementById('login-password').focus();
    } catch (error) {
        console.error('Ошибка регистрации:', error);
        showNotification(error.message, 'error');
    }
}

function logoutUser() {
    authToken = '';
    currentUsername = '';
    localStorage.removeItem('habit_tracker_token');
    localStorage.removeItem('habit_tracker_user');
    allHabits = [];
    setupUI();
    showNotification('Вы вышли из системы.', 'info');
}

function getAuthHeader() {
    return {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    };
}

// ==========================================
//   API ВЗАИМОДЕЙСТВИЕ (Запросы к серверу)
// ==========================================

async function getHabits() {
    if (!authToken) return [];
    const response = await fetch(`${API_BASE_URL}/api/habits`, { headers: getAuthHeader() });
    if (response.status === 401) {
        logoutUser();
        throw new Error('Сессия истекла. Пожалуйста, войдите снова.');
    }
    if (!response.ok) throw new Error(`Ошибка загрузки: ${response.statusText}`);
    return await response.json();
}

async function addHabit(text, color) {
    const response = await fetch(`${API_BASE_URL}/api/habits`, {
        method: 'POST',
        headers: getAuthHeader(),
        body: JSON.stringify({ text, color })
    });
    if (!response.ok) throw new Error(`Ошибка добавления: ${response.statusText}`);
    return await response.json();
}

async function updateHabitOnServer(id, isCompleted, dateStr) {
    const url = `${API_BASE_URL}/api/habits/${id}`;
    const payload = { isCompleted, date: dateStr };
    const response = await fetch(url, {
        method: 'PUT',
        headers: getAuthHeader(),
        body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(`Ошибка обновления: ${response.statusText}`);
    return await response.json();
}

async function deleteHabit(id) {
    const url = `${API_BASE_URL}/api/habits/${id}`;
    const response = await fetch(url, { method: 'DELETE', headers: getAuthHeader() });
    if (!response.ok) throw new Error(`Ошибка удаления: ${response.statusText}`);
}

// ==========================================
//   ОБРАБОТЧИКИ СОБЫТИЙ И ОБНОВЛЕНИЕ DOM
// ==========================================

async function loadHabits() {
    toggleLoader(true);
    try {
        allHabits = await getHabits();
        renderCalendar();
        renderHabits();
    } catch (error) {
        console.error('Ошибка при загрузке привычек:', error);
        showNotification(error.message, 'error');
    } finally {
        toggleLoader(false);
    }
}

async function handleAddHabit(e) {
    e.preventDefault();
    const text = habitTextInput.value.trim();
    if (!text) return;
    
    const color = document.querySelector('input[name="habit-color"]:checked')?.value || 'primary';
    const addButton = e.submitter;
    addButton.disabled = true;

    try {
        const newHabit = await addHabit(text, color);
        allHabits.push(newHabit);
        habitTextInput.value = '';
        renderCalendar();
        renderHabits();
        showNotification('Привычка успешно добавлена!', 'success');
    } catch (error) {
        console.error('Ошибка добавления привычки:', error);
        showNotification('Не удалось добавить привычку.', 'error');
    } finally {
        addButton.disabled = false;
    }
}

async function handleHabitListClick(e) {
    const target = e.target;
    const container = target.closest('.habit-item-container');
    if (!container) return;

    const habitId = Number(container.dataset.id);

    if (target.classList.contains('habit-checkbox')) {
        await handleToggleHabit(habitId, target.checked);
    }

    if (target.closest('.delete-btn')) {
        const btn = target.closest('.delete-btn');
        btn.disabled = true;
        await handleDeleteHabit(habitId);
    }
}

function handleFilterClick(e) {
    const target = e.target.closest('.filter-btn');
    if (target) {
        currentFilter = target.dataset.filter;
        document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
        target.classList.add('active');
        renderHabits();
    }
}

function changeDay(direction) {
    currentDate.setDate(currentDate.getDate() + direction);
    updateDateDisplay();
    renderCalendar();
    renderHabits(); 
}

function updateDateDisplay() {
    const todayStr = toYYYYMMDD(new Date());
    const currentStr = toYYYYMMDD(currentDate);

    let formattedDate = currentDate.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
    if (currentStr === todayStr) formattedDate = 'Сегодня';
    
    currentDateDisplay.textContent = formattedDate;
}

async function handleToggleHabit(id, isCompleted) {
    const habit = allHabits.find(h => h.id === id);
    if (!habit) return;

    const dateStr = toYYYYMMDD(currentDate);
    if (!habit.completions) habit.completions = [];

    // Оптимистичное локальное обновление UI
    if (isCompleted) {
        if (!habit.completions.includes(dateStr)) habit.completions.push(dateStr);
    } else {
        habit.completions = habit.completions.filter(d => d !== dateStr);
    }

    updateHabitDOMState(id, isCompleted);
    updateTodayProgress();
    renderCalendar();

    if (currentFilter !== 'all') {
        setTimeout(renderHabits, 300);
    }

    try {
        await updateHabitOnServer(id, isCompleted, dateStr);
    } catch (error) {
        console.error('Ошибка изменения статуса:', error);
        // Откат состояния при ошибке запроса
        if (isCompleted) {
            habit.completions = habit.completions.filter(d => d !== dateStr);
        } else {
            if (!habit.completions.includes(dateStr)) habit.completions.push(dateStr);
        }
        updateHabitDOMState(id, !isCompleted);
        updateTodayProgress();
        renderCalendar();
        showNotification('Ошибка обновления статуса.', 'error');
    }
}

async function handleDeleteHabit(id) {
    const habitElement = habitsList.querySelector(`.habit-item-container[data-id="${id}"]`);
    
    if (habitElement) {
        habitElement.classList.add('fade-out');
        setTimeout(async () => {
            try {
                await deleteHabit(id);
                allHabits = allHabits.filter(h => h.id !== id);
                renderCalendar();
                renderHabits();
                showNotification('Привычка удалена.', 'success');
            } catch (error) {
                console.error('Ошибка удаления привычки:', error);
                showNotification('Не удалось удалить привычку.', 'error');
                habitElement.classList.remove('fade-out'); 
                habitElement.querySelector('.delete-btn').disabled = false;
            }
        }, 300);
    }
}

// ==========================================
//   КАЛЕНДАРЬ, РЕНДЕРИНГ И ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ==========================================

function renderCalendar() {
    if (!authToken) return;
    
    calendarContainer.innerHTML = '';
    
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    const headerDiv = document.createElement('div');
    headerDiv.className = 'calendar-header';
    
    const monthNames = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
    const title = document.createElement('h3');
    title.textContent = `${monthNames[month]} ${year}`;
    
    const toggleCalBtn = document.createElement('button');
    toggleCalBtn.className = 'btn-text';
    toggleCalBtn.id = 'toggle-calendar-view';
    toggleCalBtn.textContent = 'Свернуть';
    
    headerDiv.appendChild(title);
    headerDiv.appendChild(toggleCalBtn);
    calendarContainer.appendChild(headerDiv);
    
    const wrapper = document.createElement('div');
    wrapper.className = 'calendar-body-wrapper';
    wrapper.id = 'calendar-body-wrapper';
    
    const grid = document.createElement('div');
    grid.className = 'calendar-grid';
    
    // Заголовки дней недели
    const daysOfWeek = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
    daysOfWeek.forEach(day => {
        const dayNameDiv = document.createElement('div');
        dayNameDiv.className = 'calendar-day-name';
        dayNameDiv.textContent = day;
        grid.appendChild(dayNameDiv);
    });
    
    // Подготовка дат
    const firstDay = new Date(year, month, 1);
    let startDayIndex = firstDay.getDay() - 1;
    if (startDayIndex < 0) startDayIndex = 6; // Корректировка воскресенья
    
    const totalDays = new Date(year, month + 1, 0).getDate();
    const prevTotalDays = new Date(year, month, 0).getDate();
    
    // Пустые ячейки прошлого месяца
    for (let i = startDayIndex - 1; i >= 0; i--) {
        const dayDiv = document.createElement('div');
        dayDiv.className = 'calendar-day other-month';
        dayDiv.textContent = prevTotalDays - i;
        grid.appendChild(dayDiv);
    }
    
    // Дни текущего месяца
    const today = new Date();
    const todayStr = toYYYYMMDD(today);
    const selectedStr = toYYYYMMDD(currentDate);
    
    for (let day = 1; day <= totalDays; day++) {
        const dayDate = new Date(year, month, day);
        const dayStr = toYYYYMMDD(dayDate);
        
        const dayDiv = document.createElement('div');
        dayDiv.className = 'calendar-day';
        dayDiv.textContent = day;
        
        if (dayStr === todayStr) {
            dayDiv.classList.add('today');
        }
        if (dayStr === selectedStr) {
            dayDiv.classList.add('selected');
        }
        
        // Тепловая карта прогресса (heatmap) за день
        const totalHabitsCount = allHabits.length;
        let completedOnThisDay = 0;
        
        allHabits.forEach(habit => {
            if (habit.completions && habit.completions.includes(dayStr)) {
                completedOnThisDay++;
            }
        });
        
        if (totalHabitsCount > 0 && completedOnThisDay > 0) {
            dayDiv.classList.add('has-data');
            const alpha = Math.min(0.2 + (completedOnThisDay / totalHabitsCount) * 0.8, 1.0);
            dayDiv.style.setProperty('--heatmap-alpha', alpha);
        }
        
        dayDiv.addEventListener('click', () => {
            currentDate = dayDate;
            updateDateDisplay();
            renderCalendar();
            renderHabits();
        });
        
        grid.appendChild(dayDiv);
    }
    
    // Завершение сетки до кратности 7 дней
    const totalGridCells = grid.children.length - 7;
    const remainingCells = (7 - (totalGridCells % 7)) % 7;
    for (let i = 1; i <= remainingCells; i++) {
        const dayDiv = document.createElement('div');
        dayDiv.className = 'calendar-day other-month';
        dayDiv.textContent = i;
        grid.appendChild(dayDiv);
    }
    
    wrapper.appendChild(grid);
    calendarContainer.appendChild(wrapper);
    
    // Сворачивание / разворачивание
    const isCollapsed = localStorage.getItem('calendar_collapsed') === 'true';
    if (isCollapsed) {
        wrapper.classList.add('collapsed');
        toggleCalBtn.textContent = 'Развернуть';
    }
    
    toggleCalBtn.addEventListener('click', () => {
        const collapsed = wrapper.classList.toggle('collapsed');
        toggleCalBtn.textContent = collapsed ? 'Развернуть' : 'Свернуть';
        localStorage.setItem('calendar_collapsed', collapsed);
    });
}

function updateTodayProgress() {
    const progressCard = document.getElementById('today-progress-card');
    if (!progressCard || allHabits.length === 0) {
        progressCard?.classList.add('hidden');
        return;
    }

    progressCard.classList.remove('hidden');
    const total = allHabits.length;
    const dateStr = toYYYYMMDD(currentDate);
    const completed = allHabits.filter(h => h.completions && h.completions.includes(dateStr)).length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    progressCard.querySelector('.progress-info span').textContent = `Прогресс за ${currentDate.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}`;
    document.getElementById('progress-percentage').textContent = `${percentage}%`;
    document.getElementById('progress-bar-fill').style.width = `${percentage}%`;
    document.getElementById('progress-stats').textContent = `${completed} из ${total} выполнено`;
}

function renderHabits() {
    const dateStr = toYYYYMMDD(currentDate);
    
    let filteredHabits = allHabits;
    if (currentFilter === 'active') {
        filteredHabits = allHabits.filter(h => {
            const isComp = h.completions && h.completions.includes(dateStr);
            return !isComp;
        });
    } else if (currentFilter === 'completed') {
        filteredHabits = allHabits.filter(h => {
            const isComp = h.completions && h.completions.includes(dateStr);
            return isComp;
        });
    }

    habitsList.innerHTML = '';
    
    if (filteredHabits.length === 0 && allHabits.length > 0) {
        emptyState.classList.remove('hidden');
        emptyState.querySelector('h3').textContent = 'Привычки не найдены';
        emptyState.querySelector('p').textContent = 'Попробуйте изменить текущий фильтр.';
    } else if (allHabits.length === 0) {
        emptyState.classList.remove('hidden');
        emptyState.querySelector('h3').textContent = 'Список пока пуст';
        emptyState.querySelector('p').textContent = 'Начните с добавления своей первой привычки!';
    } else {
        emptyState.classList.add('hidden');
        filteredHabits.forEach(habit => {
            const li = createHabitElement(habit);
            habitsList.appendChild(li);
        });
    }
    
    updateTodayProgress();
}

function createHabitElement(habit) {
    const { id, text, color, completions } = habit;
    const dateStr = toYYYYMMDD(currentDate);
    const isCompleted = completions && completions.includes(dateStr);

    const container = document.createElement('div');
    container.className = `habit-item-container color-${color} ${isCompleted ? 'completed' : ''} fade-in`;
    container.dataset.id = id;

    container.innerHTML = `
        <div class="habit-item">
            <div class="habit-item-left">
                <input type="checkbox" class="habit-checkbox" ${isCompleted ? 'checked' : ''}>
                <span class="habit-text">${escapeHTML(text)}</span>
            </div>
            <div class="habit-item-right">
                <button class="btn btn-danger delete-btn" title="Удалить">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            </div>
        </div>
    `;
    return container;
}

function updateHabitDOMState(id, isCompleted) {
    const container = habitsList.querySelector(`.habit-item-container[data-id="${id}"]`);
    if (container) {
        container.classList.toggle('completed', isCompleted);
        const checkbox = container.querySelector('.habit-checkbox');
        if (checkbox) checkbox.checked = isCompleted;
    }
}

function toggleLoader(show) {
    loadingIndicator.classList.toggle('hidden', !show);
    habitsList.classList.toggle('hidden', show);
}

function showNotification(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    let icon = type === 'success' ? '✓' : '✕';
    toast.innerHTML = `<span class="toast-icon">${icon}</span> <span class="toast-message">${escapeHTML(message)}</span>`;
    notificationContainer.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        toast.addEventListener('transitionend', () => toast.remove());
    }, 3500);
}

function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, tag => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'}[tag] || tag));
}

function toYYYYMMDD(date) {
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}