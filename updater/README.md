# Bangumi Staff Stats updater foundation

This directory contains the installable, one-shot Python updater foundation.
It currently checks the shared Archive contract only. It does not acquire data,
build or publish an Archive, activate a version, or run a resident process.

## Toolchain

- CPython `3.14.6`
- uv `0.11.32`
- package version `0.1.0`

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
```

The contract checker reads the supplied `contracts/` tree without copying,
caching, editing, or opening any golden SQLite file as a database.
