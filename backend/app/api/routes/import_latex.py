from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Form
from pydantic import BaseModel
from uuid import UUID
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.services.latex_parser import parse_latex_file
from app.models.question import Question, QuestionType
from app.services.question_id import build_qid, embed_qid
from app.services.latex_parser import TYPE_ABBR
from app.services.duplicate_checker import find_duplicates, summarize
from app.models.question import DifficultyLevel
from app.models.import_log import ImportLog
from typing import List, Optional
import os
import json
from datetime import datetime, timedelta, timezone

LEVEL_TEXT = {"M1": "NB", "M2": "TH", "M3": "VD", "M4": "VDC"}

router = APIRouter()

@router.post("/preview-tex/")
async def preview_tex_file(file: UploadFile = File(...)):
    """Chỉ phân tích file .tex để xem trước thống kê từng câu - KHÔNG lưu vào CSDL."""
    if not file.filename or not file.filename.endswith('.tex'):
        raise HTTPException(status_code=400, detail="Chỉ chấp nhận tệp định dạng .tex")
    content = await file.read()
    try:
        text_content = content.decode('utf-8')
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="Lỗi bảng mã. Vui lòng sử dụng tệp mã hóa UTF-8.")

    parse_result = parse_latex_file(text_content, {})
    items = [{
        "stt": i,
        "question_type": q["question_type"].value,
        "question_code": q.get("question_code"),
        "answer": q.get("extracted_answer"),
    } for i, q in enumerate(parse_result["questions"], 1)]
    with_id = sum(1 for q in parse_result["questions"] if q.get("_id_from_file"))
    return {
        "total_extracted": parse_result["total_found"],
        "with_id_from_file": with_id,
        "without_id": parse_result["total_found"] - with_id,
        "items": items,
    }

@router.post("/upload-tex/")
async def upload_tex_file(
    file: UploadFile = File(...),
    metadata: str = Form(default="{}"), # Chứa lớp, chương, bài do giáo viên chọn mặc định
    db: Session = Depends(get_db)
):
    if not file.filename.endswith('.tex'):
        raise HTTPException(status_code=400, detail="Chỉ chấp nhận tệp định dạng .tex")
        
    content = await file.read()
    try:
        text_content = content.decode('utf-8')
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="Lỗi bảng mã. Vui lòng sử dụng tệp mã hóa UTF-8.")

    try:
        default_meta = json.loads(metadata)
    except:
        default_meta = {}

    # Gọi bộ phân tích
    parse_result = parse_latex_file(text_content, default_meta)
    
    # Nếu có đủ qid_grade, qid_chapter, qid_lesson (và tùy chọn qid_form) thì tự gắn ID cho từng câu:
    #   T{lớp-10}.{TN|DS|TLN|TL}.C{chương}.B{bài}[.{dạng:02d}]   → ví dụ T0.TN.C1.B3.01
    # Đoạn loại câu hỏi do hệ thống tự nhận dạng từng câu. Mức độ lưu ở cột difficulty_level.
    def _int(key):
        try:
            v = int(str(default_meta.get(key) or "").strip())
            return v if v > 0 else None
        except ValueError:
            return None

    grade, chapter_no, lesson_no, form_no = (_int("qid_grade"), _int("qid_chapter"),
                                              _int("qid_lesson"), _int("qid_form"))
    if grade is not None and not 10 <= grade <= 12:
        raise HTTPException(status_code=400, detail="Lớp phải là 10, 11 hoặc 12.")
    auto_id = grade is not None and chapter_no is not None and lesson_no is not None

    qid_level = str(default_meta.get("qid_level") or "M1").strip().upper()
    if qid_level not in ("M1", "M2", "M3", "M4"):
        qid_level = "M1"

    saved_count = 0
    # Mốc thời gian gốc: mỗi câu lệch nhau 1 micro-giây để giữ ĐÚNG thứ tự câu trong file khi hiển thị
    base_time = datetime.now(timezone.utc)
    items = []         # thống kê từng câu: STT | Loại câu hỏi | ID | Đáp án
    from_file = 0      # câu đã có sẵn ID trong file .tex
    auto_assigned = 0  # câu được gắn ID theo Lớp/Chương/Bài chọn ở form
    # Lưu vào Database
    for q_data in parse_result["questions"]:
        if q_data.pop("_id_from_file", False):
            from_file += 1            # ID trong file được ưu tiên hơn ID tự gắn
        elif auto_id:
            q_data["question_code"] = build_qid(
                TYPE_ABBR[q_data["question_type"]], qid_level, f"T{grade - 10}",
                f"C{chapter_no}", f"B{lesson_no}", f"{form_no:02d}" if form_no else None)
            q_data["content_latex"] = embed_qid(q_data["content_latex"], q_data["question_code"])
            if not q_data.get("difficulty_level"):
                q_data["difficulty_level"] = DifficultyLevel[LEVEL_TEXT[qid_level]]
            auto_assigned += 1
        items.append({
            "stt": saved_count + 1,
            "question_type": q_data["question_type"].value,
            "question_code": q_data.get("question_code"),
            "answer": q_data.get("extracted_answer"),
        })
        # Câu mới nhập KHÔNG vào ngân hàng ngay: để ở trạng thái "pending" (chờ kiểm duyệt)
        q_data["status"] = "pending"
        q_data["created_at"] = base_time + timedelta(microseconds=saved_count)
        new_question = Question(**q_data)
        db.add(new_question)
        saved_count += 1

    db.commit()

    # Ghi nhật ký nhập file (không làm hỏng việc nhập nếu ghi nhật ký gặp lỗi)
    try:
        db.add(ImportLog(filename=os.path.basename(file.filename or "") or "(không tên)", question_count=saved_count))
        db.commit()
    except Exception:  # noqa: BLE001
        db.rollback()

    # Kiểm tra trùng nội dung ngay khi nhập (không làm hỏng việc nhập nếu bộ kiểm tra gặp lỗi)
    duplicate_summary = None
    try:
        new_pending = db.query(Question).filter(Question.status == "pending").all()
        pool = db.query(Question).filter(Question.status != "archived").all()
        duplicate_summary = summarize(find_duplicates(new_pending, pool))
    except Exception:  # noqa: BLE001
        duplicate_summary = None

    return {
        "message": "Đã đưa câu hỏi vào mục chờ kiểm duyệt",
        "duplicate_summary": duplicate_summary,
        "status": "pending",
        "total_extracted": parse_result["total_found"],
        "total_saved": saved_count,
        "with_id_from_file": from_file,
        "auto_assigned": auto_assigned,
        "without_id": saved_count - from_file - auto_assigned,
        "items": items
    }


@router.get("/import-logs")
def list_import_logs(q: Optional[str] = None, skip: int = 0, limit: int = 1000,
                     db: Session = Depends(get_db)):
    """Nhật ký các file .tex đã nhập, mới nhất trước: ngày nhập, tên file, số câu."""
    query = db.query(ImportLog)
    if q:
        query = query.filter(ImportLog.filename.ilike(f"%{q}%"))
    total = query.count()
    rows = (query.order_by(ImportLog.imported_at.desc(), ImportLog.id.desc())
            .offset(max(0, skip)).limit(max(1, min(limit, 5000))).all())
    return {
        "total": total,
        "data": [
            {
                "id": str(r.id),
                "filename": r.filename,
                "question_count": r.question_count,
                "imported_at": r.imported_at.isoformat() if r.imported_at else None,
            }
            for r in rows
        ],
    }


class ImportLogDelete(BaseModel):
    ids: List[UUID] = []
    all: bool = False  # true = xóa toàn bộ nhật ký (bỏ qua ids)


@router.post("/import-logs/delete")
def delete_import_logs(body: ImportLogDelete, db: Session = Depends(get_db)):
    """Xóa dòng nhật ký nhập file (theo id, hoặc toàn bộ). Chỉ xóa nhật ký, KHÔNG ảnh hưởng câu hỏi đã nhập."""
    query = db.query(ImportLog)
    if not body.all:
        if not body.ids:
            return {"deleted": 0}
        query = query.filter(ImportLog.id.in_(body.ids))
    deleted = query.delete(synchronize_session=False)
    db.commit()
    return {"deleted": deleted}
