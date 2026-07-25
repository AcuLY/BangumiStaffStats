FROM ghcr.io/astral-sh/uv:0.11.32@sha256:df4cae8f3a96d175e2e5f992e597550000edbe78fdc2594d5cd8de1a217f504c AS uv-bin

FROM python:3.14.6-slim-bookworm@sha256:86f975aca15cf04a40b399eebede9aea7c82eae084d1f1a0a6ef6bcaae871a30 AS builder

ARG SOURCE_DATE_EPOCH

ENV LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONHASHSEED=0 \
    SOURCE_DATE_EPOCH=${SOURCE_DATE_EPOCH} \
    UV_CACHE_DIR=/tmp/uv-cache \
    UV_LINK_MODE=copy \
    UV_NO_PROGRESS=1 \
    UV_PYTHON=/usr/local/bin/python \
    UV_PROJECT_ENVIRONMENT=/tmp/build-venv

COPY --from=uv-bin /uv /usr/local/bin/uv

WORKDIR /build
COPY pyproject.toml uv.lock README.md ./
COPY build/runtime_prune.py /tmp/runtime_prune.py
COPY src ./src

RUN test -n "${SOURCE_DATE_EPOCH}" \
    && test "$(python --version)" = "Python 3.14.6" \
    && test "$(uv --version | cut -d' ' -f2)" = "0.11.32" \
    && uv sync --frozen --python /usr/local/bin/python --no-install-project \
    && uv export --frozen --offline --no-dev --no-emit-project \
       --no-annotate --no-header --output-file /tmp/runtime-requirements.txt \
    && uv export --frozen --offline --only-dev --no-emit-project \
       --no-annotate --no-header --output-file /tmp/build-constraints.txt \
    && uv build --wheel --python /usr/local/bin/python \
       --out-dir /tmp/warmup-dist --build-constraints /tmp/build-constraints.txt \
       --require-hashes --no-create-gitignore \
    && rm -rf /tmp/warmup-dist \
    && uv build --offline --wheel --python /usr/local/bin/python \
       --out-dir /tmp/dist --build-constraints /tmp/build-constraints.txt \
       --require-hashes --no-create-gitignore \
    && uv pip install --python /usr/local/bin/python --target /tmp/warmup-runtime \
       --require-hashes --only-binary :all: \
       --requirements /tmp/runtime-requirements.txt \
    && rm -rf /tmp/warmup-runtime \
    && uv pip install --offline --python /usr/local/bin/python --target /opt/runtime \
       --require-hashes --only-binary :all: \
       --requirements /tmp/runtime-requirements.txt \
    && uv pip install --offline --python /usr/local/bin/python --target /opt/runtime \
       --no-deps /tmp/dist/*.whl \
    && python /tmp/runtime_prune.py /opt/runtime \
    && find /opt/runtime -type d -name __pycache__ -prune -exec rm -rf '{}' + \
    && find /opt/runtime -type f \( -name '*.pyc' -o -name '*.pyo' \) -delete \
    && test -z "$(find /opt/runtime -type f -name uv_cache.json -print -quit)" \
    && test -z "$(find /opt/runtime -type d \( -name test -o -name tests \
       -o -name benchmark -o -name benchmarks \) -print -quit)" \
    && test -z "$(find /opt/runtime -type f \( -name 'test_*.py' \
       -o -name '*_test.py' \) -print -quit)" \
    && test -n "$(find /opt/runtime -type f -path '*.dist-info/METADATA' -print -quit)" \
    && test -n "$(find /opt/runtime -type f -path '*.dist-info/RECORD' -print -quit)" \
    && test ! -e /opt/runtime/tests \
    && test ! -e /opt/runtime/pyproject.toml \
    && test ! -e /opt/runtime/uv.lock

FROM python:3.14.6-slim-bookworm@sha256:86f975aca15cf04a40b399eebede9aea7c82eae084d1f1a0a6ef6bcaae871a30 AS runtime

ENV HOME=/nonexistent \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    PATH=/usr/local/bin:/usr/bin:/bin \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONHASHSEED=0 \
    PYTHONPATH=/opt/runtime \
    PYTHONUNBUFFERED=1

COPY --from=builder --chown=65532:65532 /opt/runtime /opt/runtime

RUN rm -rf \
      /root/.cache \
      /usr/local/bin/pip \
      /usr/local/bin/pip3 \
      /usr/local/bin/pip3.14 \
      /usr/local/lib/python3.14/ensurepip \
      /usr/local/lib/python3.14/site-packages/pip \
      /usr/local/lib/python3.14/site-packages/pip-* \
    && test ! -e /usr/local/bin/uv \
    && test ! -e /build \
    && test ! -e /src

USER 65532:65532
WORKDIR /work

ENTRYPOINT ["/usr/local/bin/python", "-m", "bangumi_staff_stats_updater"]
