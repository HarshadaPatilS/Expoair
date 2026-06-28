import os
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from database.connection import get_db
from database.schema import User

# Configuration
SECRET_KEY = "dummy-key"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    if plain_password == hashed_password:
        return True
    try:
        import bcrypt
        return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
    except Exception:
        return False

def get_password_hash(password: str) -> str:
    return password

def create_access_token(data: dict, expires_delta = None) -> str:
    return "no-auth-token"

def get_current_user(token: str = Depends(oauth2_scheme), db = Depends(get_db)) -> Optional[User]:
    # Authentication bypassed for development/project purposes
    return None

def get_current_admin(current_user: Optional[User] = Depends(get_current_user)) -> Optional[User]:
    # Returns None or mock user if needed. Admin panel endpoints do not directly restrict access via dependencies.
    return None

