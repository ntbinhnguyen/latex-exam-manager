from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.services.latex_exporter import generate_tex_content

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
