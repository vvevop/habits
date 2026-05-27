import sqlite3
from typing import List
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

# Импортируем настройки из config.py
import config

# --- Настройка базы данных ---
def init_db():
    """Инициализирует базу данных и создает таблицу, если она не существует."""
    try:
        con = sqlite3.connect(config.DB_FILE)
        cur = con.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS habits (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL,
                text TEXT NOT NULL,
                isCompleted BOOLEAN NOT NULL DEFAULT 0,
                createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        con.commit()
    except sqlite3.Error as e:
        print(f"Database error: {e}")
    finally:
        if 'con' in locals() and con:
            con.close()

# --- Модели данных (Pydantic) ---
class HabitBase(BaseModel):
    """Базовая модель для привычки."""
    username: str
    text: str

class HabitCreate(HabitBase):
    """Модель для создания новой привычки."""
    pass

class Habit(HabitBase):
    """Модель для представления привычки, включая ID и статус."""
    id: int
    isCompleted: bool

class HabitUpdate(BaseModel):
    """Модель для обновления статуса привычки."""
    username: str
    isCompleted: bool


# --- Приложение FastAPI ---
app = FastAPI(
    title="Habit Tracker API",
    description="API для простого трекера привычек",
    version="1.0.0"
)

# --- Настройка CORS ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Эндпоинты API ---

@app.on_event("startup")
def on_startup():
    """Выполняется при старте приложения."""
    init_db()

def get_db_connection():
    """Возвращает соединение с БД, где ряды возвращаются как словари."""
    conn = sqlite3.connect(config.DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

@app.get("/api/habits", response_model=List[Habit], tags=["Habits"])
def get_habits_for_user(username: str):
    """Получить все привычки для указанного пользователя."""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT id, username, text, isCompleted FROM habits WHERE username = ?", (username,))
        habits_data = cur.fetchall()
        return [Habit(**dict(row)) for row in habits_data]
    except sqlite3.Error as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Database error: {e}")
    finally:
        if 'conn' in locals() and conn:
            conn.close()


@app.post("/api/habits", response_model=Habit, status_code=status.HTTP_201_CREATED, tags=["Habits"])
def create_habit(habit: HabitCreate):
    """Создать новую привычку."""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO habits (username, text) VALUES (?, ?)",
            (habit.username, habit.text)
        )
        new_id = cur.lastrowid
        conn.commit()
        return Habit(id=new_id, username=habit.username, text=habit.text, isCompleted=False)
    except sqlite3.Error as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Database error: {e}")
    finally:
        if 'conn' in locals() and conn:
            conn.close()


@app.put("/api/habits/{habit_id}", response_model=Habit, tags=["Habits"])
def update_habit_status(habit_id: int, habit_update: HabitUpdate):
    """Обновить статус выполнения привычки (isCompleted)."""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("SELECT * FROM habits WHERE id = ? AND username = ?", (habit_id, habit_update.username))
        existing_habit = cur.fetchone()
        
        if not existing_habit:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Habit not found or access denied")

        cur.execute(
            "UPDATE habits SET isCompleted = ? WHERE id = ?",
            (habit_update.isCompleted, habit_id)
        )
        conn.commit()

        cur.execute("SELECT * FROM habits WHERE id = ?", (habit_id,))
        updated_row = cur.fetchone()
        return Habit(**dict(updated_row))

    except sqlite3.Error as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Database error: {e}")
    finally:
        if 'conn' in locals() and conn:
            conn.close()


@app.delete("/api/habits/{habit_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Habits"])
def delete_habit_by_id(habit_id: int, username: str):
    """Удалить привычку по ID."""
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        cur.execute("SELECT id FROM habits WHERE id = ? AND username = ?", (habit_id, username))
        existing_habit = cur.fetchone()

        if not existing_habit:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Habit not found or access denied")

        cur.execute("DELETE FROM habits WHERE id = ?", (habit_id,))
        conn.commit()

        return None
    except sqlite3.Error as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Database error: {e}")
    finally:
        if 'conn' in locals() and conn:
            conn.close()

# --- Для локального запуска (не для продакшена) ---
if __name__ == "__main__":
    print(f"Starting server on {config.APP_HOST}:{config.APP_PORT}... Access docs at http://{config.APP_HOST}:{config.APP_PORT}/docs")
    init_db()
    uvicorn.run(app, host=config.APP_HOST, port=config.APP_PORT)