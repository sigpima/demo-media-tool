# syntax=docker/dockerfile:1
# Stage 1 — build the React app
FROM node:20-alpine AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2 — FastAPI + Pillow, serving the built app from the same origin
FROM python:3.12-slim AS runtime
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 PIP_NO_CACHE_DIR=1 \
    CBT_STORAGE_DIR=/data CBT_STATIC_DIR=/app/static
RUN groupadd --system --gid 10001 app && useradd --system --uid 10001 --gid app --home-dir /app --shell /usr/sbin/nologin app
WORKDIR /app
COPY backend/requirements.txt ./
RUN pip install -r requirements.txt            # Pillow wheels bundle libwebp/libjpeg/lcms: no apt packages needed
COPY backend/app ./app
COPY --from=web /web/dist ./static
RUN mkdir /data && chown app:app /data
USER app
VOLUME /data
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request as u; u.urlopen('http://127.0.0.1:8000/api/health', timeout=3)" || exit 1
# ONE worker on purpose: batch state lives in memory (no database). Image work is parallelised by CBT_CONCURRENCY threads.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--no-server-header"]
