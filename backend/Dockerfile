FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 PIP_NO_CACHE_DIR=1
WORKDIR /app
RUN useradd --create-home --uid 10001 appuser
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY --chown=appuser:appuser . .
USER appuser
# Render injects PORT (default 10000); 8000 is used for local Docker.
ENV PORT=8000
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD python -c "import os,urllib.request as u; u.urlopen('http://127.0.0.1:%s/api/health' % os.environ.get('PORT','8000'), timeout=4)"
# Single worker: the WebSocket hub and rate limiter keep state in process memory.
# --proxy-headers/--forwarded-allow-ips: behind Render's load balancer the real client IP is in X-Forwarded-For
#   (the container is only reachable through the platform proxy). Without this every user shares one rate-limit bucket.
# Migrations run on every start; this is safe for a single instance.
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*' --no-server-header"]
