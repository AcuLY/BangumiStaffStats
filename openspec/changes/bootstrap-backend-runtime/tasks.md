## Task Boundary

| Boundary | Declaration |
|---|---|
| Status | investigated: complete; specified: approved; implemented: no; verified: current Go/tool research, final baseline rebind, main semantic review, targeted/all strict validation, and OpenSpec doctor passed; committed: planning status is determined by the containing Git history; pushed/released/deployed: no |
| Owner | One backend implementation subagent owns tasks 2–5; main owns planning, acceptance, archive, staging, and commits. |
| Writable paths | `backend/**` and this file's task markers only during apply. |
| Stop conditions | Stop on planning HEAD/index/contract drift, overlapping writer, wrong toolchain, out-of-scope mutation, or failed gate. |

## 1. Planning — main

- [x] 1.1 Rebind the final Node/Impeccable/Wave 1A baseline, current Go/tool versions, owner model, and protected paths.
- [x] 1.2 Strict-validate and approve proposal/design/spec/tasks in the shared Wave 1B planning checkpoint.

## 2. Module and lifecycle — backend owner

- [ ] 2.1 Verify the approved planning HEAD, empty index, shared contract/root-spec presence, sibling writer boundaries, and absent `backend/` runtime before writing.
- [ ] 2.2 Create the exact module/config/README/scripts inventory with Go `1.26.5`, backend-local disposable state, and pinned `oapi-codegen/v2@v2.8.0`.
- [ ] 2.3 Implement and test the supplied-listener empty HTTP lifecycle, application assembly, signal-aware main, bounded graceful shutdown, error propagation, and empty-mux 404.
- [ ] 2.4 Implement the standard-library architecture guard for the approved package direction and forbidden module/name cases.

## 3. Shared contract adapters — backend owner

- [ ] 3.1 Generate only `internal/httpapi/wire/query_wire.gen.go` from the shared OpenAPI bundle with `models,skip-prune`; add byte-stable check mode.
- [ ] 3.2 Add strict query adapter tests for the selected shared positive and structural-negative cases without implementing business semantics.
- [ ] 3.3 Add Archive contract tests for the indexed minimal-valid and selected negative cases without copying the authority or creating a runtime store.

## 4. Quality and handoff — backend owner

- [ ] 4.1 Run generated drift, formatting, targeted tests, `go test ./...`, `go test -race ./...`, `go vet ./...`, and build the API binary to disposable state.
- [ ] 4.2 Verify exact persistent inventory, dependency/module/route/feature denylists, protected contracts/sibling state, strict OpenSpec, Git diff checks, and no cache/temp/binary residue.
- [ ] 4.3 Mark completed apply tasks and hand main an unstaged candidate with concise commands/results; do not stage, commit, archive, push, or start later backend features.

## 5. Acceptance and lifecycle — main

- [ ] 5.1 Audit the complete backend diff and rerun material generation, test, race, vet, build, architecture, contract, path, and OpenSpec gates.
- [ ] 5.2 Make only simple in-envelope corrections if needed, then update status, sync/archive, stage the exact accepted envelope, and include it in the Wave 1B foundation commit.
- [ ] 5.3 Verify final history and no push/release/deploy; hand the accepted foundation to later backend feature changes.
