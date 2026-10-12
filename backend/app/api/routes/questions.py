from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID
from app.core.database import get_db
from typing import Optional
from app.models.question import Question, QuestionType, DifficultyLevel
from app.schemas.question import QuestionUpdate
from app.services.latex_parser import parse_latex_file
from app.services.question_id import retype_qid

router = APIRouter()

@router.get("/")
def get_questions(skip: int = 0, limit: int = 50, q: Optional[str] = None,
                  question_type: Optional[str] = None, difficulty_level: Optional[str] = None,
                  chapter: Optional[str] = None, db: Session = Depends(get_db)):
    """Lấy danh sách câu hỏi (phân trang + bộ lọc)"""
    query = db.query(Question).filter(Question.status != "archived")
    if q:
        query = query.filter(Question.content_latex.ilike(f"%{q}%"))
    if question_type:
        query = query.filter(Question.question_type == QuestionType(question_type))
    if difficulty_level:
        query = query.filter(Question.difficulty_level == DifficultyLevel(difficulty_level))
    if chapter:
        query = query.filter(Question.chapter == chapter)
    total = query.count()
    data = query.order_by(Question.created_at.desc()).offset(skip).limit(limit).all()
    return {"total": total, "data": data}

@router.get("/{question_id}")
def get_question(question_id: UUID, db: Session = Depends(get_db)):
    """Xem chi tiết 1 câu hỏi"""
    question = db.query(Question).filter(Question.id == question_id).first()
    if not question:
        raise HTTPException(status_code=404, detail="Không tìm thấy câu hỏi")
    return question

@router.put("/{question_id}")
def update_question(question_id: UUID, update_data: QuestionUpdate, db: Session = Depends(get_db)):
    """Chỉnh sửa câu hỏi: nội dung LaTeX, ID (question_code) hoặc thông tin phân loại."""
    question = db.query(Question).filter(Question.id == question_id).first()
    if not question:
        raise HTTPException(status_code=404, detail="Không tìm thấy câu hỏi")

    data = update_data.model_dump(exclude_unset=True)
    for key, value in data.items():
        if hasattr(question, key) and key not in ("id", "created_at"):
            setattr(question, key, value)

    # Sửa nội dung → nhận dạng lại loại câu + lời giải; ID giữ đúng đoạn loại (TN/DS/TLN/TL)
    if data.get("content_latex"):
        parsed = parse_latex_file(data["content_latex"])["questions"]
        if parsed:
            question.question_type = parsed[0]["question_type"]
            question.extracted_solution = parsed[0]["extracted_solution"]
        if "question_code" not in data and question.question_code:
            question.question_code = retype_qid(question.question_code, question.question_type)

    db.commit()
    db.refresh(question)
    return question

@router.delete("/{question_id}")
def delete_question(question_id: UUID, db: Session = Depends(get_db)):
    """Xóa câu hỏi (Xóa mềm - Soft delete)"""
    question = db.query(Question).filter(Question.id == question_id).first()
    if not question:
        raise HTTPException(status_code=404, detail="Không tìm thấy câu hỏi")
        
    question.status = "archived"
    db.commit()
    return {"message": "Đã xóa câu hỏi thành công"}