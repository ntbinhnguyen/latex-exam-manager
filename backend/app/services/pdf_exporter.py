"""Biên dịch các câu hỏi được chọn thành file PDF bằng TeX Live (pdflatex) với gói ex_test.sty.

- Hỗ trợ 3 chế độ chuẩn của ex_test.sty:
  + dethi   : Chỉ in đề (không đáp án, không lời giải)
  + color   : Đề + Đáp án (tô vàng viền đỏ phương án đúng, chữ đỏ)
  + solcolor: Đáp án + Lời giải (kèm "Lời giải." căn giữa màu xanh và "Chọn đáp án ... □")
  (+ loigiai nếu bật lời giải nhưng tắt tô đáp án)
- Hỗ trợ 2 kiểu đầu trang:
  + exercise: Bài tập (tiêu đề căn giữa hoặc bỏ trống)
  + exam    : Bài kiểm tra (Sở, Trường, Đề chính thức, Số trang, Tên kỳ thi, Năm học, Môn, Khối, Thời gian, Họ tên, SBD, Mã đề)
- Hỗ trợ xáo trộn câu hỏi trong từng phần và xáo trộn 4 phương án A, B, C, D của câu trắc nghiệm (\\choice),
  cũng như xuất nhiều mã đề cùng lúc thành file .zip.
- Font Palatino (mathpazo) + tiếng Việt (vietnam) + tkz-tab, giống định dạng đề thi chuẩn.
- Khi lỗi: chỉ ra câu hỏi nào làm hỏng quá trình biên dịch (đánh dấu @@Q n trong log).
"""
import io
import random
import re
import shutil
import subprocess
import tempfile
import threading
import zipfile
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

MAX_QUESTIONS = 300
MAX_EXAMS = 20
COMPILE_TIMEOUT = 120  # giây
_SLOTS = threading.BoundedSemaphore(2)  # tối đa 2 lần biên dịch cùng lúc để không quá tải máy
EX_TEST_STY = Path(__file__).with_name("ex_test.sty")

# Chặn các lệnh đọc/ghi file khi biên dịch nội dung do người dùng nhập.
FORBIDDEN = re.compile(r"\\(?:write|immediate|openin|openout|input|include|read|catcode)(?![A-Za-z])")

SECTION_ORDER: Tuple[str, ...] = (
    "Trắc nghiệm nhiều lựa chọn",
    "Đúng - Sai",
    "Trả lời ngắn",
    "Tự luận",
)

SECTION_META: Dict[str, Tuple[str, str]] = {
    "Trắc nghiệm nhiều lựa chọn": (
        "Câu trắc nghiệm nhiều phương án lựa chọn.",
        "Học sinh trả lời {range}. Mỗi câu hỏi học sinh chỉ chọn một phương án.",
    ),
    "Đúng - Sai": (
        "Câu trắc nghiệm đúng sai.",
        "Học sinh trả lời {range}. Trong mỗi ý a), b), c), d) ở mỗi câu, học sinh chọn đúng hoặc sai.",
    ),
    "Trả lời ngắn": (
        "Câu trắc nghiệm trả lời ngắn.",
        "Học sinh trả lời {range}.",
    ),
    "Tự luận": (
        "Câu hỏi tự luận.",
        "Học sinh trả lời {range}.",
    ),
}

ROMAN_NUMERALS = ("I", "II", "III", "IV", "V", "VI")


@dataclass
class ExamHeaderInfo:
    department: str = ""
    school: str = ""
    exam_name: str = ""
    school_year: str = ""
    subject: str = ""
    grade: str = ""
    duration: str = ""
    exam_code: str = ""


class PdfExportError(Exception):
    """Lỗi biên dịch có thông tin dễ hiểu cho người dùng."""

    def __init__(self, message: str, status: int = 422):
        super().__init__(message)
        self.message = message
        self.status = status


def _ex_test_option(show_answers: bool, include_solutions: bool) -> str:
    if show_answers and include_solutions:
        return "solcolor"
    if show_answers:
        return "color"
    if include_solutions:
        return "loigiai"
    return "dethi"


def _build_preamble(option: str, include_lastpage: bool = False) -> str:
    lastpage_pkg = "\\usepackage{lastpage}\n" if include_lastpage else ""
    margin = "1.8cm" if include_lastpage else "2cm"
    return rf"""\documentclass[12pt,a4paper]{{article}}
\usepackage[utf8]{{vietnam}}
\usepackage{{amsmath,amssymb,mathtools}}
\usepackage{{xcolor,graphicx,array,multirow,enumitem,cancel}}
\usepackage{{tikz,pgfplots,tkz-tab}}
\pgfplotsset{{compat=newest}}
\usetikzlibrary{{arrows.meta,calc,angles,quotes,intersections,positioning,patterns,
  decorations.pathreplacing,shapes.geometric,3d}}
\usepackage{{mathpazo}}
{lastpage_pkg}\usepackage[top={margin},bottom={margin},left={margin},right={margin}]{{geometry}}
\usepackage[{option}]{{ex_test}}
\renewcommand{{\nameex}}{{\color{{blue}}Câu}}
\setlength{{\parindent}}{{0pt}}
\setlength{{\parskip}}{{3pt}}
\setlist{{nosep}}
\raggedbottom
\providecommand{{\heva}}[1]{{\left\{{\begin{{aligned}}#1\end{{aligned}}\right.}}
\providecommand{{\hoac}}[1]{{\left[\begin{{aligned}}#1\end{{aligned}}\right.}}
"""


def escape_tex(s: str) -> str:
    """Thoát ký tự đặc biệt của LaTeX trong văn bản thường (tiêu đề...)."""
    table = {
        "\\": r"\textbackslash{}", "&": r"\&", "%": r"\%", "$": r"\$", "#": r"\#",
        "_": r"\_", "{": r"\{", "}": r"\}", "~": r"\textasciitilde{}", "^": r"\textasciicircum{}",
    }
    return "".join(table.get(ch, ch) for ch in s)


def _unpack_item(it: tuple) -> Tuple[str, str, Optional[str]]:
    if len(it) >= 3:
        return it[0] or "", it[1] or "", it[2]
    return it[0] or "", it[1] or "", None


def _skip_ws_and_comments(text: str, pos: int) -> int:
    n = len(text)
    while pos < n:
        ch = text[pos]
        if ch in " \t\r\n":
            pos += 1
        elif ch == "%":
            nl = text.find("\n", pos)
            pos = n if nl == -1 else nl + 1
        else:
            break
    return pos


def _read_braced_group(text: str, pos: int) -> Optional[Tuple[int, int, str]]:
    """Đọc 1 nhóm {...} cân bằng ngoặc (bỏ qua \\{, \\} và comment %)."""
    pos = _skip_ws_and_comments(text, pos)
    if pos >= len(text) or text[pos] != "{":
        return None
    start = pos
    depth = 0
    i = pos
    n = len(text)
    while i < n:
        ch = text[i]
        if ch == "\\":
            i += 2
            continue
        if ch == "%":
            nl = text.find("\n", i)
            i = n if nl == -1 else nl + 1
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return start, i + 1, text[start + 1 : i]
        i += 1
    return None


def shuffle_choice_options(content: str, rng: random.Random) -> str:
    """Xáo trộn 4 phương án A, B, C, D trong lệnh \\choice (không đụng \\choiceTF)."""
    m = re.search(r"\\choice(?![A-Za-z])", content)
    if not m:
        return content

    pos = _skip_ws_and_comments(content, m.end())
    # Bỏ qua tham số tùy chọn [...] nếu có (vd: \choice[2])
    if pos < len(content) and content[pos] == "[":
        close = content.find("]", pos + 1)
        if close != -1:
            pos = close + 1

    groups: List[Tuple[int, int, str]] = []
    cur = pos
    for _ in range(4):
        grp = _read_braced_group(content, cur)
        if grp is None:
            return content  # Không đủ 4 phương án hợp lệ -> giữ nguyên
        groups.append(grp)
        cur = grp[1]

    inners = [g[2] for g in groups]
    rng.shuffle(inners)

    # Ghép lại, giữ nguyên khoảng trắng/xuống dòng giữa các nhóm
    parts: List[str] = [content[: groups[0][0]]]
    for idx, (s, e, _) in enumerate(groups):
        if idx > 0:
            parts.append(content[groups[idx - 1][1] : s])
        parts.append("{" + inners[idx] + "}")
    parts.append(content[groups[-1][1] :])
    return "".join(parts)


def _prepare_question_tex(code: str, content: str, show_ids: bool) -> str:
    text = content.strip()
    if r"\begin{ex}" not in text:
        text = f"\\begin{{ex}}\n{text}\n\\end{{ex}}"
    if show_ids and code:
        badge = rf"{{\scriptsize\color{{gray}}[{escape_tex(code)}]}}\ "
        m = re.match(r"([^\n]*\\begin\{ex\}(?:\[[^\]]*\])?(?:%[^\n]*)?\n?)", text)
        if m:
            text = text[: m.end()] + badge + text[m.end() :]
        else:
            text = badge + text
    return text


def _section_header(roman: str, qtype: str, count: int) -> str:
    heading, hint_tpl = SECTION_META.get(qtype, (f"{qtype}.", "Học sinh trả lời {range}."))
    q_range = "câu 1" if count == 1 else f"từ câu 1 đến câu {count}"
    hint = hint_tpl.format(range=q_range)
    return (
        "\\setcounter{ex}{0}\n"
        f"\\noindent\\textbf{{PHẦN {roman}. {heading}}}\\\\\n"
        f"\\textit{{\\hspace*{{1.5em}}{hint}}}\n"
    )


def _build_exam_header(info: ExamHeaderInfo) -> str:
    dept = escape_tex(info.department.strip().upper())
    school = escape_tex(info.school.strip().upper())
    exam_name = escape_tex(info.exam_name.strip().upper())
    school_year = escape_tex(info.school_year.strip().upper())
    subject = escape_tex(info.subject.strip().upper())
    grade = escape_tex(info.grade.strip().upper())
    duration = escape_tex(info.duration.strip())
    exam_code = escape_tex(info.exam_code.strip())

    left_lines: List[str] = []
    if dept:
        left_lines.append(dept + r"\\")
    if school:
        left_lines.append(rf"\textbf{{{school}}}\\")
    left_lines.append(r"\vspace{2pt}")
    left_lines.append(r"\fbox{\textbf{ĐỀ CHÍNH THỨC}}\\ ")
    left_lines.append(r"\vspace{2pt}")
    left_lines.append(r"\textit{(Đề gồm có \pageref{LastPage} trang)}")

    title_parts = [p for p in (exam_name, f"NĂM HỌC {school_year}" if school_year else "") if p]
    line1 = " - ".join(title_parts) or "ĐỀ KIỂM TRA"

    meta_parts = [p for p in (f"MÔN: {subject}" if subject else "", f"LỚP: {grade}" if grade else "") if p]
    line2 = " - ".join(meta_parts)

    right_lines: List[str] = [rf"\textbf{{{line1}}}\\"]
    if line2:
        right_lines.append(rf"\textbf{{{line2}}}\\")
    if duration:
        right_lines.append(rf"\textbf{{Thời gian làm bài: {duration}}} \textit{{(Không kể thời gian phát đề)}}")

    code_box = rf"\hfill\fbox{{\textbf{{Mã đề: {exam_code}}}}}" if exam_code else ""
    sbd_width = "0.66\\linewidth" if exam_code else "0.80\\linewidth"

    return (
        "\\noindent\n"
        "\\begin{minipage}[t]{0.38\\linewidth}\n"
        "  \\centering\n"
        + "\n".join(f"  {ln}" for ln in left_lines)
        + "\n\\end{minipage}%\n"
        "\\hfill\n"
        "\\begin{minipage}[t]{0.60\\linewidth}\n"
        "  \\centering\n"
        + "\n".join(f"  {ln}" for ln in right_lines)
        + "\n\\end{minipage}\n\n"
        "\\vspace{8pt}\n"
        "\\noindent\\textbf{-Họ và tên:} \\makebox[0.72\\linewidth]{\\dotfill}\\par\n"
        "\\vspace{2pt}\n"
        f"\\noindent\\textbf{{-Số báo danh:}} \\makebox[{sbd_width}]{{\\dotfill}}{code_box}\\par\n"
        "\\vspace{3pt}\n"
        "\\noindent\\rule{\\linewidth}{0.6pt}\n"
        "\\vspace{6pt}\n"
    )


def build_tex(
    items: Sequence[tuple],  # (mã ID, nội dung LaTeX[, loại câu hỏi]) theo thứ tự cần in
    title: str,
    show_answers: bool,
    include_solutions: bool,
    show_ids: bool,
    group_by_type: bool = True,
    doc_type: str = "exercise",
    exam_header: Optional[ExamHeaderInfo] = None,
    shuffle_questions: bool = False,
    shuffle_choices: bool = False,
    seed: Optional[int] = None,
) -> str:
    is_exam = doc_type == "exam"
    option = _ex_test_option(show_answers, include_solutions)
    preamble = _build_preamble(option, include_lastpage=is_exam)
    rng = random.Random(seed)

    if is_exam:
        head = "\\begin{document}\n" + _build_exam_header(exam_header or ExamHeaderInfo())
    else:
        clean_title = (title or "").strip()
        if clean_title:
            note = "kèm đáp án và lời giải" if (show_answers and include_solutions) else (
                "kèm đáp án" if show_answers else ("kèm lời giải" if include_solutions else "")
            )
            sub = f"{len(items)} câu hỏi" + (f" – {note}" if note else "") + f" – xuất ngày {datetime.now():%d/%m/%Y}"
            head = (
                "\\begin{document}\n"
                "\\begin{center}\n"
                f"  {{\\large\\bfseries {escape_tex(clean_title)}}}\\\\[3pt]\n"
                f"  {{\\small {escape_tex(sub)}}}\n"
                "\\end{center}\n\\vspace{2pt}\\hrule\\vspace{6pt}\n"
            )
        else:
            head = "\\begin{document}\n"

    unpacked = [(_unpack_item(it), idx) for idx, it in enumerate(items, start=1)]
    has_types = group_by_type and any(qtype in SECTION_META for (_, _, qtype), _ in unpacked)

    def render_question(code: str, content: str, qtype: Optional[str]) -> str:
        c = content
        if shuffle_choices and (qtype == "Trắc nghiệm nhiều lựa chọn" or qtype is None):
            c = shuffle_choice_options(c, rng)
        return _prepare_question_tex(code, c, show_ids)

    body: List[str] = []
    if has_types:
        grouped: Dict[str, List[Tuple[Tuple[str, str, Optional[str]], int]]] = {}
        for item, orig_idx in unpacked:
            _, _, qtype = item
            key = qtype if qtype in SECTION_META else "Khác"
            grouped.setdefault(key, []).append((item, orig_idx))

        ordered_keys = [k for k in SECTION_ORDER if k in grouped]
        if "Khác" in grouped:
            ordered_keys.append("Khác")

        for sec_idx, key in enumerate(ordered_keys):
            sec_items = list(grouped[key])
            if shuffle_questions:
                rng.shuffle(sec_items)
            if sec_idx > 0:
                body.append("\\vspace{4pt}")
            if key in SECTION_META:
                roman = ROMAN_NUMERALS[sec_idx] if sec_idx < len(ROMAN_NUMERALS) else str(sec_idx + 1)
                body.append(_section_header(roman, key, len(sec_items)))
            for (code, content, qtype), orig_idx in sec_items:
                q_tex = render_question(code, content, qtype)
                body.append(f"\\typeout{{@@Q {orig_idx}}}\n{q_tex}\n")
    else:
        seq = list(unpacked)
        if shuffle_questions:
            rng.shuffle(seq)
        for (code, content, qtype), orig_idx in seq:
            q_tex = render_question(code, content, qtype)
            body.append(f"\\typeout{{@@Q {orig_idx}}}\n{q_tex}\n")

    return preamble + head + "\n".join(body) + "\n\\end{document}\n"


def _explain_log(log: str, items: Sequence[tuple]) -> str:
    """Rút gọn log lỗi của TeX và chỉ ra câu hỏi gây lỗi."""
    lines = log.splitlines()
    err = next((i for i, ln in enumerate(lines) if ln.startswith("!")), None)
    if err is None:
        return "Không rõ nguyên nhân (không đọc được log của TeX)."
    detail = "\n".join(ln for ln in lines[err : err + 5] if ln.strip())[:700]
    qn = None
    for ln in reversed(lines[:err]):
        m = re.match(r"@@Q (\d+)", ln)
        if m:
            qn = int(m.group(1))
            break
    if qn is None:
        where = "Lỗi ở phần khai báo (có thể thiếu gói LaTeX trên máy chủ)."
    else:
        code = items[qn - 1][0] if 0 < qn <= len(items) else ""
        where = f"Lỗi ở câu thứ {qn} trong danh sách xuất" + (f" (ID: {code})" if code else "") + "."
    return f"{where}\n{detail}"


def _validate_inputs(items: Sequence[tuple]) -> None:
    if not items:
        raise PdfExportError("Không có câu hỏi nào để xuất.", 400)
    if len(items) > MAX_QUESTIONS:
        raise PdfExportError(f"Mỗi lần chỉ xuất tối đa {MAX_QUESTIONS} câu (đang chọn {len(items)} câu).", 400)
    if not EX_TEST_STY.exists():
        raise PdfExportError("Máy chủ thiếu gói ex_test.sty để biên dịch PDF.", 500)

    for i, it in enumerate(items, start=1):
        code, content, _ = _unpack_item(it)
        if FORBIDDEN.search(content):
            raise PdfExportError(
                f"Câu thứ {i}" + (f" (ID: {code})" if code else "")
                + " chứa lệnh không được phép khi biên dịch (\\write, \\input, \\openin…).")


def _run_pdflatex(tex: str, items: Sequence[tuple], passes: int = 1) -> bytes:
    with _SLOTS, tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        shutil.copy2(EX_TEST_STY, work / "ex_test.sty")
        (work / "doc.tex").write_text(tex, encoding="utf-8")
        proc = None
        for _ in range(passes):
            try:
                proc = subprocess.run(
                    ["pdflatex", "-interaction=nonstopmode", "-halt-on-error", "-no-shell-escape", "doc.tex"],
                    cwd=work, capture_output=True, text=True, encoding="utf-8", errors="replace",
                    timeout=COMPILE_TIMEOUT,
                )
            except FileNotFoundError:
                raise PdfExportError("Máy chủ chưa cài TeX Live (không tìm thấy lệnh pdflatex).", 500)
            except subprocess.TimeoutExpired:
                raise PdfExportError(f"Biên dịch quá {COMPILE_TIMEOUT} giây. Hãy xuất ít câu hơn mỗi lần.", 408)
            if proc.returncode != 0:
                break
        pdf = work / "doc.pdf"
        if proc is None or proc.returncode != 0 or not pdf.exists():
            log_file = work / "doc.log"
            log = log_file.read_text(encoding="utf-8", errors="replace") if log_file.exists() else (proc.stdout if proc else "")
            raise PdfExportError("Không biên dịch được PDF. " + _explain_log(log, items))
        return pdf.read_bytes()


def _resolve_exam_code(template: str, rng: random.Random) -> str:
    """Thay mỗi ký tự 'x' (hoặc 'X') bằng một chữ số ngẫu nhiên 0-9."""
    return "".join(str(rng.randint(0, 9)) if ch in ("x", "X") else ch for ch in template)


def compile_pdf(
    items: Sequence[tuple],
    title: str = "Câu hỏi được chọn",
    show_answers: bool = False,
    include_solutions: bool = False,
    show_ids: bool = False,
    group_by_type: bool = True,
    doc_type: str = "exercise",
    exam_header: Optional[ExamHeaderInfo] = None,
    shuffle_questions: bool = False,
    shuffle_choices: bool = False,
    seed: Optional[int] = None,
) -> bytes:
    _validate_inputs(items)
    resolved_header = exam_header
    if exam_header and ("x" in exam_header.exam_code or "X" in exam_header.exam_code):
        code_rng = random.Random(seed)
        resolved_header = ExamHeaderInfo(
            department=exam_header.department,
            school=exam_header.school,
            exam_name=exam_header.exam_name,
            school_year=exam_header.school_year,
            subject=exam_header.subject,
            grade=exam_header.grade,
            duration=exam_header.duration,
            exam_code=_resolve_exam_code(exam_header.exam_code, code_rng),
        )
    tex = build_tex(
        items,
        title,
        show_answers,
        include_solutions,
        show_ids,
        group_by_type=group_by_type,
        doc_type=doc_type,
        exam_header=resolved_header,
        shuffle_questions=shuffle_questions,
        shuffle_choices=shuffle_choices,
        seed=seed,
    )
    passes = 2 if doc_type == "exam" else 1
    return _run_pdflatex(tex, items, passes=passes)


def _exam_codes(start_code: str, count: int, rng: Optional[random.Random] = None) -> List[str]:
    clean = (start_code or "").strip()
    if "x" in clean or "X" in clean:
        r = rng or random.Random()
        codes: List[str] = []
        seen = set()
        for _ in range(count):
            code = _resolve_exam_code(clean, r)
            for _ in range(50):
                if code not in seen:
                    break
                code = _resolve_exam_code(clean, r)
            seen.add(code)
            codes.append(code)
        return codes
    if clean.isdigit():
        base = int(clean)
        width = len(clean)
        return [str(base + i).zfill(width) for i in range(count)]
    prefix = clean or "10"
    return [f"{prefix}{i + 1}" for i in range(count)]


def compile_multi_pdf(
    items: Sequence[tuple],
    num_exams: int,
    title: str = "Đề thi",
    show_answers: bool = False,
    include_solutions: bool = False,
    show_ids: bool = False,
    group_by_type: bool = True,
    doc_type: str = "exam",
    exam_header: Optional[ExamHeaderInfo] = None,
    base_seed: Optional[int] = None,
) -> bytes:
    """Sinh nhiều mã đề (xáo trộn câu hỏi theo phần + phương án A, B, C, D) và đóng gói thành .zip."""
    if num_exams < 1 or num_exams > MAX_EXAMS:
        raise PdfExportError(f"Số đề cần tạo phải từ 1 đến {MAX_EXAMS}.", 400)
    _validate_inputs(items)

    seed0 = base_seed if base_seed is not None else random.SystemRandom().randint(1, 10**9)
    hdr = exam_header or ExamHeaderInfo()
    codes = _exam_codes(hdr.exam_code or "101", num_exams, rng=random.Random(seed0))
    passes = 2 if doc_type == "exam" else 1
    has_dup_codes = len(set(codes)) < len(codes)

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for idx, code in enumerate(codes):
            ver_header = ExamHeaderInfo(
                department=hdr.department,
                school=hdr.school,
                exam_name=hdr.exam_name,
                school_year=hdr.school_year,
                subject=hdr.subject,
                grade=hdr.grade,
                duration=hdr.duration,
                exam_code=code,
            )
            tex = build_tex(
                items,
                title=f"{title} - Mã đề {code}" if title.strip() else f"Mã đề {code}",
                show_answers=show_answers,
                include_solutions=include_solutions,
                show_ids=show_ids,
                group_by_type=group_by_type,
                doc_type=doc_type,
                exam_header=ver_header,
                shuffle_questions=True,
                shuffle_choices=True,
                seed=seed0 + idx,
            )
            pdf_bytes = _run_pdflatex(tex, items, passes=passes)
            fname = f"de-thi-{code}-{idx + 1}.pdf" if has_dup_codes else f"de-thi-{code}.pdf"
            zf.writestr(fname, pdf_bytes)
    return buf.getvalue()


def pdf_status() -> dict:
    """Kiểm tra môi trường: có pdflatex, ex_test.sty và gói tiếng Việt không."""
    def run(cmd: List[str]) -> Optional[str]:
        try:
            return subprocess.run(cmd, capture_output=True, text=True, timeout=15).stdout.strip()
        except Exception:  # noqa: BLE001
            return None

    version = run(["pdflatex", "--version"])
    return {
        "pdflatex": version.splitlines()[0] if version else None,
        "ex_test": EX_TEST_STY.exists(),
        "vietnamese_t5": bool(run(["kpsewhich", "t5enc.def"])),
        "mathpazo": bool(run(["kpsewhich", "mathpazo.sty"])),
        "tkz_tab": bool(run(["kpsewhich", "tkz-tab.sty"])),
    }
