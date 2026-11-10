"""Kiểm tra câu hỏi trùng nội dung.

Quy tắc:
  * CÙNG ID (hợp lệ) và nội dung giống từ 80% trở lên  -> nghi trùng.
  * KHÁC ID (hoặc chưa có ID) cần giống từ 90% trở lên mới báo (mức phụ).
Phân loại (kind):
  * exact      : giống >= 95% và cùng số liệu + cùng đáp án  -> "gần như trùng hoàn toàn"
  * similar    : giống 80-95% và cùng số liệu + cùng đáp án   -> "tương tự, cần xem"
  * diff_data  : giống >= 80% nhưng KHÁC số liệu hoặc KHÁC đáp án đúng -> "giống nhưng khác số liệu"
                 (chỉ là nhãn thông tin, KHÔNG coi là trùng; không báo ở mức phụ khác ID)

Nội dung được chuẩn hóa trước khi so sánh: bỏ chú thích %, \\loigiai{...}, \\True, hình TikZ,
\\dfrac -> \\frac, \\left \\right, khoảng trắng, dấu $ và {}; các phương án được sắp xếp lại để
đề bị xáo trộn thứ tự đáp án vẫn nhận ra là trùng.
"""
import difflib
import json
import re
from typing import Any, Dict, Iterable, List, Optional, Tuple

from app.services.question_id import is_valid_qid

SAME_ID_THRESHOLD = 0.80
CROSS_ID_THRESHOLD = 0.90
EXACT_THRESHOLD = 0.95
MAX_MATCHES = 5
BLOCKING_KINDS = ("exact", "similar")  # các loại làm "Duyệt hàng loạt" bỏ qua câu đó
_SEVERITY = {"exact": 3, "similar": 2, "diff_data": 1}

_COMMENT_RE = re.compile(r"(?<!\\)%[^\n]*")
_TRUE_RE = re.compile(r"\\True(?![A-Za-z])")
_CHOICE_RE = re.compile(r"\\(choiceTF|choice|shortansoly|shortans)(?![A-Za-z])")
_TIKZ_RE = re.compile(r"\\begin\{tikzpicture\}.*?\\end\{tikzpicture\}", re.S)
_NUM_RE = re.compile(r"\d+(?:[.,]\d+)?")


# ---------------------------------------------------------------- chuẩn hóa

def _read_group(s: str, i: int) -> Tuple[Optional[str], int]:
    """s[i] == '{' -> (nội dung bên trong, vị trí sau dấu '}' đóng)."""
    if i >= len(s) or s[i] != "{":
        return None, i
    depth = 0
    j = i
    while j < len(s):
        c = s[j]
        if c == "\\":
            j += 2
            continue
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return s[i + 1 : j], j + 1
        j += 1
    return None, i


def _remove_command(s: str, name: str) -> str:
    """Xóa \\name{...} (nhóm ngoặc cân bằng)."""
    pat = re.compile(r"\\" + name + r"(?![A-Za-z])\s*")
    out, pos = [], 0
    while True:
        m = pat.search(s, pos)
        if not m:
            out.append(s[pos:])
            break
        out.append(s[pos : m.start()])
        g, end = _read_group(s, m.end())
        pos = end if g is not None else m.end()
    return "".join(out)


def _split_structure(body: str) -> Tuple[str, List[str], str]:
    """Tách phần đề và danh sách phương án / đáp án (\\choice, \\choiceTF, \\shortans)."""
    m = _CHOICE_RE.search(body)
    if not m:
        return body, [], ""
    stem, i, opts = body[: m.start()], m.end(), []
    while True:
        while i < len(body) and body[i] in " \t\r\n":
            i += 1
        g, ni = _read_group(body, i)
        if g is None:
            break
        opts.append(g)
        i = ni
    return stem, opts, m.group(1)


def _clean(text: str) -> Tuple[str, List[str]]:
    """Trả về (văn bản đã chuẩn hóa để so sánh, danh sách số xuất hiện theo thứ tự)."""
    t = text
    t = re.sub(r"\\(?:dfrac|tfrac)(?![A-Za-z])", r"\\frac", t)
    t = re.sub(r"\\(?:left|right|displaystyle|bigg?|Bigg?)(?![A-Za-z])", "", t)
    t = re.sub(r"\\(?:hspace|vspace)\*?\{[^{}]*\}", " ", t)
    t = re.sub(r"\\(?:[,;:!]|quad|qquad|ldots|cdots|hline)(?![A-Za-z])", " ", t)
    t = t.replace("\\\\", " ").replace("&", " ")
    t = re.sub(r"\\(?:textbf|textit|emph|text|mathrm|mathbf|underline|item)(?![A-Za-z])", " ", t)
    t = re.sub(r"\\(?:begin|end)\{(?:center|tabular|ex|enumerate|itemize|array)\}(?:\{[^{}]*\})?", " ", t)
    t = t.replace("$", " ")
    # số liệu: tách {} thành khoảng trắng để \frac{1}{2} cho ra 1 và 2 (không dính thành 12)
    nums = [n.replace(",", ".") for n in _NUM_RE.findall(re.sub(r"[{}]", " ", t))]
    t = re.sub(r"[{}]", "", t)
    t = re.sub(r"\s+", " ", t).strip().lower()
    return t, nums


class Prepared:
    __slots__ = ("text", "numbers", "answer", "words", "_shingles")

    def __init__(self, text: str, numbers: tuple, answer: tuple, words: frozenset):
        self.text = text  # đã bỏ hết khoảng trắng: "I = x" và "I=x" coi như nhau
        self.numbers = numbers
        self.answer = answer
        self.words = words  # tập từ chữ (>= 2 ký tự): đổi 1 từ khóa => không còn là "gần như trùng hoàn toàn"
        self._shingles: Optional[frozenset] = None

    @property
    def shingles(self) -> frozenset:
        if self._shingles is None:
            t = self.text
            self._shingles = frozenset(t[i : i + 5] for i in range(max(0, len(t) - 4))) or frozenset([t])
        return self._shingles


def prepare(content: Optional[str]) -> Prepared:
    s = _COMMENT_RE.sub("", content or "")
    s = _remove_command(s, "loigiai")
    s = _TIKZ_RE.sub(" ", s)
    stem_raw, opts_raw, kind = _split_structure(s)
    stem_text, stem_nums = _clean(stem_raw)
    opts = []
    for o in opts_raw:
        is_true = bool(_TRUE_RE.search(o)) or kind.startswith("shortans")
        t, n = _clean(_TRUE_RE.sub("", o))
        opts.append((t, tuple(n), is_true))
    opts.sort(key=lambda x: x[0])  # bỏ qua thứ tự phương án (đề có thể bị xáo trộn)
    spaced = stem_text + " ¦ " + " ¦ ".join(o[0] for o in opts)
    numbers = (tuple(stem_nums), tuple(o[1] for o in opts))
    answer = tuple(re.sub(r"\s+", "", o[0]) for o in opts if o[2])
    words = frozenset(re.findall(r"[^\W\d_]{2,}", spaced))
    return Prepared(re.sub(r"\s+", "", spaced), numbers, answer, words)


# ---------------------------------------------------------------- so sánh

def similarity(a: Prepared, b: Prepared, threshold: float) -> float:
    """Độ giống 0..1; trả 0 nếu chắc chắn thấp hơn `threshold` (để bỏ qua nhanh)."""
    if not a.text.strip(" ¦") or not b.text.strip(" ¦"):
        return 0.0
    if a.text == b.text:
        return 1.0
    sm = difflib.SequenceMatcher(None, a.text, b.text, autojunk=False)
    if sm.real_quick_ratio() < threshold or sm.quick_ratio() < threshold:
        return 0.0
    return sm.ratio()


def data_differs(a: Prepared, b: Prepared) -> bool:
    return a.numbers != b.numbers or a.answer != b.answer


def classify(sim: float, differs: bool, same_words: bool = True) -> str:
    if differs:
        return "diff_data"
    return "exact" if sim >= EXACT_THRESHOLD and same_words else "similar"


def _norm_code(q: Any) -> Optional[str]:
    code = (getattr(q, "question_code", None) or "").strip().upper()
    return code if code and is_valid_qid(code) else None


def _dismissed(q: Any) -> set:
    try:
        return set(json.loads(getattr(q, "dup_dismissed", None) or "[]"))
    except (ValueError, TypeError):
        return set()


_CACHE: Dict[Tuple[str, int], Prepared] = {}


def _prepared(q: Any) -> Prepared:
    content = q.content_latex or ""
    key = (str(q.id), hash(content))
    p = _CACHE.get(key)
    if p is None:
        if len(_CACHE) > 20000:
            _CACHE.clear()
        p = _CACHE[key] = prepare(content)
    return p


def find_duplicates(targets: Iterable[Any], pool: Iterable[Any]) -> Dict[str, List[Dict[str, Any]]]:
    """Với mỗi câu trong `targets`, tìm các câu trong `pool` (ngân hàng + câu chờ duyệt) nghi trùng.

    Trả về {id_câu: [ {other_id, other_code, other_status, similarity, kind, cross_id}, ... ]}
    chỉ gồm câu có kết quả. Cặp đã được người dùng bấm "giữ cả hai" thì bị bỏ qua.
    """
    pool = list(pool)
    infos = [(q, _prepared(q), _norm_code(q)) for q in pool]
    by_code: Dict[str, List[int]] = {}
    for idx, (_, _, code) in enumerate(infos):
        if code:
            by_code.setdefault(code, []).append(idx)

    result: Dict[str, List[Dict[str, Any]]] = {}
    for t in targets:
        tp, tcode, tdis, tid = _prepared(t), _norm_code(t), _dismissed(t), str(t.id)
        found: List[Dict[str, Any]] = []

        def add(o, op, sim, cross):
            oid = str(o.id)
            if oid == tid or oid in tdis or tid in _dismissed(o):
                return
            kind = classify(sim, data_differs(tp, op), tp.words == op.words)
            if cross and kind == "diff_data":
                return  # khác ID mà khác số liệu: quá nhiều nhiễu, không báo
            found.append({
                "other_id": oid,
                "other_code": getattr(o, "question_code", None),
                "other_status": getattr(o, "status", None) or "active",
                "similarity": round(sim, 3),
                "kind": kind,
                "cross_id": cross,
            })

        same_idx = set(by_code.get(tcode, [])) if tcode else set()
        for idx in same_idx:
            o, op, _ = infos[idx]
            if str(o.id) == tid:
                continue
            sim = similarity(tp, op, SAME_ID_THRESHOLD)
            if sim >= SAME_ID_THRESHOLD:
                add(o, op, sim, False)

        lt = len(tp.text)
        for idx, (o, op, _) in enumerate(infos):
            if idx in same_idx or str(o.id) == tid:
                continue
            lo = len(op.text)
            if not lt or not lo or min(lt, lo) / max(lt, lo) < 0.8:
                continue
            inter = len(tp.shingles & op.shingles)
            if inter / max(1, len(tp.shingles | op.shingles)) < 0.5:
                continue
            sim = similarity(tp, op, CROSS_ID_THRESHOLD)
            if sim >= CROSS_ID_THRESHOLD:
                add(o, op, sim, True)

        if found:
            found.sort(key=lambda m: (-_SEVERITY[m["kind"]], -m["similarity"]))
            result[tid] = found[:MAX_MATCHES]
    return result


def blocking_matches(matches: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Các kết quả được coi là trùng thật (loại nhãn 'khác số liệu')."""
    return [m for m in matches if m["kind"] in BLOCKING_KINDS]


def summarize(dups: Dict[str, List[Dict[str, Any]]]) -> Dict[str, int]:
    """Đếm số câu theo mức nghiêm trọng nhất của từng câu."""
    out = {"exact": 0, "similar": 0, "diff_data": 0, "flagged": len(dups)}
    for ms in dups.values():
        out[max(ms, key=lambda m: _SEVERITY[m["kind"]])["kind"]] += 1
    return out
