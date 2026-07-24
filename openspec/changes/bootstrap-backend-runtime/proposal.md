## Why

Wave 1A established the shared query and Archive contracts, but the formal
rewrite still has no backend runtime. This change creates the smallest
production-shaped Go foundation that proves lifecycle, dependency direction,
generated wire types, and direct consumption of both shared contract bundles.

## What Changes

- Create one `backend/` Go module using Go `1.26.5`.
- Add an empty standard-library HTTP process with bounded graceful shutdown;
  no product, readiness, metrics, image, or placeholder endpoint is introduced.
- Generate query DTOs at the HTTP adapter boundary with
  `oapi-codegen/v2@v2.8.0`.
- Consume selected positive and negative query/Archive golden cases directly
  from `contracts/**`.
- Add executable architecture, generation-drift, test, race, vet, build, and
  cleanup checks with backend-local disposable state.

Behavior classification:

- `PRESERVE_ORACLE`: no visible product behavior or statistical result changes.
- `INTENTIONAL_DELTA`: the empty legacy backend is replaced by a formal Go
  module and terminating API shell.
- `NEW_CAPABILITY`: generated contract adapters, shared contract tests, and
  enforceable package direction.

## Capabilities

### New Capabilities

- `backend-runtime-foundation`: Defines the formal Go module, empty HTTP
  lifecycle, architecture guard, generated query adapter, shared contract
  tests, and quality gates.

### Modified Capabilities

None.

## Impact

| Boundary | Declaration |
|---|---|
| Status | investigated: complete; specified: approved; implemented: no; verified: current Go/tool research, final baseline rebind, main semantic review, targeted/all strict validation, and OpenSpec doctor passed; committed: planning status is determined by the containing Git history; pushed/released/deployed: no |
| Owner | Main owns spec, acceptance, lifecycle, and simple corrections. One backend implementation subagent owns `backend/**` and this change's apply task markers. |
| Writable paths | Planning: this five-file change. Apply: `backend/**` and task checkboxes. Lifecycle: exact archive and `openspec/specs/backend-runtime-foundation/spec.md`. |
| Protected inputs | `contracts/**`, root specs/archives, Node pins/spec, Impeccable/PRODUCT/DESIGN/surface artifacts, frontend/updater changes and outputs, `.vscode/**`, formal guides, remotes, and production. |
| Mutable refs | Local `codex/formal-rewrite` planning and accepted foundation commits only; no amend/rebase/push/tag/PR/release/deploy. |
| Dependencies | Accepted Wave 1A contracts, Node/Impeccable baseline, Go `1.26.5`, and `oapi-codegen/v2@v2.8.0`. |
| Acceptance | Exact module/tool versions; generated drift check; lifecycle/architecture/query/Archive tests; `go test -race`, vet, build, strict OpenSpec, Git boundary checks; no disposable residue. |
| Non-goals | Business endpoints, query normalization, statistics, archive runtime store, collection/cache/image proxy, external network calls, operations, or legacy deletion. |
| Stop conditions | Stop on contract/spec drift, overlapping writer, unexpected repository mutation, wrong toolchain, or failed quality gate. Preserve the bounded candidate; do not reset or broadly clean. |
