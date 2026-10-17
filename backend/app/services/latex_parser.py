import re
from app.models.question import QuestionType, DifficultyLevel
from app.services.question_id import parse_qid, retype_qid, embed_qid, LEVEL_MAP_TO_TEXT

# Mã loại viết tắt trong ID theo loại câu hỏi nhận dạng được từ nội dung
TYPE_ABBR = {
    QuestionType.MULTIPLE_CHOICE: "TN",
    QuestionType.TRUE_FALSE: "DS",
    QuestionType.SHORT_ANSWER: "TLN",
    QuestionType.ESSAY: "TL",
}

# Định dạng ID chuẩn: ngay sau \\begin{ex} trên cùng dòng:  \\begin{ex}%[TN.M2.T2.C1.B3.05]
# (vẫn đọc được định dạng cũ: dòng chú thích phía trên khối, ví dụ  % Câu 1 [TN.M2.T2.C1.B3.05];
#  có hoặc không có dấu [ ]; chấp nhận cả chữ thường)
_ID_TOKEN = re.compile(
    r'(?<![A-Za-z0-9.])'
    r'([A-Za-z]+\.[Mm][1-4]\.[A-Za-z0-9]+\.[Cc]\d+\.[Bb]\d+(?:\.\d+)?)'
    r'(?![A-Za-z0-9.])'
)

def _last_id_in(line: str):
    found = _ID_TOKEN.findall(line)
    return found[-1].upper() if found else None

def find_qid_for_block(text: str, block_start: int, prev_end: int):
    """
    Tìm ID đã gắn sẵn cho khối \\begin{ex} bắt đầu tại block_start. Thứ tự ưu tiên:
      1) [ĐỊNH DẠNG CHUẨN] chú thích ngay sau \\begin{ex} trên cùng dòng:  \\begin{ex}%[TN.M2.T2.C1.B3.05]
      2) [định dạng cũ, vẫn hỗ trợ] cụm dòng chú thích (%) liền trước khối (bỏ qua dòng trống).
    Chỉ tìm trong vùng giữa khối trước và khối này để không lấy nhầm ID của câu khác.
    """
    # (1) chú thích cùng dòng với \\begin{ex}
    line_end = text.find("\n", block_start)
    first_line = text[block_start: line_end if line_end != -1 else len(text)]
    pos = first_line.find("%")
    if pos != -1:
        qid = _last_id_in(first_line[pos:])
        if qid:
            return qid

    # (2) các dòng chú thích liền trước
    lines = text[prev_end:block_start].splitlines()
    i = len(lines) - 1
    while i >= 0 and not lines[i].strip():      # bỏ dòng trống sát khối
        i -= 1
    while i >= 0 and lines[i].lstrip().startswith("%"):
        qid = _last_id_in(lines[i])
        if qid:
            return qid
        i -= 1
    return None

def qid_from_raw(raw: str):
    """Đọc ID (hợp lệ) ở dòng \\begin{ex}%[ID] của một khối đã lưu; không có thì trả về None."""
    m = re.search(r"\\begin\{ex\}", raw or "")
    if not m:
        return None
    qid = find_qid_for_block(raw, m.start(), 0)
    return qid if qid and parse_qid(qid) else None

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

def _skip_ws(t: str, i: int) -> int:
    while i < len(t) and t[i].isspace():
        i += 1
    return i

def _skip_optional(t: str, i: int) -> int:
    """Bỏ qua tham số tùy chọn [...] (nếu có) ngay sau một lệnh, ví dụ \\shortans[oly]."""
    i = _skip_ws(t, i)
    if i < len(t) and t[i] == "[":
        depth = 0
        for j in range(i, len(t)):
            if t[j] == "[":
                depth += 1
            elif t[j] == "]":
                depth -= 1
                if depth == 0:
                    return j + 1
    return i

def extract_answer(raw: str, q_type: QuestionType):
    """
    Bóc đáp án từ khối \\begin{ex}...\\end{ex}; trả về None nếu chưa có dữ liệu.
      - Trắc nghiệm : chữ cái phương án có \\True            -> "B"
      - Đúng - Sai  : Đ/S cho từng ý a,b,c,d (cần ≥1 \\True) -> "Đ-S-Đ-S"
      - Trả lời ngắn: nội dung \\shortans[...]{...}          -> "-2"
      - Tự luận     : không có đáp án
    """
    if q_type in (QuestionType.MULTIPLE_CHOICE, QuestionType.TRUE_FALSE):
        m = re.search(r"\\choice(?:TF)?(?![A-Za-z])", raw)
        if not m:
            return None
        p = _skip_optional(raw, m.end())
        flags = []
        for _ in range(4):
            p = _skip_ws(raw, p)
            if p >= len(raw) or raw[p] != "{":
                break
            group, end = extract_bracket_content(raw, p)
            if group is None:
                break
            flags.append(bool(re.search(r"\\True(?![A-Za-z])", group)))
            p = end + 1
        if not any(flags):
            return None
        if q_type == QuestionType.MULTIPLE_CHOICE:
            return ", ".join("ABCD"[i] for i, f in enumerate(flags) if f)
        return "-".join("Đ" if f else "S" for f in flags)

    if q_type == QuestionType.SHORT_ANSWER:
        m = re.search(r"\\shortans(?![A-Za-z])", raw)
        if not m:
            return None
        p = _skip_ws(raw, _skip_optional(raw, m.end()))
        if p < len(raw) and raw[p] == "{":
            group, _ = extract_bracket_content(raw, p)
            if group and group.strip():
                return group.strip()
    return None

def parse_latex_file(file_content: str, default_meta: dict = None):
    """
    Nhận nội dung file .tex và trả về danh sách các câu hỏi đã được phân tích.
    """
    if default_meta is None:
        default_meta = {}

    questions_data = []
    
    # Tìm tất cả các khối \begin{ex} ... \end{ex} (Kể cả qua nhiều dòng - DOTALL)
    ex_pattern = re.compile(r'\\begin\{ex\}(.*?)\\end\{ex\}', re.DOTALL)
    
    prev_end = 0
    for match in ex_pattern.finditer(file_content):
        qid_in_file = find_qid_for_block(file_content, match.start(), prev_end)
        prev_end = match.end()
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
            "extracted_answer": extract_answer(raw_content, q_type),
            "extracted_solution": solution.strip() if solution else None,
            "difficulty_level": default_meta.get("difficulty_level"),
            "grade_level": default_meta.get("grade_level"),
            "chapter": default_meta.get("chapter"),
            "topic": default_meta.get("topic"),
            "source_material": default_meta.get("source_material")
        }
        
        # Câu đã gắn sẵn ID trong file -> dùng luôn, đồng bộ loại/mức/lớp với ID
        if qid_in_file:
            abbr = TYPE_ABBR[q_type]
            if parse_qid(qid_in_file) is None:
                qid_in_file = None
            else:
                if parse_qid(qid_in_file)["loai"] != abbr:
                    qid_in_file = retype_qid(qid_in_file, abbr)   # loại thực tế trong nội dung là chuẩn
                parts = parse_qid(qid_in_file)
                question["question_code"] = qid_in_file
                question["difficulty_level"] = DifficultyLevel[LEVEL_MAP_TO_TEXT[parts["muc"]]]
                g = re.fullmatch(r"T([0-2])", parts["lop"])
                if g:
                    question["grade_level"] = str(10 + int(g.group(1)))
                # Chuẩn hóa khối về định dạng mới:  \\begin{ex}%[ID]
                question["content_latex"] = embed_qid(raw_content, qid_in_file)
        question["_id_from_file"] = bool(qid_in_file)

        questions_data.append(question)
        
    return {
        "total_found": len(questions_data),
        "questions": questions_data
    }