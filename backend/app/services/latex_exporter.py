from sqlalchemy.orm import Session
from app.models.exam import ExamVersion, ExamQuestion
from app.models.question import Question

def generate_tex_content(db: Session, version_id, include_solutions: bool = True) -> str:
    """
    Tạo nội dung tệp .tex cho một mã đề cụ thể.
    """
    version = db.query(ExamVersion).filter(ExamVersion.id == version_id).first()
    if not version:
        raise Exception("Không tìm thấy mã đề.")

    # 1. Phần khai báo tài liệu (Preamble)
    # Cấu hình mặc định tương thích với cấu trúc của De 1010.tex
    preamble = r"""\documentclass[12pt,a4paper]{article}
\usepackage[utf8]{vietnam}
\usepackage{amsmath,amssymb}
\usepackage{tikz}
\usepackage{geometry}
\geometry{top=2cm, bottom=2cm, left=2cm, right=2cm}

% Định nghĩa các lệnh tương thích với cấu trúc gốc
\newenvironment{ex}{\vspace{0.5cm}\noindent\textbf{Câu:}}{\vspace{0.2cm}}
\newcommand{\choice}[4]{
    \begin{tabular}{p{0.23\textwidth}p{0.23\textwidth}p{0.23\textwidth}p{0.23\textwidth}}
        A. #1 & B. #2 & C. #3 & D. #4 \\
    \end{tabular}
}
\newcommand{\choiceTF}[4]{
    \begin{itemize}
        \item a) #1
        \item b) #2
        \item c) #3
        \item d) #4
    \end{itemize}
}
\newcommand{\shortans}[2][]{ \textbf{Đáp án:} \dotfill }
\newcommand{\True}{} % Đánh dấu đáp án đúng ẩn đi trong bản in đề
"""

    # 2. Xử lý phần Lời giải
    if include_solutions:
        # Nếu in lời giải, định nghĩa lại lệnh \loigiai
        preamble += r"\newcommand{\loigiai}[1]{\par\noindent\textit{\textbf{Lời giải:}} #1}" + "\n"
    else:
        # Nếu không in lời giải, nuốt (bỏ qua) nội dung bên trong lệnh \loigiai
        preamble += r"\newcommand{\loigiai}[1]{}" + "\n"

    # 3. Phần tiêu đề đề thi
    document_start = rf"""
\begin{{document}}
\begin{{center}}
    \textbf{{\Large ĐỀ THI KIỂM TRA}} \\
    \vspace{{0.2cm}}
    \textbf{{Mã đề: {version.version_code}}}
\end{{center}}
\vspace{{0.5cm}}
"""
    
    document_end = r"\end{document}"
    
    # 4. Truy xuất và ghép nối nội dung câu hỏi
    # Lấy danh sách câu hỏi đã được xáo trộn thứ tự theo order_index từ Giai đoạn 3
    exam_questions = db.query(ExamQuestion).filter(
        ExamQuestion.exam_version_id == version_id
    ).order_by(ExamQuestion.order_index).all()
    
    questions_content = ""
    for eq in exam_questions:
        q = db.query(Question).filter(Question.id == eq.question_id).first()
        
        # Lấy nguyên vẹn nội dung LaTeX đã lưu trong DB (bao gồm \begin{ex}...\end{ex})
        content = q.content_latex
        
        # Lưu ý: Thuật toán xáo trộn phương án A,B,C,D (hoán đổi vị trí bên trong lệnh \choice) 
        # sẽ được chèn thêm tại bước này bằng Regex trước khi cộng chuỗi, 
        # nhưng vẫn giữ nguyên lệnh \True ở vị trí tương ứng.
        
        questions_content += content + "\n\n"
        
    # 5. Lắp ráp tài liệu hoàn chỉnh
    full_tex = preamble + document_start + questions_content + document_end
    
    return full_tex