from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from sqlalchemy import text
from app.core.database import engine, Base

# Import các router từ các thư mục api/routes (Giai đoạn 2, 3, 4, 5)
from app.api.routes import questions, import_latex, exams, export, statistics

# Tạo các bảng trong database nếu chưa tồn tại (trong thực tế nên dùng Alembic)
Base.metadata.create_all(bind=engine)

# create_all không thêm cột vào bảng đã có -> tự bổ sung cột status (xóa mềm) nếu thiếu
with engine.begin() as conn:
    conn.execute(text("ALTER TABLE questions ADD COLUMN IF NOT EXISTS status VARCHAR DEFAULT 'active'"))
    conn.execute(text("UPDATE questions SET status = 'active' WHERE status IS NULL"))
    # thời điểm xóa mềm (phục vụ trang Thùng rác)
    conn.execute(text("ALTER TABLE questions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ"))
    # các câu đã được xác nhận "không trùng" khi kiểm duyệt (kiểm tra trùng nội dung)
    conn.execute(text("ALTER TABLE questions ADD COLUMN IF NOT EXISTS dup_dismissed TEXT"))

# Supabase: bật Row-Level Security (RLS) cho mọi bảng của ứng dụng.
# Backend kết nối thẳng bằng DATABASE_URL (vai trò postgres bỏ qua RLS) nên vẫn đọc/ghi bình thường,
# còn API REST công khai của Supabase (khóa anon) bị chặn hoàn toàn -> hết cảnh báo "rls_disabled_in_public".
# Lệnh này lặp lại nhiều lần vẫn an toàn; bảng mới tạo (create_all) cũng được bật RLS ngay lần khởi động sau.
if engine.dialect.name == "postgresql":
    for _table in Base.metadata.sorted_tables:
        try:
            with engine.begin() as conn:
                conn.execute(text(f'ALTER TABLE public."{_table.name}" ENABLE ROW LEVEL SECURITY'))
        except Exception as exc:  # noqa: BLE001 - không để lỗi quyền làm app không khởi động
            print(f"[RLS] Không bật được RLS cho bảng {_table.name}: {exc}")

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