from pydantic_settings import BaseSettings, SettingsConfigDict
class Settings(BaseSettings):
    database_url: str = "sqlite:///./dev.db"
    jwt_secret: str = "development-only-change-me"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 10
    refresh_token_days: int = 14
    admin_username: str = "superadmin"
    admin_password: str = "CHANGE_THIS"
    cors_origins: str = "http://localhost:5173"
    environment: str = "development"
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
settings = Settings()
# Render provides postgresql:// URLs; this project uses psycopg v3.
if settings.database_url.startswith("postgres://"):
    settings.database_url = settings.database_url.replace("postgres://", "postgresql+psycopg://", 1)
elif settings.database_url.startswith("postgresql://"):
    settings.database_url = settings.database_url.replace("postgresql://", "postgresql+psycopg://", 1)
