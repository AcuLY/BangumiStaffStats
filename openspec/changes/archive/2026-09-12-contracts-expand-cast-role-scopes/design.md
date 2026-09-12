## Context

Storage already retains numeric roles 1..6, but catalog generation and key validators admit only main/all; details collapse 4..6 to 其他. Existing workspace changes are preserved. Active co-star position-scope work is consumed without modifying its artifacts.

## Goals / Non-Goals

Goals: seven scopes for anime/game, true role labels everywhere, unchanged main/all identities and eligibility. Non-goals: restyling, formulas, multiple simultaneous cast scopes in SharedQuery, deployment or changes to other active work.

## Change boundary

The complete boundary table in proposal.md applies unchanged. Owner write partition:
- Contracts owner: contracts/schemas/, contracts/openapi/, contracts/goldens/ cast-specific schemas/validators/fixtures/indexes and README text; backend/internal/httpapi/wire/ generated files and frontend/src/api/generated/ generated files only. Regenerate every affected consumer with documented generators.
- Backend owner: backend/internal/archivebuild/, backend/internal/catalog/, backend/internal/query/, backend/internal/persondetail/, backend/internal/costar/, backend/internal/app/ cast behavior and relevant existing tests, plus affected backend contract-pinning tests after consulting contract owner and the exact generated digest pin in backend/scripts/generate-catalog-wire.sh.
- Primary frontend/docs owner: frontend/src/api/ non-generated adapters/model declarations; frontend/src/features/{catalog,query,co-star,person-detail}/ cast identity filtering; corresponding frontend/tests/ and fixture expectations; PRODUCT.md; cast paragraphs only in DESIGN.md and tmp-formal-development/ guides/decisions; this change and cast clauses of accepted specs; .tmp/cast-role-scopes/ evidence.

## Decisions

1. Stable scopes map main=1, supporting=2, guest=3, minor=4, narrator=5, voice-library=6, all=1..6. Preserve main/all keys. Unknown scopes, mismatched rules and out-of-domain roles remain errors.
2. Display main as 声优（主役）; each new scope uses the actual Chinese type without 仅. All remains 声优, preserving the current all label. Role labels are 主役/配角/客串/闲角/旁白/声库. Do not return 其他 for any valid role.
3. SharedQuery keeps existing cast exclusivity per subject type. Separate people may hold different exact identities in all-scope co-star. Canonical all-position browsing omits every individual cast identity when all is available; explicitly chosen identity still survives detail, co-star and same-tab recovery.
4. Exact credits, valid_cv, raw work intersections and series/statistical semantics stay unchanged. Catalog config groups expose all seven options, preserving existing featured shortcuts. UI stays catalog-driven with the same Naive selector and tags.
5. Contracts -> regeneration -> backend/frontend -> integration verification. No dependencies added. Archive schema remains unchanged; rebuilt catalog/config creates the appropriate immutable version through existing derivation. Existing data is not edited in place.
6. Compare incumbent desktop/mobile selector and detail render with the accepted visual rules/oracle; only new choices and approved labels may differ.

## Risks / Trade-offs

Closed schema patterns and hardcoded catalog seals span multiple consumers; update all with generators and semantic tests. All-position candidate duplication must be tested. A local archive built before the change may lack the new choices until rebuilt; local QA uses an isolated copied/generated archive. Dirty UI tests require hunk preservation. Full gates may reveal existing environment failures, which must be reported accurately and not silently bypassed.


## Verification scope refinement

The backend owner may additionally write temporary backend/.tmp/cast-role-scopes/ helpers required by Go internal package visibility. Published QA archive/executables and an isolated full-gate workspace stay under root .tmp/cast-role-scopes/. Existing local archive data remains read-only. Local frontend preview may be stopped/restarted to release the Windows module lock for pinned npm ci; the same command and port are restored.

## Artifact identity consequences

Contract source changes require regenerating contracts/artifacts/producer-runtime-inputs-v1.json (or its existing canonical manifest path), updating the corresponding artifact constants, positive fixtures and tests under contracts/artifacts/, plus backend/build/ accepted OpenAPI/runtime-input manifest pins and linked artifact tests. The backend owner owns this exact identity synchronization. It changes no packaging behavior or dependency. Existing contracts-sync-artifact-acceptance change artifacts remain protected. Acceptance adds pinned Node artifact tests and WSL go test -tags artifacts ./build.
