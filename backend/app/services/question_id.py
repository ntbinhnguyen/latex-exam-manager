"""Mã câu hỏi (ID) dạng  TN.M1.T0.C1.B3.01

  TN  → loại câu hỏi: TN | DS | TLN | TL
  M1  → mức độ: NB | TH | VD | VDC (M1 → NB, M2 → TH, M3 → VD, M4 → VDC)
  T0  → môn Toán (T), lớp 10 (0 → lớp 10, 1 → lớp 11, 2 → lớp 12)
  C1  → Chương 1
  B3  → Bài 3
  01  → Dạng toán 01 (có thể bỏ trống: "T0.TN.C1.B3")
"""
import re
from typing import Dict, Optional, Union

# Cấu trúc: Loại.Mức.Lớp.Chương.Bài.Dạng 
# (Dạng có thể tùy chọn, ví dụ: TN.M1.T0.C1.B3 hoặc TN.M1.T0.C1.B3.01)
QID_PATTERN = re.compile(
    r'^(?P<loai>[A-Z]+)\.'
    r'(?P<muc>M[1-4])\.'
    r'(?P<lop>[A-Z0-9]+)\.'
    r'(?P<chuong>C\d+)\.'
    r'(?P<bai>B\d+)'
    r'(?:\.(?P<dang>\d+))?$'
)

# Ánh xạ Mức độ
LEVEL_MAP_TO_TEXT = {
    "M1": "NB",
    "M2": "TH",
    "M3": "VD",
    "M4": "VDC"
}
TEXT_TO_LEVEL_MAP = {v: k for k, v in LEVEL_MAP_TO_TEXT.items()}

def parse_qid(qid: str) -> Optional[Dict[str, str]]:
    """Phân tích chuỗi QID thành các thành phần."""
    if not qid:
        return None
        
    match = QID_PATTERN.match(qid.strip())
    if not match:
        return None
    
    data = match.groupdict()
    # Chuyển đổi M1-M4 thành NB/TH/VD/VDC nếu cần
    data['muc_text'] = LEVEL_MAP_TO_TEXT.get(data['muc'], "NB")
    return data

def generate_qid(loai: str, muc: str, lop: str, chuong: str, bai: str, dang: Optional[str] = None) -> str:
    """Tạo chuỗi QID từ các thành phần."""
    if muc in TEXT_TO_LEVEL_MAP:
        muc = TEXT_TO_LEVEL_MAP[muc]
        
    base = f"{loai}.{muc}.{lop}.{chuong}.{bai}"
    return f"{base}.{dang}" if dang else base

def build_qid(parts_or_loai: Union[Dict[str, str], str], muc: Optional[str] = None, 
              lop: Optional[str] = None, chuong: Optional[str] = None, 
              bai: Optional[str] = None, dang: Optional[str] = None) -> str:
    """
    Hỗ trợ gọi hàm linh hoạt tương thích với code cũ.
    Có thể truyền 1 dictionary: build_qid({"loai": "TN", "muc": "M1", ...})
    Hoặc truyền tham số: build_qid("TN", "M1", "T0", "C1", "B3", "01")
    """
    if isinstance(parts_or_loai, dict):
        return generate_qid(
            loai=parts_or_loai.get("loai", ""),
            muc=parts_or_loai.get("muc", ""),
            lop=parts_or_loai.get("lop", ""),
            chuong=parts_or_loai.get("chuong", ""),
            bai=parts_or_loai.get("bai", ""),
            dang=parts_or_loai.get("dang")
        )
    return generate_qid(parts_or_loai, muc, lop, chuong, bai, dang)

def is_valid_qid(qid: str) -> bool:
    """Kiểm tra ID có khớp với định dạng Loại.Mức.Lớp.Chương.Bài.Dạng không."""
    if not qid:
        return False
    return bool(QID_PATTERN.match(qid.strip()))

def retype_qid(qid: str, new_type) -> str:
    """Thay đổi phần 'Loại' trong chuỗi QID (chuyển TN thành DS/TLN/TL) giữ nguyên các phần còn lại."""
    if not qid:
        return qid
    
    parsed = parse_qid(qid)
    if not parsed:
        return qid
        
    # Lấy giá trị chuỗi nếu new_type là một Enum object
    type_str = new_type.value if hasattr(new_type, "value") else str(new_type)
    
    return generate_qid(
        loai=type_str,
        muc=parsed["muc"],
        lop=parsed["lop"],
        chuong=parsed["chuong"],
        bai=parsed["bai"],
        dang=parsed.get("dang")
    )


def embed_qid(content: str, qid) -> str:
    """
    Ghi ID vào dòng đầu của khối theo định dạng:  \\begin{ex}%[TN.M2.T2.C1.B3.05]
    - Đã có chú thích trên dòng \\begin{ex} -> thay bằng %[ID]
    - Chưa có -> thêm %[ID] ngay sau \\begin{ex}
    ID không hợp lệ / nội dung không phải khối \\begin{ex} -> giữ nguyên.
    """
    if not content or not qid or not is_valid_qid(qid):
        return content
    m = re.match(r"\s*\\begin\{ex\}", content)
    if not m:
        return content
    head, rest = content[:m.end()], content[m.end():]
    nl = re.search(r"\r?\n", rest)
    first, tail, eol = (rest[:nl.start()], rest[nl.start():], nl.group(0)) if nl else (rest, "", "\n")
    tag = f"%[{qid.strip().upper()}]"
    c = re.search(r"(?<!\\)%", first)
    if c:
        before = first[:c.start()]
        return head + (before.rstrip() + " " if before.strip() else "") + tag + tail
    if first.strip():
        return head + tag + eol + first.lstrip() + tail
    return head + tag + tail
