from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session
from uuid import UUID
from app.core.database import get_db
from typing import List, Optional
from app.models.question import Question, QuestionType, DifficultyLevel
from app.models.exam import ExamQuestion
from app.schemas.question import QuestionUpdate
from app.services.latex_parser import parse_latex_file, qid_from_raw, TYPE_ABBR
from app.services.question_id import retype_qid, embed_qid, is_valid_qid

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

# ---------------------------------------------------------------------------
# THÙNG RÁC: quản lý câu hỏi đã xóa mềm (status = "archived")
# Lưu ý: các đường dẫn tĩnh /trash... phải khai báo TRƯỚC "/{question_id}".
# ---------------------------------------------------------------------------

class TrashBulk(BaseModel):
    ids: List[UUID] = []
    all: bool = False  # true = áp dụng cho toàn bộ thùng rác (bỏ qua ids)


def _trash_query(db: Session, ids: Optional[List[UUID]] = None, everything: bool = False):
    query = db.query(Question).filter(Question.status == "archived")
    if not everything:
        query = query.filter(Question.id.in_(ids or []))
    return query


@router.get("/trash")
def list_trash(skip: int = 0, limit: int = 50, q: Optional[str] = None,
               db: Session = Depends(get_db)):
    """Danh sách câu hỏi đã xóa mềm (mới xóa xếp trước)."""
    query = db.query(Question).filter(Question.status == "archived")
    if q:
        like = f"%{q}%"
        query = query.filter(Question.content_latex.ilike(like) | Question.question_code.ilike(like))
    total = query.count()
    deleted_time = func.coalesce(Question.deleted_at, Question.updated_at, Question.created_at)
    data = query.order_by(deleted_time.desc()).offset(skip).limit(limit).all()
    return {"total": total, "data": data}


@router.post("/trash/restore")
def restore_questions(body: TrashBulk, db: Session = Depends(get_db)):
    """Phục hồi nhiều câu (hoặc toàn bộ thùng rác) về ngân hàng."""
    items = _trash_query(db, body.ids, body.all).all()
    for item in items:
        item.status = "active"
        item.deleted_at = None
    db.commit()
    return {"restored": len(items), "message": f"Đã phục hồi {len(items)} câu hỏi"}


@router.post("/trash/purge")
def purge_questions(body: TrashBulk, db: Session = Depends(get_db)):
    """Xóa hẳn nhiều câu (hoặc dọn sạch thùng rác). Chỉ xóa câu đang ở trong thùng rác.
    Câu đã được dùng trong đề thi đã sinh sẽ được GIỮ LẠI (để không làm hỏng đề) và báo trong 'skipped'."""
    items = _trash_query(db, body.ids, body.all).all()
    used_ids = set()
    if items:
        rows = db.query(ExamQuestion.question_id).filter(
            ExamQuestion.question_id.in_([i.id for i in items])
        ).distinct().all()
        used_ids = {r[0] for r in rows}
    purged, skipped = 0, []
    for item in items:
        if item.id in used_ids:
            skipped.append({"id": str(item.id), "question_code": item.question_code,
                            "reason": "Đang được dùng trong đề thi đã sinh"})
            continue
        db.delete(item)
        purged += 1
    db.commit()
    return {"purged": purged, "skipped": skipped, "message": f"Đã xóa hẳn {purged} câu hỏi"}


@router.post("/{question_id}/restore")
def restore_question(question_id: UUID, db: Session = Depends(get_db)):
    """Phục hồi 1 câu hỏi đã xóa mềm."""
    question = db.query(Question).filter(Question.id == question_id).first()
    if not question:
        raise HTTPException(status_code=404, detail="Không tìm thấy câu hỏi")
    if question.status != "archived":
        raise HTTPException(status_code=400, detail="Câu hỏi này không nằm trong thùng rác")
    question.status = "active"
    question.deleted_at = None
    db.commit()
    return {"message": "Đã phục hồi câu hỏi"}


@router.delete("/{question_id}/permanent")
def purge_question(question_id: UUID, db: Session = Depends(get_db)):
    """Xóa hẳn 1 câu hỏi (chỉ áp dụng cho câu đã xóa mềm)."""
    question = db.query(Question).filter(Question.id == question_id).first()
    if not question:
        raise HTTPException(status_code=404, detail="Không tìm thấy câu hỏi")
    if question.status != "archived":
        raise HTTPException(status_code=400, detail="Chỉ được xóa hẳn câu hỏi đang ở trong thùng rác")
    used = db.query(ExamQuestion).filter(ExamQuestion.question_id == question.id).count()
    if used:
        raise HTTPException(status_code=409,
                            detail=f"Không thể xóa hẳn: câu này đang được dùng trong {used} vị trí của các đề thi đã sinh")
    db.delete(question)
    db.commit()
    return {"message": "Đã xóa hẳn câu hỏi"}

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
        if "question_code" not in data:
            # ID người dùng sửa trực tiếp ở dòng \\begin{ex}%[ID] trong mã LaTeX -> cập nhật theo
            raw_id = qid_from_raw(question.content_latex)
            if raw_id:
                question.question_code = raw_id
            if question.question_code:
                question.question_code = retype_qid(question.question_code, TYPE_ABBR[question.question_type])

    # Luôn giữ ID trong mã LaTeX đồng bộ với cột question_code:  \\begin{ex}%[ID]
    if question.question_code and is_valid_qid(question.question_code) \
            and ("content_latex" in data or "question_code" in data):
        question.content_latex = embed_qid(question.content_latex, question.question_code)

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
    question.deleted_at = func.now()
    db.commit()
    return {"message": "Đã xóa câu hỏi thành công"}