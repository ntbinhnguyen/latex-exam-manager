import random
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.exam import ExamMatrix, MatrixCell, ExamConfig, ExamVersion, ExamQuestion
from app.models.question import Question

def check_matrix_feasibility(db: Session, matrix_id: str):
    """
    Kiểm tra xem ngân hàng câu hỏi có đủ đáp ứng ma trận không.
    Trả về danh sách các ô ma trận cùng số lượng khả dụng và cảnh báo nếu thiếu.
    """
    matrix = db.query(ExamMatrix).filter(ExamMatrix.id == matrix_id).first()
    if not matrix:
        raise Exception("Không tìm thấy ma trận")

    feasibility_report = []
    is_feasible = True

    for cell in matrix.cells:
        # Build query dựa trên điều kiện của ô ma trận
        query = db.query(Question).filter(
            Question.status == "active",
            Question.question_type == cell.question_type,
            Question.difficulty_level == cell.difficulty_level
        )
        if cell.chapter:
            query = query.filter(Question.chapter == cell.chapter)
        if cell.topic:
            query = query.filter(Question.topic == cell.topic)
            
        available_count = query.count()
        
        status = "OK" if available_count >= cell.required_count else "THIẾU CÂU HỎI"
        if available_count < cell.required_count:
            is_feasible = False

        feasibility_report.append({
            "cell_id": str(cell.id),
            "topic": cell.topic,
            "type": cell.question_type.value,
            "difficulty": cell.difficulty_level.value,
            "required": cell.required_count,
            "available": available_count,
            "status": status,
            "missing": max(0, cell.required_count - available_count)
        })

    return {
        "is_feasible": is_feasible,
        "report": feasibility_report
    }

def generate_exam_versions(db: Session, config_id: str):
    """
    Thuật toán sinh đề: Rút ngẫu nhiên câu hỏi theo đúng ma trận.
    """
    config = db.query(ExamConfig).filter(ExamConfig.id == config_id).first()
    matrix = db.query(ExamMatrix).filter(ExamMatrix.id == config.matrix_id).first()
    
    # 1. Bắt buộc kiểm tra tính khả thi trước khi sinh (Rule: Không tự ý sinh đề lỗi)
    feasibility = check_matrix_feasibility(db, matrix.id)
    if not feasibility["is_feasible"]:
        raise Exception("Ngân hàng không đủ câu hỏi để đáp ứng ma trận. Vui lòng bổ sung hoặc sửa ma trận.")

    used_question_ids = set() # Dùng để track nếu không cho phép trùng câu giữa các mã đề
    
    # 2. Bắt đầu sinh từng mã đề
    for i in range(config.number_of_versions):
        version_code = f"10{i+1}" # Ví dụ: 101, 102
        new_version = ExamVersion(exam_config_id=config.id, version_code=version_code)
        db.add(new_version)
        db.flush() # Lấy được ID của new_version
        
        selected_questions_for_this_version = []

        for cell in matrix.cells:
            # Query lấy các câu hỏi thỏa mãn điều kiện
            query = db.query(Question).filter(
                Question.status == "active",
                Question.question_type == cell.question_type,
                Question.difficulty_level == cell.difficulty_level
            )
            if cell.chapter:
                query = query.filter(Question.chapter == cell.chapter)
            if cell.topic:
                query = query.filter(Question.topic == cell.topic)
                
            # Nếu không cho phép trùng lặp, loại trừ các câu đã dùng ở mã đề trước
            if not config.allow_duplicates and used_question_ids:
                query = query.filter(~Question.id.in_(used_question_ids))

            # Lấy toàn bộ ID thỏa mãn để random
            available_qs = query.all()
            if len(available_qs) < cell.required_count:
                # Fallback an toàn, lý thuyết không xảy ra nếu check feasibility đúng
                raise Exception(f"Lỗi khi sinh mã đề {version_code}: Thiếu câu hỏi ở chủ đề {cell.topic}.")
            
            # Chọn ngẫu nhiên số lượng câu yêu cầu
            chosen_qs = random.sample(available_qs, cell.required_count)
            selected_questions_for_this_version.extend(chosen_qs)
            
            for q in chosen_qs:
                used_question_ids.add(q.id)

        # 3. Xáo trộn thứ tự câu hỏi trong toàn bộ đề
        random.shuffle(selected_questions_for_this_version)
        
        # 4. Ghi vào database (Lưu lại thứ tự)
        for index, q in enumerate(selected_questions_for_this_version):
            exam_q = ExamQuestion(
                exam_version_id=new_version.id,
                question_id=q.id,
                order_index=index + 1
            )
            db.add(exam_q)

    db.commit()
    return {"message": f"Đã sinh thành công {config.number_of_versions} mã đề."}