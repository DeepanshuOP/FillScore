# Using python:3.11-slim because Python 3.11 provides widespread, pre-compiled binary wheel support for heavy C-extension dependencies like pandas, pyarrow, pymongo[srv], and uvicorn[standard] on Linux without requiring complex C++ compiler toolchains or risking wheel incompatibility on Python 3.12/3.13.
FROM python:3.11-slim

WORKDIR /app

# Install curl for HEALTHCHECK, install temporary build deps for native wheels, install Python packages from requirements.txt, then purge build deps in a single layer to keep the image small.
COPY requirements.txt ./
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl \
        gcc \
        g++ \
        libffi-dev \
        libssl-dev \
    && pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt \
    && apt-get purge -y --auto-remove gcc g++ libffi-dev libssl-dev \
    && rm -rf /var/lib/apt/lists/*

COPY . .

# Create and switch to non-root user for security
RUN groupadd -r appuser && useradd -r -g appuser -d /app appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
