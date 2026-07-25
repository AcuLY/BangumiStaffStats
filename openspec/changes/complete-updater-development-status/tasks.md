## Task Boundary

| Field | Declaration |
|---|---|
| Status | Investigated/specified: complete after strict validation/main-agent review. Implemented/verified/committed/pushed/released/deployed: no. |
| Owner | Contracts owner: group 1. Updater owner: group 2. Both deliver unstaged candidates without editing this file. Main agent: combined acceptance, task-marker updates, and lifecycle work. |
| Writable paths | Group 1: `contracts/schemas/update-status/{.gitignore,update-status-v1.schema.json,golden-index.schema.json}`, `contracts/schemas/update-status/tooling/{verify.mjs,package.json,package-lock.json}`, `contracts/goldens/update-status/index.json`, and `contracts/goldens/update-status/cases/{first-failure.json,canceled.json,no-change.json,published.json,invalid.json}`. Group 2: `updater/src/bangumi_staff_stats_updater/{cli.py,update_status.py}`, `updater/src/bangumi_staff_stats_updater/producer/service.py`, `updater/tests/{test_cli.py,test_update_status.py}`, and `updater/tests/producer/test_service.py`. Only the main agent may update this change's task markers after owner handoff/acceptance. |
| Read-only protected inputs | PRODUCT/DESIGN/oracle, formal master/development/operations guides, all non-listed contracts/updater paths, backend/frontend, other OpenSpec artifacts, external repositories, refs/remotes, host/service/production state. |
| Deletion complement | None. |
| Mutable refs | None during apply. |
| Consumes | Existing producer results/errors/cancellation; backend guide section 13.3; approved `contracts-update-status` shape. |
| Produces | Closed shared status contract plus updater lifecycle events/atomic terminal status. |
| Dependencies | `establish-formal-rewrite-baseline`, `bootstrap-updater-runtime`, `produce-immutable-archive`, `implement-backend-http-and-observability`; group 2 consumes group 1's approved contract bytes at combined acceptance. |
| Deliverables | Schema/goldens/verifier and local three-entry `.gitignore`; status module, phase observer, CLI wiring; deterministic terminal/fault tests. |
| Acceptance | Contract verifier, focused and full updater quality gates, exact no-residue/owned-path diff, strict OpenSpec, and `git diff --check`; browser acceptance is not applicable. |
| Non-goals | Producer semantic rewrite, dependency addition, history/exporter, activation, scheduling, locking, fixed production paths, deployment, or external mutation. |
| Operations deferred | `current.json`, `update_activated`, timer, `flock`, systemd, production directories/modes, deploy/restart/readiness, retention/alerts, and rollback activation. |
| Stop/rollback conditions | Each owner stops if branch/HEAD/review status differs, another owner edits its paths, or a non-listed path/new dependency/activation/external mutation is needed. Revert only owned uncommitted hunks; never use `reset --hard`, checkout rollback, `git clean`, `git add -A`, broad recursive deletion, or remove an inactive Archive. |

## 1. Contracts owner — shared status contract

- [ ] 1.1 Preflight branch, HEAD, dirty paths, exact writable inventory, completed
  artifact status, strict validation, and main-agent approval; stop without
  edits on any mismatch.
- [ ] 1.2 Implement the closed status and golden-index schemas, exact five-case
  bundle, deterministic contained-file verifier, and locked verifier package
  using only group-1 paths; add the local `.gitignore` with exactly
  `.cache/`, `.tmp/`, and `tooling/node_modules/`.
- [ ] 1.3 Run `npm ci --prefix contracts/schemas/update-status/tooling`,
  `npm --prefix contracts/schemas/update-status/tooling run verify`, rerun the
  verifier for determinism, remove only generated owned tool residue, prove
  `.cache/`, `.tmp/`, and `tooling/node_modules/` are absent, confirm the
  indexed inventory, and hand off an unstaged candidate without editing task
  markers.

## 2. Updater owner — events and atomic status

- [ ] 2.1 Preflight branch, HEAD, dirty paths, exact writable inventory,
  approved schema shape, completed artifact status, strict validation, and
  main-agent approval; stop without edits on any mismatch.
- [ ] 2.2 Implement `update_status.py`, the optional producer phase observer,
  required caller-selected `--status-file`, exact lifecycle stream, terminal
  state transitions, sanitization, and same-directory atomic replace using no
  new dependency and only group-2 paths.
- [ ] 2.3 Add deterministic published/no-change/failure/cancellation, phase
  interruption, prior-success retention, unsafe-path, malformed-prior-state,
  and injected write/flush/sync/replace fault tests; prove unchanged Archive
  identity/publication results with and without the observer.
- [ ] 2.4 Run
  `uv run --frozen pytest tests/test_cli.py tests/test_update_status.py tests/producer/test_service.py`,
  `uv run --frozen pytest`, `uv run --frozen mypy src tests`,
  `uv run --frozen ruff check .`, `uv run --frozen ruff format --check .`, and
  `uv build` from `updater/`; preserve the preflight-observed ignored
  `.venv/` and `.cache/`, remove only task-created `.tmp/` and `dist/`
  residue, and hand off an unstaged candidate without editing task markers.

## 3. Combined development acceptance

- [ ] 3.1 Main agent reviews both owned diffs against the schema/event/status
  matrix, confirms zero writes outside listed paths and no
  `current.json`/`update_activated`/timer/`flock`/systemd/production/deploy
  behavior, reruns the Contracts verifier, full updater gates,
  `openspec validate complete-updater-development-status --strict`, and
  `git diff --check`; only after each owner passes may the main agent mark its
  corresponding tasks implemented/verified.
- [ ] 3.2 Stop at an accepted local development candidate. Staging, commit,
  sync/archive, push, tag, release, deploy, and activation remain separately
  recorded lifecycle states; this task authorizes none of the remote or
  operations states.
