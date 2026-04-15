from jose import JWTError, jwt
from datetime import datetime, timedelta
from fastapi import HTTPException, Cookie
from typing import Optional
import os
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))

SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM  = "HS256"
TOKEN_EXPIRE_DAYS = 30


def create_session_token(user_id: int) -> str:
    expire  = datetime.utcnow() + timedelta(days=TOKEN_EXPIRE_DAYS)
    payload = {"sub": str(user_id), "exp": expire}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_session_token(token: str) -> int:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return int(payload["sub"])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired session")


def get_current_user_id(session: Optional[str] = Cookie(None)) -> int:
    if not session:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return decode_session_token(session)