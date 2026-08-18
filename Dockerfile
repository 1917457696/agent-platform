# ===== 多 Agent 医疗咨询平台 =====
FROM python:3.10-slim

WORKDIR /app

# 系统依赖（faiss 需要 libgomp）
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY static ./static
COPY scripts ./scripts
COPY data ./data

ENV PYTHONUNBUFFERED=1
EXPOSE 8001

CMD ["python", "-m", "uvicorn", "app.server:app", "--host", "0.0.0.0", "--port", "8001"]
