import uuid
from sqlalchemy import Column, String, Text, Enum, DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from app.core.database import Base
import enum

class QuestionType(enum.Enum):
    MULTIPLE_CHOICE = "Trắc nghiệm nhiều lựa chọn"
    TRUE_FALSE = "Đúng - Sai"
    SHORT_ANSWER = "Trả lời ngắn"
    ESSAY = "Tự luận"

class DifficultyLevel(enum.Enum):
    NB = "NB"
    TH = "TH"
    VD = "VD"
    VDC = "VDC"

class Question(Base):
    __tablename__ = "questions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    question_code = Column(String, index=True, nullable=True)
    
    content_latex = Column(Text, nullable=False) # Chứa nguyên vẹn \begin{ex}...\end{ex}
    question_type = Column(Enum(QuestionType), nullable=False)
    difficulty_level = Column(Enum(DifficultyLevel), nullable=True)
    
    # Phân loại
    grade_level = Column(String, index=True, nullable=True)
    chapter = Column(String, index=True, nullable=True)
    lesson = Column(String, index=True, nullable=True)
    topic = Column(String, index=True, nullable=True)
    
    extracted_answer = Column(Text, nullable=True) # Đáp án bóc tách được
    extracted_solution = Column(Text, nullable=True) # Nội dung trong \loigiai{}
    
    teacher_notes = Column(Text, nullable=True)
    source_material = Column(String, nullable=True)
    status = Column(String, default="active") # active, hidden, archived (archived = đã xóa mềm)
    deleted_at = Column(DateTime(timezone=True), nullable=True) # thời điểm xóa mềm
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())