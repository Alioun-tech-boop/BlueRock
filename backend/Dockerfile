# ===== Étape 1 : dépendances =====
FROM python:3.13-slim AS deps

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --timeout 120 -r requirements.txt

# ===== Étape 2 : runtime (image finale légère) =====
FROM python:3.13-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    TZ=Africa/Abidjan

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        tesseract-ocr \
        tesseract-ocr-fra \
    && rm -rf /var/lib/apt/lists/*

COPY --from=deps /usr/local/lib/python3.13/site-packages /usr/local/lib/python3.13/site-packages
COPY --from=deps /usr/local/bin /usr/local/bin

COPY app ./app
COPY static ./static
COPY requirements.txt ./

RUN useradd -m -u 10001 appuser \
    && mkdir -p /app/uploads /app/app/data \
    && chown -R appuser:appuser /app

USER appuser
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
