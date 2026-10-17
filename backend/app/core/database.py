from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from app.core.config import settings

# Khởi tạo Engine kết nối CSDL
engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True, pool_recycle=300)

# Khởi tạo Session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class cho các models (Question, ExamMatrix, v.v.)
Base = declarative_base()

# Dependency để sử dụng trong các routes của FastAPI
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()