# XQT5 AI-Workplace backend — Coolify build
#
# Single source of truth for runtime deps is `uv.lock`. The Dockerfile
# installs `uv` first, then runs `uv sync --frozen --no-dev --no-install-project`
# which reads `uv.lock` and installs each package at its exact pinned version
# with SHA-256 hash verification. `pyproject.toml` declares the dependency
# *set* (with upper-bound version guards); `uv.lock` pins the *exact* versions
# that ship. Lockfile wins on conflict.
#
# When adding or upgrading a dep:
#   1. edit `pyproject.toml`
#   2. run `uv lock` locally to regenerate `uv.lock`
#   3. commit both files together
# Never hand-edit `uv.lock`.
#
# Runtime imports the app source from `/app/app` (filesystem path), not from
# a pip-installed package — that's why we pass `--no-install-project`. The
# venv at `/app/.venv` only holds the third-party deps; PATH is prepended so
# `uvicorn` resolves there.

FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
# Make uv's venv come first on PATH so the CMD finds the right uvicorn.
ENV PATH="/app/.venv/bin:$PATH"

WORKDIR /app

# Install uv from PyPI — single binary, lockfile-driven, fast.
RUN pip install --no-cache-dir --upgrade pip uv

# Copy ONLY dep manifests first so Docker caches the dep-install layer
# across source-only changes.
COPY pyproject.toml uv.lock /app/

# Install runtime deps from uv.lock exactly.
#   --frozen              fail if uv.lock and pyproject.toml are out of sync
#   --no-dev              skip dev-only deps
#   --no-install-project  deps only; the app source is mounted below
RUN uv sync --frozen --no-dev --no-install-project

# Copy app source after the dep layer so dep-install stays cached.
COPY app /app/app

EXPOSE 8001

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port 8001 --proxy-headers --forwarded-allow-ips \"${FORWARDED_ALLOW_IPS:-*}\""]
