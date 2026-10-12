from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Form
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.services.latex_parser import parse_latex_file
from app.models.question import Question, QuestionType
from app.services.question_id import build_qid
import json

router = APIRouter()

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

    saved_count = 0
    # Lưu vào Database
    for q_data in parse_result["questions"]:
        if auto_id:
            q_data["question_code"] = build_qid(grade, chapter_no, lesson_no, form_no, q_data["question_type"])
        new_question = Question(**q_data)
        db.add(new_question)
        saved_count += 1
        
    db.commit()
    
    return {
        "message": "Nhập dữ liệu thành công",
        "total_extracted": parse_result["total_found"],
        "total_saved": saved_count
    }