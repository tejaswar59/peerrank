# Peer Rank — production image. Single-process uvicorn (the in-app auto-close
# sweep assumes one process; see DEPLOY.md before scaling to multiple workers).
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /srv

# Install deps first for better layer caching.
COPY requirements.txt .
RUN pip install -r requirements.txt

# App code + static frontend.
COPY app ./app
COPY web ./web

# Data dir for the SQLite file (mount a volume here to persist across deploys).
# 0777 because the platform running this image may assign an arbitrary
# non-root UID at runtime (common on managed container platforms) — without
# this, that user can't write into a directory created as root at build
# time, and every DB write 500s with a bare "Internal Server Error" while
# read-only routes (like /api/health) keep working fine.
RUN mkdir -p /data && chmod 0777 /data
ENV DATABASE_URL=sqlite:////data/peerrank.db
VOLUME ["/data"]

EXPOSE 8000

# Container-level health check hits the API's health route.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health').status==200 else 1)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
