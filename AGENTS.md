# Repository Working Agreement

This file applies to the entire repository. A nested `AGENTS.md` may add
component-specific instructions, but it must not weaken or contradict this
agreement.

The goal is working, maintainable production software. Specifications,
reviews, tests, commits, and deployment evidence are controls around that
goal; they are not substitutes for implementation.

## Sources of truth

Read the documents relevant to the requested change before editing code. Use
this authority order:

1. `PRODUCT.md` for product scope, public behavior, and acceptance.
2. `DESIGN.md` for visual identity and frontend design decisions.
3. `tmp-formal-development/decisions/prototype-data-logic-audit.md` for
   accepted data decisions.
4. `tmp-formal-development/formal-development-master-plan.md` for dependency
   ordering, ownership, and phase gates.
5. The active frontend, backend, updater, data, and operations guides under
   `tmp-formal-development/`.
6. The active change under `openspec/changes/<change-id>/` for the exact
   requested delta.

Accepted specifications under `openspec/specs/`, machine-facing contracts
under `contracts/`, `frontend/ARCHITECTURE.md`, and component READMEs are the
implementation authorities within those boundaries, subject to the order
above.

`openspec/config.yaml` defines the repository-wide OpenSpec conventions and
authority details. If two authorities conflict, stop implementation, identify
the exact conflict, and reconcile the controlling specification first. Do not
silently choose the more convenient interpretation.

The immutable legacy-prototype oracle is commit
`644b7748674e553f863d0ffd61d029f86fdc0717`. It is a reference for observable
frontend behavior, not a source-code architecture to copy.

## Start every task with a preflight

Before making changes:

- Inspect `git status --short --branch`, the current commit, branch, and
  relevant remote state.
- Preserve all unrelated or pre-existing work. Never assume a dirty file is
  disposable.
- Prefer a fresh `codex/<short-topic>` branch from the current `master` for a
  new body of work.
- Inspect the controlling code, tests, contracts, and documentation. Do not
  design from filenames or plans alone.
- Run `openspec list --json` and check whether an active change already owns
  the request.
- State the intended scope and identify any external or live-system mutation
  before performing it.

If an existing dirty worktree overlaps the required files, use another
worktree or ask for direction. Do not hide, reset, or overwrite the overlap.

## OpenSpec is required before implementation

Every substantive development block is OpenSpec-first. This includes:

- a new feature or capability;
- a change to user-visible behavior, interaction, copy, or appearance;
- an API, schema, persisted-data, generated-artifact, or cross-component
  contract change;
- an architectural boundary or ownership change;
- adding, removing, or materially upgrading a dependency or toolchain;
- a deployment, routing, observability, security, or other operations change;
- a refactor whose scope or risk is not mechanically obvious.

A small correction may be implemented directly by the primary agent instead
of being delegated, but that does not remove the OpenSpec gate. It must be
covered by an exact, strict-valid OpenSpec and a completed block-level planning
review, have no conflicting owner, and pass the same acceptance gates.
Examples include a bounded mechanical bug fix, fixture repair, or
documentation correction within an already accepted capability. It must not
create a new capability or public behavior, dependency, contract or schema,
architecture, external state, or broad cleanup.

Pure repository-lifecycle work such as synchronizing process documentation
with already accepted rules, exact staging, OpenSpec synchronization and
archival, commits, and local ref updates may be done directly when it does not
alter product behavior or create conflicting ownership.

When uncertain, treat the work as substantive. Do not split one coherent
feature into nominally “small” corrections to bypass specification.

OpenSpec is a readiness gate, not a reason to delay production code. Once the
proposal, design, delta specs, and tasks are coherent and strictly valid,
review them and begin implementation. Do not keep extending a spec after it is
sufficient, and do not invent unrelated proof systems, control planes, or
enterprise infrastructure around a bounded request.

## OpenSpec lifecycle

Use only the repository-root `openspec/`. Nested OpenSpec roots are forbidden.
Use the matching repository skill under `.codex/skills/openspec-*` for
proposal, update, apply, sync, and archive phases. The primary agent reviews
and amends the specification; apply owners implement its bounded tasks without
silently broadening them.

For a substantive change:

1. Create or update one focused change under
   `openspec/changes/<verb-led-change-id>/`.
2. Complete `proposal.md`, `design.md`, delta specs, and `tasks.md`.
3. Define the exact writable paths, read-only inputs, component owners,
   dependencies, acceptance commands, and stop conditions.
4. Review the artifacts for product and architectural correctness.
5. Run `openspec validate <change-id> --strict`.
6. Implement the tasks in useful vertical or component slices.
7. Record the exact verification evidence and update task status honestly.
8. Sync accepted delta specs into `openspec/specs/`.
9. Archive the completed change and run `openspec validate --all --strict`.

Use ownership prefixes consistently: `contracts-*`, `backend-*`, `updater-*`,
`frontend-*`, and `operations-*`. A change spanning components must still
state which owner controls each writable block.

Keep these states distinct in tasks and handoffs:

- investigated;
- specified;
- implemented;
- verified;
- committed;
- pushed;
- merged;
- released;
- deployed.

Never infer a later state from an earlier one.

## Implementation and delegation

The primary agent owns scope decisions, orchestration, specification review,
cross-component consistency, final audit, and acceptance.

Delegate concrete implementation blocks when parallel work or context
isolation saves more time and attention than delegation costs. Give each
subagent a bounded, non-overlapping writable scope, explicit inputs, acceptance
commands, and stop conditions. One block has one implementation owner.

Do not create a subagent for a small edit that the primary agent can complete
and verify faster. The primary agent may directly handle small fixes,
specification edits, staging, change archival, commits, references, and other
short lifecycle work.

All agents share the filesystem. Before editing, check for concurrent changes;
after handoff, audit the actual diff and rerun the relevant acceptance. A
subagent report is evidence to inspect, not proof by itself.

## Component boundaries

- `contracts/` owns public schemas, OpenAPI, golden fixtures, and artifact
  contracts. Change contracts before consumers and regenerate every generated
  consumer rather than hand-editing generated files.
- `backend/` is the sole authority for statistical computation and query
  semantics.
- `updater/` is an immutable Archive producer. It does not serve public query
  traffic or become a second statistics implementation.
- `frontend/` presents backend results. It must not recreate statistical
  formulas, filtering authority, or hidden data semantics in the browser.
- `operations/` consumes accepted build artifacts and configures the minimal
  single-host runtime. It must not patch application behavior during deploy.

Keep dependencies directed along these boundaries. Any new dependency needs a
specific maintenance owner, a reason the standard library or existing
dependency is insufficient, compatibility and license checks, and a
proportional verification plan.

## Frontend fidelity and Impeccable

Unless an approved OpenSpec explicitly defines an intentional delta, frontend
work must preserve the legacy prototype's final external appearance and
interaction behavior exactly. This includes content hierarchy, wording,
controls, states, navigation, loading and error behavior, responsive behavior,
and the visual character of the interface.

New planned functionality should look and behave like a native extension of
that product. Refactor the prototype's internal structure freely where needed,
but do not “improve,” restyle, simplify, or reinterpret the external product
without explicit scope.

For frontend design or UI work:

1. Read `.agents/skills/impeccable/SKILL.md`.
2. Run `node .agents/skills/impeccable/scripts/context.mjs` once in the working
   session, optionally with `--target <path>`.
3. Load the relevant Impeccable playbook and craft-floor guidance.
4. Treat `PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json`, the relevant
   surface brief, the oracle commit, and the accepted OpenSpec as the visual
   and behavioral authorities.
5. Verify representative desktop and mobile viewports, keyboard behavior,
   accessibility, browser console state, and the built artifact.

Visual QA must compare rendered behavior, not merely source structure or test
snapshots.

## Validation

Run focused tests while developing, then the complete affected-component gate
before handoff:

```sh
# Backend
cd backend
./scripts/check.sh

# Frontend
cd frontend
npm ci --ignore-scripts --no-audit --no-fund
npm run check

# Updater
cd updater
uv python install 3.14.6
uv sync --frozen --python 3.14.6
PYTHONDONTWRITEBYTECODE=1 uv run --frozen pytest
PYTHONDONTWRITEBYTECODE=1 uv run --frozen mypy src tests
PYTHONDONTWRITEBYTECODE=1 uv run --frozen ruff check .
PYTHONDONTWRITEBYTECODE=1 uv run --frozen ruff format --check .
uv lock --check --offline

# Contract artifacts
node --test contracts/artifacts/test/*.test.mjs
```

Also run strict OpenSpec validation for substantive changes and
`git diff --check` for every change. Add contract, integration, browser, build,
or container checks when the affected surface requires them.

Use the versions pinned by the repository and CI. Upgrade them only through an
approved, independently verifiable change.

If the local environment is unsuitable or local execution has been ruled out,
use the green `development-artifacts` GitHub Actions workflow and an explicitly
approved container or remote target as the acceptance authority. State exactly
what ran and where. Never report a check as passed because it was expected to
pass.

## Git and review

- Stage exact owned paths; do not use `git add -A` in a shared or dirty
  worktree.
- Make phase-sized commits with messages that describe the completed outcome.
- Inspect the staged diff before every commit and the branch diff before push.
- When remote integration is explicitly authorized, push the topic branch and
  use a pull request.
- Require green applicable checks and review the exact accepted commit before
  merge.
- Keep product implementation, generated artifacts, specifications, and
  operational changes traceable in the same change or clearly linked changes.
- Never use `git reset --hard`, destructive checkout, `git clean`, or broad
  deletion to resolve unrelated work.

Merging code is not deployment. Report the branch, commit, push, pull request,
merge, release, and deployment states separately.

## Operations and deployment

Repository operations definitions, writes to a host, service activation,
public routing, and old-service retirement are separate actions.

Follow `operations/README.md` and keep the scope to the approved single-host
container deployment plus the planned health, metrics, and logging
observability. Do not introduce a bespoke supply-chain proof platform,
multi-host control system, or fault-injection program unless requested by an
accepted change.

Live host mutations require explicit authorization. Before them:

- identify the exact host, paths, services, ports, routes, and current state;
- confirm a verified `linux/amd64` artifact and the intended configuration;
- protect secrets and unrelated services;
- prepare and test the smallest practical rollback;
- verify health, metrics, logs, public routing, restart recovery, and
  non-interference after activation.

For `search.bgmss.fun`, preserve the currently accepted route contract unless
a new operations change says otherwise: legacy remains at the root path and
the new application is under `/v2/`.

## Completion criteria

A change is complete only when:

- the requested production behavior is implemented;
- code, tests, contracts, documentation, and accepted specs agree;
- targeted and complete affected gates are green;
- frontend work has no unintended visual or interaction drift;
- generated artifacts are current and reproducible by their documented
  generators;
- the diff contains only intended work and passes `git diff --check`;
- OpenSpec is synced and archived when required;
- the accepted commit is pushed and merged when integration is in scope;
- any deployment requested by the user is verified on the real target; and
- the final report accurately names anything not run, not merged, or not
  deployed.

Stop and surface the evidence when authority conflicts, required approval is
missing, a concurrent edit overlaps the writable scope, acceptance fails, or
the necessary fix would materially expand scope.
