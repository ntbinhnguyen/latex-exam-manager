from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.core.database import get_db
from app.models.question import Question

router = APIRouter()

@router.get("/dashboard/summary")
def get_statistics(db: Session = Depends(get_db)):
    """Trả về thống kê tổng hợp cho Dashboard."""
    
    # 1. Đếm tổng số câu theo trạng thái
    total_active = db.query(Question).filter(Question.status == "active").count()
    total_archived = db.query(Question).filter(Question.status == "archived").count()
    
    # 2. Thống kê theo Loại câu hỏi (Chỉ tính active)
    type_stats = db.query(
        Question.question_type, func.count(Question.id)
    ).filter(Question.status == "active").group_by(Question.question_type).all()
    
    # 3. Thống kê theo Mức độ (Chỉ tính active)
    difficulty_stats = db.query(
        Question.difficulty_level, func.count(Question.id)
    ).filter(Question.status == "active").group_by(Question.difficulty_level).all()
    
    # 4. Thống kê kết hợp 2 chiều (Loại câu hỏi x Mức độ)
    cross_stats_query = db.query(
        Question.question_type,
        Question.difficulty_level,
        func.count(Question.id)
    ).filter(Question.status == "active").group_by(
        Question.question_type, Question.difficulty_level
    ).all()
    
    # Chuyển đổi dữ liệu thô thành bảng ma trận 2 chiều cho Frontend dễ render
    cross_table = {}
    for q_type, q_diff, count in cross_stats_query:
        type_name = q_type.value if q_type else "Chưa phân loại"
        diff_name = q_diff.value if q_diff else "Chưa phân loại"
        
        if type_name not in cross_table:
            cross_table[type_name] = {"NB": 0, "TH": 0, "VD": 0, "VDC": 0, "Tổng": 0}
            
        if diff_name in cross_table[type_name]:
            cross_table[type_name][diff_name] = count
            cross_table[type_name]["Tổng"] += count

    return {
        "overview": {
            "active": total_active,
            "archived": total_archived
        },
        "by_type": {k.value: v for k, v in type_stats if k},
        "by_difficulty": {k.value: v for k, v in difficulty_stats if k},
        "matrix_table": cross_table
    }