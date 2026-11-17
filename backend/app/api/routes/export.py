from datetime import datetime
from typing import List, Literal, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.question import Question
from app.services.latex_exporter import generate_tex_content
from app.services.pdf_exporter import (
    MAX_EXAMS,
    MAX_QUESTIONS,
    ExamHeaderInfo,
    PdfExportError,
    compile_multi_pdf,
    compile_pdf,
    pdf_status,
)
from app.services.question_id import embed_qid

router = APIRouter()


@router.get("/exams/versions/{version_id}/export-tex", response_class=PlainTextResponse)
def export_version_tex(version_id: UUID, include_solutions: bool = False, db: Session = Depends(get_db)):
    """Xuất một mã đề thành nội dung file .tex."""
    try:
        tex = generate_tex_content(db, version_id, include_solutions)
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))
    return PlainTextResponse(
        tex,
        media_type="application/x-tex; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="de-{str(version_id)[:8]}.tex"'},
    )


class ExamHeaderIn(BaseModel):
    department: str = Field("", max_length=120)
    school: str = Field("", max_length=120)
    exam_name: str = Field("", max_length=150)
    school_year: str = Field("", max_length=50)
    subject: str = Field("", max_length=80)
    grade: str = Field("", max_length=30)
    duration: str = Field("", max_length=50)
    exam_code: str = Field("101", max_length=20)


class PdfExportIn(BaseModel):
    ids: List[UUID] = Field(min_length=1, max_length=MAX_QUESTIONS)  # theo đúng thứ tự cần in
    title: str = Field("Câu hỏi được chọn", max_length=200)
    show_answers: bool = False       # tô đậm / đỏ đáp án đúng
    include_solutions: bool = False  # in kèm lời giải
    show_ids: bool = False           # in mã ID nhỏ cạnh số câu
    group_by_type: bool = True       # phân chia PHẦN I, II, III, IV theo loại câu hỏi
    doc_type: Literal["exercise", "exam"] = "exercise"
    exam_header: Optional[ExamHeaderIn] = None
    num_exams: int = Field(1, ge=1, le=MAX_EXAMS)
    shuffle: bool = False


@router.post("/export/questions-pdf")
def export_questions_pdf(body: PdfExportIn, db: Session = Depends(get_db)):
    """Biên dịch các câu hỏi được chọn thành file PDF (TeX Live + ex_test.sty)."""
    seen, ordered_ids = set(), []
    for i in body.ids:  # bỏ trùng nhưng giữ nguyên thứ tự
        if i not in seen:
            seen.add(i)
            ordered_ids.append(i)
    by_id = {q.id: q for q in db.query(Question).filter(Question.id.in_(ordered_ids)).all()}
    items = []
    for i in ordered_ids:
        q = by_id.get(i)
        if q is None or not (q.content_latex or "").strip():
            continue
        content = embed_qid(q.content_latex, q.question_code) if q.question_code else q.content_latex
        qtype = q.question_type.value if q.question_type else None
        items.append((q.question_code or "", content, qtype))
    if not items:
        raise HTTPException(status_code=404, detail="Không tìm thấy câu hỏi nào để xuất.")

    hdr = ExamHeaderInfo(**body.exam_header.model_dump()) if body.exam_header else None
    try:
        if body.num_exams > 1:
            zip_bytes = compile_multi_pdf(
                items,
                num_exams=body.num_exams,
                title=body.title.strip(),
                show_answers=body.show_answers,
                include_solutions=body.include_solutions,
                show_ids=body.show_ids,
                group_by_type=body.group_by_type,
                doc_type=body.doc_type,
                exam_header=hdr,
            )
            filename = f"bo-de-thi-{datetime.now():%Y%m%d-%H%M}.zip"
            return Response(
                zip_bytes,
                media_type="application/zip",
                headers={"Content-Disposition": f'attachment; filename="{filename}"'},
            )

        pdf = compile_pdf(
            items,
            title=body.title.strip(),
            show_answers=body.show_answers,
            include_solutions=body.include_solutions,
            show_ids=body.show_ids,
            group_by_type=body.group_by_type,
            doc_type=body.doc_type,
            exam_header=hdr,
            shuffle_questions=body.shuffle,
            shuffle_choices=body.shuffle,
        )
    except PdfExportError as e:
        raise HTTPException(status_code=e.status, detail=e.message)
    filename = f"cau-hoi-{datetime.now():%Y%m%d-%H%M}.pdf"
    return Response(
        pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/export/pdf-status")
def export_pdf_status():
    """Kiểm tra máy chủ đã sẵn sàng biên dịch PDF chưa (pdflatex, gói tiếng Việt...)."""
    return pdf_status()
