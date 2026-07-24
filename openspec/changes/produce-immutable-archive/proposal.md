## Why

The updater foundation can validate contract evidence but cannot yet turn the
authoritative upstream sources into a complete immutable Archive. This change
adds that one-shot producer only after the accepted Go consumer can serve as
the independent final gate.

## What Changes

- Acquire one exact `bangumi/Archive` release asset and one exact
  `bangumi/common` commit into an isolated staging root, verifying identity,
  size, and SHA-256 before parsing.
- Stream the seven Archive JSONLines sources into a newly created SQLite v1
  database, with strict source accounting, quality/integrity gates, canonical
  dataVersion, and a final manifest/digest graph.
- Produce an inactive `versions/<dataVersion>` candidate and prove it with the
  accepted Go consumer; any failure leaves no consumable version.
- Add Contracts-owner synthetic producer goldens before the Updater owner
  consumes them. Never write `current.json`, activate, schedule, lock, restart,
  or deploy.

Behavior classification: `NEW_CAPABILITY`. The immutable prototype oracle
`644b7748674e553f863d0ffd61d029f86fdc0717` contains no Archive producer or
user-visible behavior affected by this change.

## Capabilities

### New Capabilities

- `updater-archive-producer`: One-shot acquisition, streaming construction,
  validation, inactive publication, and Go-consumer smoke.
- `contracts-archive-goldens`: Contracts-owned synthetic producer inputs and
  expected cross-language Archive cases.

### Modified Capabilities

None.

## Impact

| Boundary | Declaration |
|---|---|
| Status | investigated: complete; specified: approved; implemented: no; verified: main semantic/dependency review, strict change/all validation, and doctor passed; committed: determined by containing Git history; pushed/released/deployed: no |
| Owner | Contracts owner writes producer goldens first; one Updater owner then implements and consumes them; main agent reviews and accepts both blocks. |
| Writable paths | Planning: `openspec/changes/produce-immutable-archive/**`. Contracts apply block: `contracts/goldens/archive/index.json`, `contracts/goldens/archive/producer/**`, and its task markers only. Updater apply block: `updater/pyproject.toml`, `updater/uv.lock`, `updater/README.md`, `updater/src/bangumi_staff_stats_updater/archive_contract.py`, `updater/src/bangumi_staff_stats_updater/cli.py`, `updater/src/bangumi_staff_stats_updater/producer/**`, `updater/tests/test_archive_contract.py`, `updater/tests/test_cli.py`, `updater/tests/producer/**`, and its task markers only. |
| Read-only protected inputs | `contracts/schemas/archive/**`, all other `contracts/**`, accepted root specs, backend consumer code/tests, guides, PRODUCT/DESIGN, all other code/changes, Git refs/remotes, external repositories except declared read-only HTTPS acquisition, hosts, and production. |
| Deletion complement | None; existing authority, goldens, runtime behavior, and files may not be deleted. |
| Mutable refs | None; apply may not stage, commit, archive, switch/amend refs, or push. |
| Consumes | The accepted `correct-archive-subject-semantics` revision of `contracts-archive-manifest`, `updater-runtime-foundation`, Contracts-owner producer goldens, one caller-supplied acquisition/build request, and accepted `backend/cmd/archive-smoke`. |
| Produces | Contracts: indexed synthetic producer cases. Updater: one fully closed inactive version directory containing only `manifest.json` and `bangumi.sqlite`, plus bounded command/status evidence outside that version. |
| Dependencies | `define-archive-manifest-contract` and `bootstrap-updater-runtime` are accepted; apply is explicitly blocked until `correct-archive-subject-semantics` has exited and `implement-backend-archive-consumer` is accepted. CPython/uv remain foundation-pinned; the only proposed new runtime dependency is PyYAML `6.0.3`. |
| Deliverables | Strict producer CLI/API, acquisition and staging, streaming SQLite builder, canonical schema SQL/35-object seal plus accounting/quality/integrity gates, deterministic identity/manifest finalization, synthetic goldens, Go-consumer full smoke, tests, lock and documentation. |
| Acceptance | Goldens precede updater consumption; identical semantic inputs reproduce dataVersion/logical rows; source, weakened-schema, and failure matrices pass; final bytes pass the accepted Go consumer; full upstream smoke stays disposable; strict Python/OpenSpec/dependency/inventory/residue gates pass. |
| Non-goals | `current.json`, activation/switch/rollback, scheduler/daemon/`flock`, API restart, hot reload, HTTP/query/catalog feature work, production paths, operations, release, or deploy. |
| Operations deferred | Periodic acquisition, production credentials/roots, activation transaction, retention, restart/readiness orchestration, systemd/Compose/nginx, monitoring deployment, and rollback remain later operations changes. |
| Stop/rollback conditions | Stop before mutation on dependency/authority/path drift. On any acquisition, parse, accounting, quality, SQLite, manifest, or consumer failure, close resources and remove only the owned staging/candidate path; preserve prior versions and protected inputs and publish no consumable candidate. |

Dependency/version research is read-only. PyPI identifies PyYAML `6.0.3` as
the latest release, MIT licensed, Python `>=3.8`, with CPython 3.14 wheels; the
canonical repository documents `safe_load` for untrusted input. The standard
library covers HTTPS, hashing, archive extraction, JSONLines, SQLite, and atomic
rename but has no YAML parser, so no HTTP/ORM/dataframe/scheduler framework is
admitted. This change mutates no other repository or external state; push, PR,
tag, release, deployment, host mutation, and production activation require
later explicit authorization.

Apply is blocked until all four artifacts pass strict validation and main-agent
review, and until `implement-backend-archive-consumer` reaches accepted status.
