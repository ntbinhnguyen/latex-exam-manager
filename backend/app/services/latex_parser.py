import re
from app.models.question import QuestionType

def extract_bracket_content(text: str, start_index: int):
    """Trích xuất nội dung bên trong cặp ngoặc nhọn {...} có tính đến ngoặc lồng nhau."""
    count = 0
    for i in range(start_index, len(text)):
        if text[i] == '{':
            count += 1
        elif text[i] == '}':
            count -= 1
            if count == 0:
                return text[start_index+1:i], i
    return None, -1

def determine_question_type(content: str) -> QuestionType:
    """Xác định loại câu hỏi dựa vào các lệnh LaTeX bên trong."""
    if r"\choiceTF" in content:
        return QuestionType.TRUE_FALSE
    elif r"\choice" in content:
        return QuestionType.MULTIPLE_CHOICE
    elif r"\shortans" in content:
        return QuestionType.SHORT_ANSWER
    else:
        return QuestionType.ESSAY

def parse_latex_file(file_content: str, default_meta: dict = None):
    """
    Nhận nội dung file .tex và trả về danh sách các câu hỏi đã được phân tích.
    """
    if default_meta is None:
        default_meta = {}

    questions_data = []
    
    # Tìm tất cả các khối \begin{ex} ... \end{ex} (Kể cả qua nhiều dòng - DOTALL)
    ex_pattern = re.compile(r'\\begin\{ex\}(.*?)\\end\{ex\}', re.DOTALL)
    
    for match in ex_pattern.finditer(file_content):
        raw_content = match.group(0)
        inner_content = match.group(1)
        
        q_type = determine_question_type(raw_content)
        
        # Bóc tách lời giải (\loigiai{...}) bằng thuật toán đếm ngoặc
        solution = None
        loigiai_idx = raw_content.find(r"\loigiai")
        if loigiai_idx != -1:
            bracket_start = raw_content.find("{", loigiai_idx)
            if bracket_start != -1:
                solution, _ = extract_bracket_content(raw_content, bracket_start)

        # Xây dựng data câu hỏi
        question = {
            "content_latex": raw_content,
            "question_type": q_type,
            "extracted_solution": solution.strip() if solution else None,
            "difficulty_level": default_meta.get("difficulty_level"),
            "grade_level": default_meta.get("grade_level"),
            "chapter": default_meta.get("chapter"),
            "topic": default_meta.get("topic"),
            "source_material": default_meta.get("source_material")
        }
        
        questions_data.append(question)
        
    return {
        "total_found": len(questions_data),
        "questions": questions_data
    }