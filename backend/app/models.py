from sqlalchemy import String, Boolean, DateTime, ForeignKey, Text, Integer, UniqueConstraint, LargeBinary
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime, timezone
from typing import Optional
from app.database import Base
def now(): return datetime.now(timezone.utc)
class Admin(Base):
    __tablename__="admins"
    id: Mapped[int]=mapped_column(primary_key=True)
    username: Mapped[str]=mapped_column(String(80), unique=True, index=True)
    password_hash: Mapped[str]=mapped_column(String(255))
    is_active: Mapped[bool]=mapped_column(Boolean, default=True)
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), default=now)
class Extension(Base):
    __tablename__="extensions"
    id: Mapped[int]=mapped_column(primary_key=True)
    extension_key: Mapped[str]=mapped_column(String(64), unique=True, index=True)
    name: Mapped[str]=mapped_column(String(160))
    version: Mapped[str]=mapped_column(String(32), default="1.0.0")
    is_active: Mapped[bool]=mapped_column(Boolean, default=True)
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), default=now)
class ExtensionUser(Base):
    __tablename__="extension_users"
    __table_args__=(UniqueConstraint("extension_id","username",name="uq_extension_username"),)
    id: Mapped[int]=mapped_column(primary_key=True)
    extension_id: Mapped[int]=mapped_column(ForeignKey("extensions.id",ondelete="CASCADE"),index=True)
    username: Mapped[str]=mapped_column(String(100))
    password_hash: Mapped[str]=mapped_column(String(255))
    is_active: Mapped[bool]=mapped_column(Boolean,default=True)
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True),default=now)
class Session(Base):
    __tablename__="sessions"
    id: Mapped[int]=mapped_column(primary_key=True)
    user_id: Mapped[int]=mapped_column(ForeignKey("extension_users.id",ondelete="CASCADE"),index=True)
    extension_id: Mapped[int]=mapped_column(ForeignKey("extensions.id",ondelete="CASCADE"),index=True)
    refresh_hash: Mapped[str]=mapped_column(String(64),unique=True,index=True)
    expires_at: Mapped[datetime]=mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[Optional[datetime]]=mapped_column(DateTime(timezone=True),nullable=True)
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True),default=now)
class RefreshToken(Base):
    __tablename__="refresh_tokens"
    id: Mapped[int]=mapped_column(primary_key=True)
    session_id: Mapped[int]=mapped_column(ForeignKey("sessions.id",ondelete="CASCADE"),index=True)
    token_hash: Mapped[str]=mapped_column(String(64),unique=True,index=True)
    used_at: Mapped[Optional[datetime]]=mapped_column(DateTime(timezone=True),nullable=True)
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True),default=now)
class ActivityLog(Base):
    __tablename__="activity_logs"
    id: Mapped[int]=mapped_column(primary_key=True)
    actor_type: Mapped[str]=mapped_column(String(20))
    actor_id: Mapped[Optional[int]]=mapped_column(Integer,nullable=True)
    extension_id: Mapped[Optional[int]]=mapped_column(ForeignKey("extensions.id"),nullable=True,index=True)
    action: Mapped[str]=mapped_column(String(100),index=True)
    detail: Mapped[Optional[str]]=mapped_column(Text,nullable=True)
    ip_address: Mapped[Optional[str]]=mapped_column(String(64),nullable=True)
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True),default=now,index=True)
class ExtensionSetting(Base):
    __tablename__="extension_settings"
    id: Mapped[int]=mapped_column(primary_key=True)
    extension_id: Mapped[int]=mapped_column(ForeignKey("extensions.id",ondelete="CASCADE"),index=True)
    setting_key: Mapped[str]=mapped_column(String(100))
    setting_value: Mapped[str]=mapped_column(Text)


class ExtensionPackage(Base):
    __tablename__ = "extension_packages"
    id: Mapped[int] = mapped_column(primary_key=True)
    extension_id: Mapped[int] = mapped_column(ForeignKey("extensions.id", ondelete="CASCADE"), unique=True, index=True)
    filename: Mapped[str] = mapped_column(String(255))
    sha256: Mapped[str] = mapped_column(String(64))
    file_size: Mapped[int] = mapped_column(Integer)
    package_data: Mapped[bytes] = mapped_column(LargeBinary)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
