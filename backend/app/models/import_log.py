import uuid
from sqlalchemy import Column, String, Integer, DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from app.core.database import Base


class ImportLog(Base):
    """Nhật ký nhập file .tex: mỗi lần nhập thành công ghi 1 dòng (ngày nhập, tên file, số câu)."""
    __tablename__ = "import_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    filename = Column(String, nullable=False, index=True)
    question_count = Column(Integer, nullable=False, default=0)  # số câu đã nhập từ file
    imported_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
