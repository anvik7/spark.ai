# ---- stage 1: build the PWA ----
FROM node:20-slim AS web
WORKDIR /web
COPY web/package*.json ./
RUN npm ci || npm install
COPY web/ ./
RUN npm run build

# ---- stage 2: API + serve built PWA ----
FROM python:3.12-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY spark/ ./spark/
COPY seed.py .
COPY --from=web /web/dist ./web/dist
EXPOSE 8000
CMD ["sh", "-c", "uvicorn spark.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
