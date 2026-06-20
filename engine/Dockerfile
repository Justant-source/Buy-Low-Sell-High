FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app/engine/src

WORKDIR /app

COPY pyproject.toml /app/pyproject.toml
COPY engine /app/engine
COPY configs /app/configs
COPY db /app/db
COPY scripts /app/scripts
COPY docs /app/docs
COPY AGENTS.md CLAUDE.md README.md docker-compose.yml .env.example /app/

CMD ["python", "-m", "buy_low_sell_high.cli", "bootstrap-check"]
