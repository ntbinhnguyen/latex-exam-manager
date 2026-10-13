FROM node:20-alpine

WORKDIR /app

# Copy file quản lý gói và cài đặt
COPY package*.json ./
RUN npm install

# Copy mã nguồn
COPY . .

EXPOSE 3000

# Chạy ở chế độ development giống hệt cách bạn làm trên local
CMD ["npm", "run", "dev"]