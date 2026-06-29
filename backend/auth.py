"""JWT auth utilities + dependency for tenant-scoped requests."""
import os
from pathlib import Path
import jwt
import bcrypt
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

load_dotenv(Path(__file__).parent / ".env")
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALG = "HS256"
TOKEN_TTL_HOURS = 24 * 7

bearer = HTTPBearer(auto_error=False)


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_token(user_id: str, role: str, tenant_id: str | None) -> str:
    exp = datetime.now(timezone.utc) + timedelta(hours=TOKEN_TTL_HOURS)
    payload = {
        "sub": user_id,
        "role": role,
        "tenant_id": tenant_id,
        "exp": exp,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.PyJWTError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")


async def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(bearer),
) -> dict:
    if not creds:
        raise HTTPException(status_code=401, detail="Missing auth")
    payload = decode_token(creds.credentials)
    return {
        "user_id": payload["sub"],
        "role": payload["role"],
        "tenant_id": payload.get("tenant_id"),
    }


async def require_super_admin(user=Depends(get_current_user)) -> dict:
    if user["role"] != "super_admin":
        raise HTTPException(status_code=403, detail="Super admin only")
    return user


async def require_tenant(user=Depends(get_current_user)) -> dict:
    if not user["tenant_id"]:
        raise HTTPException(status_code=403, detail="Tenant scope required")
    return user
