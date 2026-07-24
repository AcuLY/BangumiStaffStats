## Context

The accepted Archive contract under `contracts/schemas/archive/**` and
`contracts/goldens/archive/**` is the sole authority. Wave 1A completed at
`ab75c35511b681eeb5061fb8d3f658164c2c1c92`. The shared Wave 1B planning
checkpoint is based on `acb722cc25b344f85feb3c0f5fb081d3e3702e89`,
which includes the accepted Node 24 and Impeccable v4 baselines.

| Boundary | Declaration |
|---|---|
| Status | investigated: complete; specified: approved; implemented: no; verified: current Python/tool research, final baseline rebind, main semantic review, targeted/all strict validation, and OpenSpec doctor passed; committed: planning status is determined by the containing Git history; pushed/released/deployed: no |
| Owner | One updater subagent writes `updater/**`; main owns planning and acceptance. Backend/frontend owners have disjoint paths. |
| Scope | Installable one-shot package, read-only Archive contract adapter, deterministic CLI, and local quality tooling. |

## Goals / Non-Goals

Goals:

- exact Python/package/tool versions and a committed lock;
- terminating equivalent module/console entry points;
- direct read-only consumption of the shared Archive authority;
- canonical dataVersion reproduction and selected golden outcomes;
- clean build/install/test/type/lint evidence.

Non-goals:

- Archive/common download, full SQLite construction, catalog/cast/domain
  derivation, publishing, activation, real `current.json`, status lifecycle,
  scheduling, locking, long-running services, host/production mutation, or
  deployment.

## Decisions

### Use one narrow src-layout package

The persistent inventory is:

```text
updater/.gitignore
updater/README.md
updater/pyproject.toml
updater/uv.lock
updater/src/bangumi_staff_stats_updater/__init__.py
updater/src/bangumi_staff_stats_updater/__main__.py
updater/src/bangumi_staff_stats_updater/archive_contract.py
updater/src/bangumi_staff_stats_updater/cli.py
updater/src/bangumi_staff_stats_updater/py.typed
updater/tests/conftest.py
updater/tests/test_archive_contract.py
updater/tests/test_cli.py
```

Distribution: `bangumi-staff-stats-updater`; import package:
`bangumi_staff_stats_updater`; console command: `bgmss-updater`; version:
`0.1.0`; Python: `>=3.14.6,<3.15`. Both entry points call the same typed
`main(args: Sequence[str] | None) -> int`. Imports perform no filesystem,
network, subprocess, logging, environment, or background work.

### Keep the CLI terminating and truthful

Stdlib `argparse` provides `--help`, `--version`, `doctor`, and
`contract-check --contracts-root <path>`. It fixes `prog`, disables
abbreviations, sanitizes usage errors, and returns:

```text
doctor success            {"code":"FOUNDATION_READY","status":"ok","version":"0.1.0"} LF  exit 0
contract-check success    {"code":"VALID","status":"ok"} LF                              exit 0
contract input fault      {"code":"CONTRACT_INPUT_INVALID","status":"error"} LF           exit 1
contract expectation fail {"code":"CONTRACT_CHECK_FAILED","status":"error"} LF            exit 1
usage fault               {"code":"USAGE_ERROR","status":"error"} LF                      exit 2
unexpected fault          {"code":"INTERNAL_ERROR","status":"error"} LF                   exit 70
```

Success JSON is stdout-only; error JSON is stderr-only; outputs are sorted,
compact, at most 256 bytes, and contain no timestamp, cwd, absolute path,
environment, traceback, raw schema error, fixture content, or secret.
`--version` is exactly `bgmss-updater 0.1.0\n`.

No `build`, `publish`, `activate`, `serve`, `watch`, `daemon`, or `schedule`
command is exposed.

### Consume the shared Archive bundle directly

The caller supplies the repository `contracts/` root. The adapter:

- resolves only contained regular non-symlink inputs;
- strictly parses one UTF-8 JSON value, rejecting BOM, trailing data, duplicate
  keys, and non-finite constants;
- validates JSON Schema 2020-12 authorities with `jsonschema`;
- validates the closed indexed file/hash set, compatibility tuple, canonical
  DDL digest, seven source identities, source accounting, and dataVersion;
- never edits/copies/caches a schema or golden and never opens a runtime store.

Producer-side semantic tests cover:

```text
valid/minimal/archive-manifest.json                         VALID
vectors/data-version.json                                  VALID
invalid/json/manifest-bad-digest.json                      MANIFEST_SCHEMA_INVALID
invalid/json/manifest-unknown-field.json                   MANIFEST_SCHEMA_INVALID
invalid/json/manifest-unsafe-sqlite-file.json              MANIFEST_SCHEMA_INVALID
invalid/json/manifest-source-accounting-mismatch.json      MANIFEST_ACCOUNTING_INVALID
invalid/bundles/sqlite-unsupported-schema/archive-manifest.json
                                                            ARCHIVE_VERSION_UNSUPPORTED
invalid/bundles/manifest-data-version-mismatch/archive-manifest.json
                                                            DATA_VERSION_MISMATCH
```

The adapter reproduces `bgmss-archive-data-version-v1` from the exact ordered
LF-delimited fields and shared vector. Generic JSON canonicalization, current
pointer activation, and full SQLite validation are outside this foundation.

### Pin the dependency and quality boundary

Direct runtime dependency: `jsonschema==4.26.0`.

Development/build tools:

```text
pytest==9.1.1
mypy==2.3.0
ruff==0.16.0
hatchling==1.31.0
uv==0.11.32
```

`uv.lock` records the complete graph from official PyPI. The package requires
wheel-compatible locked dependencies, builds one local wheel through pinned
Hatchling, and contains no test/contract/cache/local-path content. Runtime
metadata contains only the intended application dependency.

No framework, HTTP client, ORM, dataframe library, queue, or dependency
injection library is admitted.

### Keep tooling local and disposable

The implementation may obtain exact uv `0.11.32` and uv-managed CPython
`3.14.6` into `updater/.tmp`/`updater/.cache`; downloads use official sources
and exact versions. All environments, caches, wheels, build output, reports,
and temporary files stay under:

```text
updater/.cache/
updater/.tmp/
updater/.venv/
```

The three roots are ignored and removed individually after verification using
canonical containment and no-follow checks. Cleanup never targets a parent,
glob, sibling root, or foreign path. No custom redirect transcript,
fault-injection suite, or multi-retry filesystem protocol is required.

## Verification

- Frozen lock/install and clean development/runtime environment smoke.
- Exact console/module help, version, doctor, success/error JSON, exit status,
  termination, and import-purity tests.
- All selected indexed Archive cases and shared dataVersion vector.
- `pytest`, strict mypy, Ruff lint, and Ruff format check.
- Wheel build, payload/metadata inspection, clean install, import, and both
  entry points.
- Strict targeted/all OpenSpec, OpenSpec doctor, Git diff/path/dependency
  checks, protected contract hashes, and no disposable/ignored residue.

## Risks / Trade-offs

- Python/uv/package acquisition requires network during setup; later tests and
  CLI checks are local-only.
- `jsonschema` is the sole runtime dependency and supply-chain addition.
- The foundation deliberately does not prove full producer or activation
  semantics.

## Migration Plan

1. Rebind and approve all three Wave 1B changes in one planning checkpoint.
2. Run updater, backend, and frontend owners in parallel on disjoint roots.
3. Main accepts each candidate independently.
4. Archive/sync accepted changes and commit the bounded foundation phase.

## Open Questions

None.
