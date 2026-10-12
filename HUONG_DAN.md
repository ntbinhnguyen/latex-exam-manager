# Hướng dẫn vận hành – Quản lý đề thi LaTeX

## Yêu cầu cài đặt
Python 3.11+, Node.js 20+, và PostgreSQL (dễ nhất là Docker Desktop).

## 1. Cơ sở dữ liệu (thư mục gốc dự án)
    docker compose up -d
(Không dùng Docker: tự tạo PostgreSQL với user `teacher`, mật khẩu `securepassword`, DB `latex_exams`.)

## 2. Backend (cửa sổ terminal 1)
    cd backend
    python -m venv .venv
    .venv\Scripts\activate          (macOS/Linux: source .venv/bin/activate)
    pip install -r requirements-min.txt
    uvicorn app.main:app --reload --port 8000
Kiểm tra: http://localhost:8000/docs

## 3. Frontend (cửa sổ terminal 2)
    cd frontend
    npm install
    npm run dev
Mở http://localhost:3000

## 4. Quy trình sử dụng
1. Nhập đề LaTeX: chọn file .tex (UTF-8), chọn Lớp/Chương/Bài/Dạng để tự gắn ID → "Nhập vào ngân hàng".
2. Ngân hàng câu hỏi: lọc theo cây mục lục; bấm vào một câu để xem, rồi **Gắn ID**, **Sửa nội dung** (mã LaTeX, có xem trước) hoặc **Xóa** (xóa mềm).
3. Ma trận & Sinh đề: tạo ma trận → kiểm tra khả thi → sinh mã đề → tải .tex.
4. Biên dịch file .tex tải về bằng pdfLaTeX/XeLaTeX.

## Lỗi thường gặp
- "Không kết nối được máy chủ": backend chưa chạy, hoặc sai NEXT_PUBLIC_API_URL trong frontend/.env.local.
- Lỗi kết nối DB: PostgreSQL chưa chạy; kiểm tra DATABASE_URL (backend/.env).
- "Ngân hàng không đủ câu hỏi": câu hỏi chưa gán mức độ, hoặc tên chương/chuyên đề trong ma trận không khớp chính xác với câu hỏi.


## ID câu hỏi và cây mục lục
ID có dạng `T0.TN.C1.B3.01` = Lớp.Loại.Chương.Bài.Dạng:
- `T0` Toán lớp 10 (0 → lớp 10, 1 → lớp 11, 2 → lớp 12)
- `TN` loại câu: TN (Trắc nghiệm), DS (Đúng sai), TLN (Trả lời ngắn), TL (Tự luận)
- `C1` Chương 1, `B3` Bài 3, `01` Dạng 01 (có thể bỏ: `T0.TN.C1.B3`)

Cây mục lục: Lớp → Chương → Bài → Loại câu hỏi → Dạng toán. File mục lục (.json / .xlsx) gồm cột `id`, `title`:

    T0               Toán 10                (Lớp)
    T0.C1            CHƯƠNG I. ...          (Chương)
    T0.C1.B3         Bài 3. ...             (Bài)
    T0.TN.C1.B3.01   Dạng 1. ...            (Dạng; mục "Loại" tự sinh)

Mục còn thiếu và mục suy ra từ ID các câu hỏi được tự thêm (chữ nghiêng, tên mặc định). Câu chưa có ID nằm ở mục "Chưa gắn ID".

**Nạp cây** (menu ⋮ của khung Cây mục lục):
- *Tự động*: đọc `frontend/public/muc-luc.json` mỗi lần mở trang; sửa file rồi bấm "Tải lại cây tự động".
- *Thủ công*: nạp file .json / .xlsx; lưu trong trình duyệt. Menu có sẵn "Tải cây hiện tại / file mẫu" để lấy mẫu.

Mã cũ (`T010.01.01.D02-TN-1`) vẫn đọc được; mở câu → "Gắn ID" → "Lưu ID" để đổi sang mã mới.
