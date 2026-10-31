# Build from the repository root so the image can include artifacts/ and ml/:
#   docker build -f api/Dockerfile -t needle-api .
#   docker run --rm -p 8000:8000 needle-api
# needle_ml is installed only when ml/pyproject.toml exists; otherwise /api/pc and /api/coa return 503.
FROM python:3.14-slim

COPY --from=ghcr.io/astral-sh/uv:0.5 /uv /usr/local/bin/uv

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    PATH="/app/api/.venv/bin:$PATH" \
    NEEDLE_ARTIFACTS_DIR=/app/artifacts

WORKDIR /app/api

COPY api/pyproject.toml api/uv.lock api/.python-version api/README.md ./
RUN uv sync --frozen --no-dev --no-install-project

COPY api/src ./src
RUN uv sync --frozen --no-dev --no-editable

COPY ml /app/ml
RUN if [ -f /app/ml/pyproject.toml ]; then uv pip install --python .venv/bin/python /app/ml; fi

COPY artifacts /app/artifacts

RUN useradd --system --uid 10001 needle
USER needle

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health')"
CMD ["uvicorn", "needle_api.main:app", "--host", "0.0.0.0", "--port", "8000"]
