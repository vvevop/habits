import sqlite3
from typing import List
from datetime import timedelta

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
import uvicorn

import config
import auth
from auth import UserInDB

# --- Настройка базы данных ---
def init_db():
    """Инициализирует БД и создает таблицы, если они не существуют."""
    try:
        con = sqlite3.connect(config.DB_FILE)
        cur = con.cursor()
        
        # Создаем таблицу привычек
        cur.execute("""
            CREATE TABLE IF NOT EXISTS habits (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL,
                text TEXT NOT NULL,
                color TEXT NOT NULL DEFAULT 'primary',
                createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Создаем таблицу логов выполнения привычек по датам (для календаря)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS habit_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                habit_id INTEGER NOT NULL,
                date TEXT NOT NULL,
                UNIQUE(habit_id, date)
            )
        """)
        
        # Создаем таблицу пользователей с секретным словом
        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                hashed_password TEXT NOT NULL,
                secret_word TEXT NOT NULL DEFAULT ''
            )
        """)
        
        # Безопасное обновление схемы для старых баз данных
        try:
            cur.execute("ALTER TABLE habits ADD COLUMN color TEXT NOT NULL DEFAULT 'primary'")
        except sqlite3.OperationalError:
            pass  # Колонка уже существует
            
        try:
            cur.execute("ALTER TABLE users ADD COLUMN secret_word TEXT NOT NULL DEFAULT ''")
        except sqlite3.OperationalError:
            pass  # Колонка уже существует

        con.commit()
    except sqlite3.Error as e:
        print(f"Database error: {e}")
    finally:
        if 'con' in locals() and con:
            con.close()

# --- Модели данных (Pydantic) ---

class HabitBase(BaseModel):
    text: str
    color: str = "primary"

class HabitCreate(HabitBase):
    pass

class Habit(HabitBase):
    id: int
    completions: List[str] = []  # Список дат в формате YYYY-MM-DD
    username: str

class HabitUpdate(BaseModel):
    isCompleted: bool
    date: str  # YYYY-MM-DD

class UserCreate(BaseModel):
    username: str
    password: str
    secret_word: str

class PasswordReset(BaseModel):
    username: str
    secret_word: str
    new_password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: str | None = None


# --- Приложение FastAPI ---
app = FastAPI(
    title="Habit Tracker API",
    description="API для простого трекера привычек с аутентификацией",
    version="1.2.0"
)

# --- Настройка CORS ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Вспомогательные функции ---
@app.on_event("startup")
def on_startup():
    init_db()

def get_db_connection():
    conn = sqlite3.connect(config.DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

# --- Эндпоинты аутентификации ---

@app.post("/register", status_code=status.HTTP_201_CREATED, tags=["Auth"])
def register_user(user: UserCreate):
    """Регистрирует нового пользователя с защитным словом."""
    db_user = auth.get_user(user.username)
    if db_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Имя пользователя уже занято",
        )
    
    hashed_password = auth.get_password_hash(user.password)
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO users (username, hashed_password, secret_word) VALUES (?, ?, ?)",
            (user.username, hashed_password, user.secret_word)
        )
        conn.commit()
        return {"message": f"User {user.username} registered successfully"}
    except sqlite3.IntegrityError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Имя пользователя уже занято",
        )
    except sqlite3.Error as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Database error: {e}")
    finally:
        if 'conn' in locals() and conn:
            conn.close()

@app.post("/token", response_model=Token, tags=["Auth"])
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends()):
    """Аутентифицирует пользователя и возвращает токен доступа."""
    user = auth.authenticate_user(form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверное имя пользователя или пароль",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=config.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth.create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/reset-password", tags=["Auth"])
def reset_password(reset_data: PasswordReset):
    """Сбрасывает пароль на основе проверки секретного слова."""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT secret_word FROM users WHERE username = ?", (reset_data.username,))
        row = cur.fetchone()
        
        if not row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Пользователь не найден",
            )
            
        stored_secret = row["secret_word"]
        if stored_secret.strip().lower() != reset_data.secret_word.strip().lower():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Неверное секретное слово для восстановления",
            )
            
        hashed_password = auth.get_password_hash(reset_data.new_password)
        cur.execute(
            "UPDATE users SET hashed_password = ? WHERE username = ?",
            (hashed_password, reset_data.username)
        )
        conn.commit()
        return {"message": "Пароль успешно изменен"}
    except sqlite3.Error as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Database error: {e}")
    finally:
        if 'conn' in locals() and conn:
            conn.close()


# --- Эндпоинты API для привычек (защищенные) ---

@app.get("/api/habits", response_model=List[Habit], tags=["Habits"])
def get_my_habits(current_user: UserInDB = Depends(auth.get_current_active_user)):
    """Получить все привычки со списком дат выполнения для текущего пользователя."""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT id, username, text, color FROM habits WHERE username = ?", (current_user.username,))
        habits_data = cur.fetchall()
        
        habits = []
        for row in habits_data:
            habit_id = row["id"]
            cur.execute("SELECT date FROM habit_logs WHERE habit_id = ?", (habit_id,))
            completions_data = cur.fetchall()
            completions = [c_row["date"] for c_row in completions_data]
            
            habit_dict = dict(row)
            habit_dict["completions"] = completions
            habits.append(Habit(**habit_dict))
            
        return habits
    except sqlite3.Error as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Database error: {e}")
    finally:
        if 'conn' in locals() and conn:
            conn.close()

@app.post("/api/habits", response_model=Habit, status_code=status.HTTP_201_CREATED, tags=["Habits"])
def create_habit_for_user(habit: HabitCreate, current_user: UserInDB = Depends(auth.get_current_active_user)):
    """Создать новую привычку."""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO habits (username, text, color) VALUES (?, ?, ?)",
            (current_user.username, habit.text, habit.color)
        )
        new_id = cur.lastrowid
        conn.commit()
        return Habit(id=new_id, username=current_user.username, text=habit.text, color=habit.color, completions=[])
    except sqlite3.Error as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Database error: {e}")
    finally:
        if 'conn' in locals() and conn:
            conn.close()

@app.put("/api/habits/{habit_id}", response_model=Habit, tags=["Habits"])
def update_habit_status(habit_id: int, habit_update: HabitUpdate, current_user: UserInDB = Depends(auth.get_current_active_user)):
    """Обновить статус привычки (выполнено / не выполнено) для конкретного дня."""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("SELECT * FROM habits WHERE id = ? AND username = ?", (habit_id, current_user.username))
        existing_habit = cur.fetchone()
        
        if not existing_habit:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Habit not found or access denied")

        if habit_update.isCompleted:
            cur.execute(
                "INSERT OR IGNORE INTO habit_logs (habit_id, date) VALUES (?, ?)",
                (habit_id, habit_update.date)
            )
        else:
            cur.execute(
                "DELETE FROM habit_logs WHERE habit_id = ? AND date = ?",
                (habit_id, habit_update.date)
            )
        conn.commit()

        cur.execute("SELECT date FROM habit_logs WHERE habit_id = ?", (habit_id,))
        completions_data = cur.fetchall()
        completions = [row["date"] for row in completions_data]

        habit_dict = dict(existing_habit)
        habit_dict["completions"] = completions
        return Habit(**habit_dict)
    except sqlite3.Error as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Database error: {e}")
    finally:
        if 'conn' in locals() and conn:
            conn.close()

@app.delete("/api/habits/{habit_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Habits"])
def delete_habit_by_id(habit_id: int, current_user: UserInDB = Depends(auth.get_current_active_user)):
    """Удалить привычку и ее логи."""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("SELECT id FROM habits WHERE id = ? AND username = ?", (habit_id, current_user.username))
        existing_habit = cur.fetchone()

        if not existing_habit:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Habit not found or access denied")

        cur.execute("DELETE FROM habits WHERE id = ?", (habit_id,))
        cur.execute("DELETE FROM habit_logs WHERE habit_id = ?", (habit_id,))
        conn.commit()
    except sqlite3.Error as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Database error: {e}")
    finally:
        if 'conn' in locals() and conn:
            conn.close()

if __name__ == "__main__":
    init_db()
    uvicorn.run("main:app", host=config.APP_HOST, port=config.APP_PORT, reload=True)