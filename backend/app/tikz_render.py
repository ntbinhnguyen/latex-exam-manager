"""Biên dịch mã TikZ thành SVG bằng TeX Live (latex + dvisvgm), có cache theo nội dung.

Dùng:
    from tikz_render import router as tikz_router
    app.include_router(tikz_router)
"""
import hashlib
import re
import subprocess
import tempfile
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api")

CACHE_DIR = Path(__file__).parent / "cache" / "tikz"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

# Driver dvisvgm của pgf: không cần Ghostscript cho TikZ thông thường.
# Nếu có preamble riêng trong main.tex, hãy chép các \usepackage / \usetikzlibrary cần thiết vào đây.
PREAMBLE = r"""\def\pgfsysdriver{pgfsys-dvisvgm.def}
\documentclass[tikz,border=4pt]{standalone}
\usepackage[utf8]{inputenc}
\usepackage{amsmath,amssymb}
\usepackage{tkz-tab}
\usepackage{pgfplots}
\pgfplotsset{compat=newest}
\usetikzlibrary{arrows.meta,calc,angles,quotes,intersections,positioning,patterns,
  decorations.pathreplacing,shapes.geometric,3d}
\begin{document}
"""
POSTAMBLE = "\n\\end{document}\n"

# Chặn các lệnh đọc/ghi file khi biên dịch.
FORBIDDEN = re.compile(r"\\(?:write|immediate|openin|openout|input|include|read)\b")


class TikzIn(BaseModel):
    code: str = Field(max_length=20000)


def _tex_errors(log: str) -> str:
    lines = log.splitlines()
    msgs = []
    for i, ln in enumerate(lines):
        if ln.startswith("!"):
            msgs.append("\n".join(lines[i : i + 6]))
    return ("\n\n".join(msgs) or log[-600:])[:1200]


@router.post("/tikz")
def render_tikz(body: TikzIn) -> Response:
    # Dòng trống trong tikzpicture sinh ra \par và làm TikZ báo lỗi
    # "Paragraph ended before \tikz@picture was complete" → bỏ các dòng trống.
    code = "\n".join(ln for ln in body.code.strip().splitlines() if ln.strip())
    if not code.startswith(r"\begin{tikzpicture}"):
        raise HTTPException(422, "Mã phải bắt đầu bằng \\begin{tikzpicture}.")
    if FORBIDDEN.search(code):
        raise HTTPException(422, "Mã TikZ chứa lệnh không được phép (\\write, \\input, \\openin…).")

    key = hashlib.sha256((PREAMBLE + code).encode("utf-8")).hexdigest()
    cached = CACHE_DIR / f"{key}.svg"
    if cached.exists():
        return Response(cached.read_bytes(), media_type="image/svg+xml")

    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        (work / "fig.tex").write_text(PREAMBLE + code + POSTAMBLE, encoding="utf-8")
        try:
            tex = subprocess.run(
                ["latex", "-interaction=nonstopmode", "-halt-on-error", "-no-shell-escape", "fig.tex"],
                cwd=work, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=30,
            )
            if tex.returncode != 0 or not (work / "fig.dvi").exists():
                log = (work / "fig.log").read_text(encoding="utf-8", errors="replace") if (work / "fig.log").exists() else tex.stdout
                raise HTTPException(422, _tex_errors(log))
            svg = subprocess.run(
                ["dvisvgm", "--no-fonts", "--exact-bbox", "-o", "fig.svg", "fig.dvi"],
                cwd=work, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=30,
            )
            if svg.returncode != 0 or not (work / "fig.svg").exists():
                raise HTTPException(500, f"dvisvgm lỗi: {svg.stderr[-600:]}")
        except FileNotFoundError as e:
            raise HTTPException(500, f"Không tìm thấy lệnh {e.filename!r} – kiểm tra TeX Live đã nằm trong PATH.")
        except subprocess.TimeoutExpired:
            raise HTTPException(408, "Biên dịch TikZ quá thời gian (30 giây).")
        data = (work / "fig.svg").read_bytes()

    cached.write_bytes(data)
    return Response(data, media_type="image/svg+xml")