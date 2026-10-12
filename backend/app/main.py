from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import engine, Base

# Import các router từ các thư mục api/routes (Giai đoạn 2, 3, 4, 5)
from app.api.routes import questions, import_latex, exams, export, statistics

# Tạo các bảng trong database nếu chưa tồn tại (trong thực tế nên dùng Alembic)
Base.metadata.create_all(bind=engine)

app = FastAPI(title=settings.PROJECT_NAME)

from app.tikz_render import router as tikz_router
app.include_router(tikz_router)

# Thiết lập CORS cho phép Frontend gọi API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Khi deploy thực tế, thay "*" bằng URL của frontend (vd: "http://localhost:3000")
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Đăng ký các API Routes vào ứng dụng chính
app.include_router(import_latex.router, prefix="/api/latex", tags=["Nhập LaTeX"])
app.include_router(questions.router, prefix="/api/questions", tags=["Quản lý Câu hỏi"])
app.include_router(exams.router, prefix="/api/exams", tags=["Sinh Đề thi"])
app.include_router(export.router, prefix="/api", tags=["Xuất LaTeX"])
app.include_router(statistics.router, prefix="/api/stats", tags=["Thống kê"])

@app.get("/")
def read_root():
    return {"message": "Hệ thống Quản lý đề thi LaTeX đang hoạt động!"}