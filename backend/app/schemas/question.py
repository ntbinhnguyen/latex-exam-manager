from pydantic import BaseModel, field_validator
from typing import Optional
from uuid import UUID
from datetime import datetime
from app.models.question import QuestionType, DifficultyLevel
from app.services.question_id import is_valid_qid

# Lớp cơ sở chứa các trường chung
class QuestionBase(BaseModel):
    question_code: Optional[str] = None
    content_latex: str
    question_type: QuestionType
    difficulty_level: Optional[DifficultyLevel] = None
    
    # Phân loại nội dung
    grade_level: Optional[str] = None
    chapter: Optional[str] = None
    lesson: Optional[str] = None
    topic: Optional[str] = None
    
    # Dữ liệu bóc tách & Ghi chú
    extracted_answer: Optional[str] = None
    extracted_solution: Optional[str] = None
    teacher_notes: Optional[str] = None
    source_material: Optional[str] = None
    status: Optional[str] = "active"

# Lớp dùng để validate khi thêm mới câu hỏi
class QuestionCreate(QuestionBase):
    pass

# Lớp dùng để validate khi cập nhật (PATCH/PUT) - Tất cả các trường đều optional
class QuestionUpdate(BaseModel):
    question_code: Optional[str] = None
    content_latex: Optional[str] = None
    question_type: Optional[QuestionType] = None
    difficulty_level: Optional[DifficultyLevel] = None
    grade_level: Optional[str] = None
    chapter: Optional[str] = None
    lesson: Optional[str] = None
    topic: Optional[str] = None
    extracted_answer: Optional[str] = None
    extracted_solution: Optional[str] = None
    teacher_notes: Optional[str] = None
    source_material: Optional[str] = None
    status: Optional[str] = None

    @field_validator("question_code")
    @classmethod
    def check_question_code(cls, v):
        # ID mới: TN.M1.T0.C1.B3.01 (Loại.Mức.Lớp.Chương.Bài.Dạng). Chuỗi rỗng = bỏ ID.
        if v is None or v.strip() == "":
            return None
        v = v.strip()
        if not is_valid_qid(v):
            raise ValueError("ID không đúng định dạng, VD: TN.M1.T0.C1.B3.01 (Loại.Mức.Lớp.Chương.Bài.Dạng)")
        return v

# Lớp dùng để chuẩn hóa dữ liệu trả về từ API (Response)
class QuestionResponse(QuestionBase):
    id: UUID
    created_at: datetime
    updated_at: Optional[datetime] = None

    # Cho phép Pydantic đọc dữ liệu trực tiếp từ SQLAlchemy ORM model
    class Config:
        from_attributes = True