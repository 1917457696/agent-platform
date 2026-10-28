# ===== React 构建阶段 =====
FROM node:22-alpine AS web-builder

WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend ./frontend
COPY tsconfig.json vite.config.ts ./
RUN npm run build

# ===== FastAPI 运行阶段 =====
FROM python:3.10-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY scripts ./scripts
COPY data ./data
COPY --from=web-builder /src/static ./static

ENV PYTHONUNBUFFERED=1
EXPOSE 8001

CMD ["python", "-m", "uvicorn", "app.server:app", "--host", "0.0.0.0", "--port", "8001"]
