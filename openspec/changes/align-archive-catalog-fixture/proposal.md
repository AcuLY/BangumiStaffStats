## Why

The canonical Archive `valid/minimal` bundle passes Archive loading and makes
the process ready, but its handcrafted catalog rows predate the governed
Updater row algorithms. They retain legacy rules, cast-to-cast membership,
old cast presentation/order, incomplete capabilities, an invalid featured
group identity/member order, and omit the group for the fixture's own common
category. The strict Backend catalog projection rejects the first structural
contradiction, so a real application started from this supposedly valid bundle
returns 500 from `GET /api/v1/catalog`. Unit suites miss the defect because
Archive and catalog tests do not cross the actual fixture boundary.

## What Changes

- Correct only the canonical Archive fixture generator's catalog rows for the
  existing three anime positions, one common category, and compact featured
  group by applying the accepted `updater-position-catalog` row algorithms.
- Deterministically rebuild the generator-owned canonical Archive corpus,
  identities, manifests, vectors, and closed root index.
- Add a Backend integration test that loads the unmodified canonical minimal
  bundle and proves both Archive readiness and a successful strict catalog
  projection/HTTP response.
- Keep Backend validation strict. It SHALL NOT translate or accept the
  superseded fixture-only rule form.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `contracts-archive-goldens`: make the canonical minimal Archive a valid
  cross-component catalog fixture and reseal its generator-owned corpus.
- `backend-dynamic-catalog`: require an unchanged real Archive fixture to pass
  through catalog projection and the application route.

## Impact

| Boundary | Declaration |
|---|---|
| Status | Runtime defect reproduced; specified and main-agent reviewed after strict validation. Implementation/verification/commit/archive remain pending. |
| Owner | One bounded implementation agent; main agent reviews the spec, exact candidate, and acceptance. |
| Writable paths | `contracts/schemas/archive/tooling/build_sqlite_fixtures.py`; only the two canonical-index/table seal literals in `contracts/schemas/archive/tooling/verify.mjs`; the existing generator-owned canonical paths under `contracts/goldens/archive/{valid/minimal,invalid/bundles,invalid/json,vectors}` and `contracts/goldens/archive/index.json`; `backend/internal/catalog/*_test.go`; new `backend/internal/app/catalog_archive_integration_test.go`; only the stale partners/co-star expected outcomes and co-star participant ID literals `1/2` → `100/101` in `backend/internal/app/run_test.go`; only the new-test inventory line in `backend/scripts/check.sh`; this change's task markers. |
| Read-only protected inputs | Archive schemas and all verifier logic except the two exact seal literals, producer corpus, catalog API schemas/goldens, governed Updater compiler/tests, Backend production code including `backend/internal/catalog/store.go`, every other request/expectation/assertion in `backend/internal/app/run_test.go`, all other Backend checker logic, frontend, guides, sibling changes, external repositories, and staged frontend work. |
| Deletion complement | No deletion, rename, extra fixture path, unindexed artifact, cache, temp file, or generated residue. |
| Mutable refs | None. |
| Consumes | Accepted Archive schema/generator, `updater-position-catalog` canonical rule semantics, Backend Archive consumer, catalog projector, and catalog wire/goldens. |
| Produces | Resealed canonical Archive fixture bytes plus a real Archive-to-catalog regression test. |
| Dependencies | Existing Python/Node/Go toolchains and repository code only; no new library. |
| Deliverables | Correct rule rows, deterministic corpus/index regeneration, unchanged-fixture integration coverage, and acceptance evidence. |
| Acceptance | Two deterministic fixture regenerations; Archive/catalog verifiers; targeted Archive/catalog/app tests and race; Backend full check; strict OpenSpec; exact-path/diff/residue audit; runtime `/readyz` and `/api/v1/catalog` smoke; the existing application route test proves newly advertised partners/co-star capabilities now reach the unavailable analytics boundary as `503 NOT_READY`. |
| Non-goals | Backend compatibility for legacy rule dialects, Archive/API schema change, new route, product/UI change, data migration, downloaded production Archive, or operations. |
| Operations deferred | Containers, deployment, release, production data generation, activation, monitoring, and host mutation. |
| Stop/rollback conditions | Stop on a required schema/production-code edit, producer-corpus drift, paths outside the existing canonical inventory, non-determinism, index ambiguity, test-time SQL rewrite, staged-path overlap, or external mutation. Rollback is limited to this change's unstaged exact paths. |
| Behavior classification | `INTENTIONAL_DELTA`: correct invalid contract evidence to the already accepted Updater/catalog semantics. Frontend behavior and oracle `644b7748674e553f863d0ffd61d029f86fdc0717` are untouched. |
| External state | No external repository, remote ref, push, tag, release, deploy, service, or production state is touched. |
| Apply gate | Apply is blocked until proposal, specs, design, and tasks pass strict validation and main-agent review. |
