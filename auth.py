import sqlite3
from datetime import datetime, timedelta
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel

import config

# --- Настройки ---

# Схема для хеширования паролей
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Схема OAuth2 для получения токена из заголовка Authorization
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# --- Модели для пользователей ---

class UserInDB(BaseModel):
    id: int
    username: str
    hashed_password: str
    secret_word: str

# --- Вспомогательные функции для работы с БД (для предотвращения циклического импорта) ---

def get_auth_db_connection():
    conn = sqlite3.connect(config.DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

# --- Функции для работы с паролями ---

def verify_password(plain_password, hashed_password):
    """Проверяет, соответствует ли обычный пароль хешированному."""
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    """Создает хеш пароля."""
    return pwd_context.hash(password)

# --- Функции для работы с JWT ---

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Создает JWT токен доступа."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=config.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, config.SECRET_KEY, algorithm=config.ALGORITHM)
    return encoded_jwt

# --- Функции для аутентификации ---

def get_user(username: str):
    """Получает пользователя из базы данных по имени."""
    conn = None
    try:
        conn = get_auth_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT * FROM users WHERE username = ?", (username,))
        user_data = cur.fetchone()
        if user_data:
            return UserInDB(**dict(user_data))
    finally:
        if conn:
            conn.close()
    return None

def authenticate_user(username: str, password: str):
    """Аутентифицирует пользователя."""
    user = get_user(username)
    if not user:
        return False
    if not verify_password(password, user.hashed_password):
        return False
    return user

async def get_current_user(token: str = Depends(oauth2_scheme)):
    """Декодирует токен и возвращает текущего пользователя."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, config.SECRET_KEY, algorithms=[config.ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    user = get_user(username)
    if user is None:
        raise credentials_exception
    return user

async def get_current_active_user(current_user: UserInDB = Depends(get_current_user)):
    """Проверяет, активен ли пользователь."""
    return current_user