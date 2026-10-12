import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "Quản lý đề thi LaTeX"
    # Chuỗi kết nối mặc định (có thể ghi đè bằng file .env hoặc biến môi trường)
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL", 
        "postgresql://teacher:securepassword@localhost:5432/latex_exams"
    )
    
    class Config:
        env_file = ".env"

settings = Settings()