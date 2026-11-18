import hashlib, secrets
from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError
from pwdlib import PasswordHash
from app.core.config import settings
password_hash=PasswordHash.recommended()
def hash_password(p): return password_hash.hash(p)
def verify_password(p,h): return password_hash.verify(p,h)
def token_hash(t): return hashlib.sha256(t.encode()).hexdigest()
def access_token(user_id, extension_id, session_id):
    exp=datetime.now(timezone.utc)+timedelta(minutes=settings.access_token_minutes)
    return jwt.encode({"sub":str(user_id),"ext":extension_id,"sid":session_id,"type":"access","exp":exp},settings.jwt_secret,algorithm=settings.jwt_algorithm)
def decode_token(t):
    return jwt.decode(t,settings.jwt_secret,algorithms=[settings.jwt_algorithm])
def new_refresh(): return secrets.token_urlsafe(48)
