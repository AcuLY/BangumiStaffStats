## Context

The current OpenAPI root removes the three approved query-sharing component references. Its SHA-256 is 999272f4fcd204c1dfecbe1948c77abcf29230dc1e8a76eb7549c386cab09260; artifact code still pins e7aba7c34b0d6f74e533e8e9fd31c8f0aa40ed15c440669ec87a7204c963cf11. This is stale packaging identity, not a request to change API behavior. The last initial bundle was about 306 KiB gzip.

## Goals / Non-Goals

Goals: synchronize exact OpenAPI identity; retain rejection of mismatched artifacts; raise the initial budget to 350 KiB; verify real builds.

Non-goals: dependencies, UI changes, new schemas, live deployment, product-change archival, replacing existing dirty work, or complete backend runtime acceptance.

## Decisions

1. Keep the existing explicit digest pins; update them together after reviewing the source delta and generated-wire checks. Add one test comparing the actual source digest to the contract constant and Backend shell pin. No runtime-derived acceptance value.
2. Set the strict threshold to 350 * 1024 bytes. Preserve gzip calculation and initial entry/modulepreload selection. At or above 358400 bytes still fails. The user authorized an increase without a numeric value; 350 KiB supplies bounded headroom above the current build.
3. Synchronize the two existing positive component fixtures; artifact and SBOM payloads remain byte-identical. Pin OpenAPI LF in .gitattributes because this identity is byte-sensitive.

## Ownership and acceptance

| Boundary | Declaration |
|---|---|
| Owner | Primary for Contracts, Backend packaging, Frontend checker and specifications |
| Writable paths | .gitattributes; contracts/artifacts/lib/validation.mjs; contracts/artifacts/test/contracts.test.mjs; contracts/artifacts/fixtures/positive/{backend,frontend}/component-statement.json; backend/build/{build.sh,artifact_test.go}; frontend/scripts/check-production-artifact.mjs; frontend/README.md; this change; openspec/specs/{contracts-artifact-compatibility,frontend-foundation,frontend-design-system}/spec.md |
| Read-only inputs | PRODUCT.md; DESIGN.md; OpenAPI and schemas; other changes and dirty hunks; source/generated consumers; data; operations; process guides |
| Dependencies | Reviewed current OpenAPI from contracts-remove-query-sharing and schema consumers from the existing product changes |
| Acceptance | Pinned frontend npm run check; node --test contracts/artifacts/test/*.test.mjs; Go 1.26.5 go test ./build; shell syntax; synthetic artifact boundary check; owned git diff --check; strict spec validation |
| Mutable refs / external writes | None; master 3612f50; local ignored outputs only |
| Stop conditions | Source digest changes during work; conflicting owners; required fix exceeds packaging scope; never relax mismatch checks |

## Risks / Trade-offs

A higher threshold allows larger initial downloads; retain a finite hard gate. Existing dirty source and other incomplete changes can fail unrelated tests; report those separately and do not mark their acceptance complete. Root OpenAPI identity does not replace referenced schema drift checks.

## Additional reviewed contract mismatch

The frontend packager still emits SQLite schema range 1..1 although the accepted matrix and fixtures use 1..2. Synchronize frontend/build/artifact.mjs to 1..2 using the Contracts-owned supported version constant, and assert the emitted range in frontend/build/test.mjs. These two additional writable paths remain packaging-only; no Archive schema or runtime change. This is required to complete the user-requested contract synchronization.
