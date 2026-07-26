FROM ghcr.io/astral-sh/uv:0.11.32@sha256:df4cae8f3a96d175e2e5f992e597550000edbe78fdc2594d5cd8de1a217f504c AS uv-bin

FROM python:3.14.6-slim-bookworm@sha256:86f975aca15cf04a40b399eebede9aea7c82eae084d1f1a0a6ef6bcaae871a30 AS builder

ARG SOURCE_DATE_EPOCH
ARG PRODUCER_RUNTIME_INPUTS_MANIFEST_SHA256
ARG PRODUCER_CATALOG_CONFIG_DIGEST
ARG PRODUCER_COMMON_COMMIT

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
COPY producer/contracts /opt/bgmss/producer/contracts
COPY producer/catalog /opt/bgmss/producer/catalog
COPY producer/metadata /opt/bgmss/producer/metadata

RUN test -n "${SOURCE_DATE_EPOCH}" \
    && test "${PRODUCER_RUNTIME_INPUTS_MANIFEST_SHA256#sha256:}" \
       != "${PRODUCER_RUNTIME_INPUTS_MANIFEST_SHA256}" \
    && producer_manifest="${PRODUCER_RUNTIME_INPUTS_MANIFEST_SHA256#sha256:}" \
    && test "${#producer_manifest}" -eq 64 \
    && case "${producer_manifest}" in *[!0-9a-f]*) exit 1;; esac \
    && test "${PRODUCER_CATALOG_CONFIG_DIGEST#sha256:}" \
       != "${PRODUCER_CATALOG_CONFIG_DIGEST}" \
    && catalog_digest="${PRODUCER_CATALOG_CONFIG_DIGEST#sha256:}" \
    && test "${#catalog_digest}" -eq 64 \
    && case "${catalog_digest}" in *[!0-9a-f]*) exit 1;; esac \
    && test "${#PRODUCER_COMMON_COMMIT}" -eq 40 \
    && case "${PRODUCER_COMMON_COMMIT}" in *[!0-9a-f]*) exit 1;; esac \
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
    && test ! -e /opt/runtime/uv.lock \
    && find /opt/bgmss/producer -type d -exec chmod 0555 '{}' + \
    && find /opt/bgmss/producer -type f -exec chmod 0444 '{}' +

FROM python:3.14.6-slim-bookworm@sha256:86f975aca15cf04a40b399eebede9aea7c82eae084d1f1a0a6ef6bcaae871a30 AS runtime

ARG PRODUCER_RUNTIME_INPUTS_MANIFEST_SHA256
ARG PRODUCER_CATALOG_CONFIG_DIGEST
ARG PRODUCER_COMMON_COMMIT

ENV HOME=/nonexistent \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    PATH=/usr/local/bin:/usr/bin:/bin \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONHASHSEED=0 \
    PYTHONPATH=/opt/runtime \
    PYTHONUNBUFFERED=1

COPY --from=builder --chown=65532:65532 /opt/runtime /opt/runtime
COPY --from=builder --chown=65532:65532 /opt/bgmss/producer /opt/bgmss/producer

LABEL org.bangumi-staff-stats.producer-runtime-inputs-manifest-sha256="${PRODUCER_RUNTIME_INPUTS_MANIFEST_SHA256}" \
      org.bangumi-staff-stats.catalog-config-digest="${PRODUCER_CATALOG_CONFIG_DIGEST}" \
      org.bangumi-staff-stats.common-commit="${PRODUCER_COMMON_COMMIT}"

RUN chmod 0555 /opt/bgmss /opt/bgmss/producer \
    && test "$(stat -c '%a:%u:%g' /opt/bgmss)" = "555:65532:65532" \
    && test "$(stat -c '%a:%u:%g' /opt/bgmss/producer)" = "555:65532:65532" \
    && rm -rf \
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
