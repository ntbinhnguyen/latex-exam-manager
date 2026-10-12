from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.exam import ExamMatrix, MatrixCell, ExamConfig, ExamVersion
from app.models.question import QuestionType, DifficultyLevel
from app.services.exam_generator import check_matrix_feasibility, generate_exam_versions

router = APIRouter()


class CellIn(BaseModel):
    chapter: Optional[str] = None
    topic: Optional[str] = None
    question_type: QuestionType
    difficulty_level: DifficultyLevel
    required_count: int


class MatrixIn(BaseModel):
    name: str
    grade_level: Optional[str] = None
    cells: List[CellIn]


class ConfigIn(BaseModel):
    matrix_id: UUID
    name: str
    number_of_versions: int = 1
    allow_duplicates: bool = False


@router.get("/matrices")
def list_matrices(db: Session = Depends(get_db)):
    rows = db.query(ExamMatrix).order_by(ExamMatrix.created_at.desc()).all()
    return [{"id": str(m.id), "name": m.name, "grade_level": m.grade_level,
             "total_questions": m.total_questions, "cells": len(m.cells)} for m in rows]


@router.post("/matrices")
def create_matrix(data: MatrixIn, db: Session = Depends(get_db)):
    if not data.cells:
        raise HTTPException(status_code=400, detail="Ma trận cần ít nhất 1 ô.")
    matrix = ExamMatrix(name=data.name, grade_level=data.grade_level,
                        total_questions=sum(c.required_count for c in data.cells))
    for c in data.cells:
        matrix.cells.append(MatrixCell(**c.model_dump()))
    db.add(matrix)
    db.commit()
    db.refresh(matrix)
    return {"id": str(matrix.id), "total_questions": matrix.total_questions}


@router.get("/matrix/{matrix_id}/check-feasibility")
def api_check_feasibility(matrix_id: UUID, db: Session = Depends(get_db)):
    """Kiểm tra ma trận có khả thi không trước khi sinh đề"""
    try:
        return check_matrix_feasibility(db, matrix_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/configs")
def create_config(data: ConfigIn, db: Session = Depends(get_db)):
    cfg = ExamConfig(matrix_id=data.matrix_id, name=data.name,
                     number_of_versions=data.number_of_versions,
                     allow_duplicates=data.allow_duplicates)
    db.add(cfg)
    db.commit()
    db.refresh(cfg)
    return {"id": str(cfg.id)}


@router.post("/generate/{config_id}")
def api_generate_exam(config_id: UUID, db: Session = Depends(get_db)):
    """Kích hoạt thuật toán sinh đề"""
    try:
        return generate_exam_versions(db, config_id)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/configs/{config_id}/versions")
def list_versions(config_id: UUID, db: Session = Depends(get_db)):
    rows = db.query(ExamVersion).filter(ExamVersion.exam_config_id == config_id).order_by(ExamVersion.version_code).all()
    return [{"id": str(v.id), "version_code": v.version_code, "question_count": len(v.questions)} for v in rows]
