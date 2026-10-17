FROM python:3.12-slim

# Cài đặt TeX Live để render LaTeX/TikZ (Rất quan trọng)
RUN apt-get update && apt-get install -y \
    texlive-latex-base \
    texlive-latex-extra \
    texlive-fonts-recommended \
    texlive-pictures \
    ghostscript \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy và cài đặt thư viện Python
COPY requirements-min.txt .
RUN pip install --no-cache-dir -r requirements-min.txt

# Copy toàn bộ mã nguồn
COPY . .

EXPOSE 8000

# Khởi chạy server
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

COPY alembic.ini .
COPY alembic ./alembic