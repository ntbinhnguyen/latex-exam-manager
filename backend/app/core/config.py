import os
from pydantic_settings import BaseSettings, SettingsConfigDict


def normalize_db_url(url: str) -> str:
    """Chuẩn hóa chuỗi kết nối cho driver psycopg v3 (đang dùng trong requirements).
    - postgres:// và postgresql:// -> postgresql+psycopg://
    - Supabase bắt buộc SSL -> thêm sslmode=require nếu chưa có
    """
    url = url.strip()
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://"):]
    if "supabase" in url and "sslmode=" not in url:
        url += ("&" if "?" in url else "?") + "sslmode=require"
    return url


class Settings(BaseSettings):
    PROJECT_NAME: str = "Quản lý đề thi LaTeX"
    # Ghi đè bằng backend/.env hoặc biến môi trường DATABASE_URL
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql://teacher:securepassword@localhost:5432/latex_exams",
    )

    # extra="ignore": bỏ qua các biến khác trong .env (POSTGRES_*, *_PORT...)
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
settings.DATABASE_URL = normalize_db_url(settings.DATABASE_URL)
