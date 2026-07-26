# Bangumi Staff Stats Archive producer

This directory contains the installable, one-shot Python Archive producer. It
acquires one exact upstream dump and common catalog, builds and validates a
fresh immutable SQLite snapshot, proves it through the Go consumer, and
publishes it only as an inactive version. It never reads or writes
`current.json`, activates a version, schedules itself, or runs as a resident
process.

## Toolchain

- CPython `3.14.6`
- uv `0.11.32`
- package version `0.1.0`
- runtime dependencies: `jsonschema==4.26.0`, `PyYAML==6.0.3`

All disposable state must stay below `.cache/`, `.tmp/`, or `.venv/`.

From this directory, with the exact uv executable selected:

```sh
export UV_CACHE_DIR="$PWD/.cache/uv"
export UV_PYTHON_INSTALL_DIR="$PWD/.tmp/python"

uv python install 3.14.6
uv sync --frozen --python 3.14.6

PYTHONDONTWRITEBYTECODE=1 uv run --frozen pytest
PYTHONDONTWRITEBYTECODE=1 uv run --frozen mypy src tests
PYTHONDONTWRITEBYTECODE=1 uv run --frozen ruff check .
PYTHONDONTWRITEBYTECODE=1 uv run --frozen ruff format --check .

uv export --frozen --offline --only-dev --no-emit-project \
  --no-annotate --no-header --output-file .tmp/build-constraints.txt
uv lock --check --offline
uv build --offline --wheel --python 3.14.6 --out-dir .tmp/dist \
  --build-constraints .tmp/build-constraints.txt --require-hashes \
  --no-create-gitignore
```

## CLI

Both entry points terminate and have the same behavior:

```sh
uv run --frozen bgmss-updater doctor
uv run --frozen python -m bangumi_staff_stats_updater doctor
uv run --frozen bgmss-updater contract-check --contracts-root ../contracts
uv run --frozen bgmss-updater produce \
  --output-root /absolute/canonical/archive-root \
  --contracts-root "$PWD/../contracts" \
  --catalog-config /absolute/canonical/display-v1.yaml \
  --common-commit 6a8442c17143a870357a5ff812362e8b5cfe9f9d \
  --archive-smoke /absolute/canonical/archive-smoke \
  --status-file /absolute/canonical/update-status.json
```

The contract checker reads the supplied `contracts/` tree without copying,
caching, editing, or opening any golden SQLite file as a database.

`produce` requires existing absolute, canonical, non-symlink paths. The output
root must be on one filesystem and writable; the command creates only a unique
staging directory and, after every Python and Go gate succeeds, atomically
publishes `versions/<dataVersion>/{manifest.json,bangumi.sqlite}`. It never
creates or reads `current.json`.

The catalog input is the strict YAML pair `display-v1.yaml` and its required
same-directory sibling `staff-sets-v1.yaml`. The display file governs groups,
shortcuts, and common-position presentation; the staff-set file governs
dormant custom sets without silently activating them. Both are schema-checked
and their exact combined identity enters the published Archive manifest. The
accepted producer golden under
`../contracts/goldens/archive/producer/cases/valid-seven-source.json` contains
a compact development example; production callers own the explicit config
path and review its digest as part of the resulting dataVersion.
