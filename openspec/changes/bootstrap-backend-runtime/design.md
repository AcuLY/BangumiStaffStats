## Context

Wave 1A is complete at commit `ab75c35511b681eeb5061fb8d3f658164c2c1c92`.
The query and Archive root specs and machine-readable bundles under
`contracts/**` are the only contract authorities. The shared Wave 1B planning
checkpoint is based on `acb722cc25b344f85feb3c0f5fb081d3e3702e89`,
which includes the accepted Node 24 and Impeccable v4 baselines.

| Boundary | Declaration |
|---|---|
| Status | investigated: complete; specified: approved; implemented: no; verified: current Go/tool research, final baseline rebind, main semantic review, targeted/all strict validation, and OpenSpec doctor passed; committed: planning status is determined by the containing Git history; pushed/released/deployed: no |
| Owner | One backend subagent writes `backend/**`; main owns planning and acceptance. Frontend/updater owners have disjoint paths. |
| Scope | A production-shaped but behavior-empty Go foundation plus direct contract-consumer evidence. |

## Goals / Non-Goals

Goals:

- one pinned, buildable, testable Go module;
- a real process lifecycle without fake product routes;
- generated query types isolated at the transport boundary;
- direct query and Archive contract-consumer tests;
- executable package-direction and generated-drift checks.

Non-goals:

- API business handlers, readiness semantics, statistics, normalization,
  collection access, Archive activation/storage, cache, image proxy, upstream
  network use, production configuration, deployment, or migration.

## Decisions

### Use one module with a small explicit inventory

The foundation contains only:

```text
backend/.gitignore
backend/README.md
backend/go.mod
backend/go.sum
backend/scripts/check.sh
backend/scripts/generate-query-wire.sh
backend/cmd/api/main.go
backend/internal/app/run.go
backend/internal/app/run_test.go
backend/internal/httpapi/server.go
backend/internal/httpapi/server_test.go
backend/internal/httpapi/wire/query_wire.gen.go
backend/internal/httpapi/wire/query_contract_test.go
backend/internal/archive/contracttest/doc.go
backend/internal/archive/contracttest/archive_contract_test.go
backend/internal/architecture/dependencies_test.go
```

The module path is `github.com/AcuLY/BangumiStaffStats/backend`, its language
line is `go 1.26.0`, and its toolchain is `go1.26.5`. The only admitted direct
development tool is `github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen`
at v2.8.0; production runtime code remains standard-library-only.

### Keep the process concrete and the routes empty

`internal/httpapi` owns a supplied-listener server and graceful shutdown.
Cancellation initiates a five-second bounded shutdown, normal server-close
errors are handled, other serve/start failures propagate, and tests prove no
goroutine leak. `internal/app` assembles the listener and lifecycle.
`cmd/api` owns OS signal handling and exit status.

The mux has no product, health, metrics, readiness, or placeholder route. A
loopback request therefore returns the standard empty-mux 404.

### Generate types only at the HTTP adapter boundary

`go tool oapi-codegen -generate models,skip-prune -package wire` consumes
`contracts/openapi/openapi.yaml` and creates only
`internal/httpapi/wire/query_wire.gen.go`. `skip-prune` is required because the
contract currently has components but no paths. A check-mode script regenerates
to `backend/.tmp/` and byte-compares the result.

No generated handler/client, private schema copy, normalizer, digest, cache, or
business result DTO is admitted.

### Consume shared cases in place

Query tests use generated DTOs plus a strict one-value JSON decoder and consume
the shared case manifest/files directly. They cover one valid personal query,
one valid global query, and the selected structural negatives documented by
the contract. Full semantic normalization remains later work.

Archive contract tests read the shared index, schemas, DDL identity,
compatibility matrix, manifests, pointers, and SQLite header evidence directly.
They prove the minimal valid case and selected indexed negative outcomes
without embedding another schema/golden copy or opening a runtime store.

### Enforce package direction

The intended direction is:

```text
cmd -> app -> httpapi -> wire
                      -> future query
future query -> future archive/collection/cache
```

A standard-library architecture test uses `go list -json` to reject reverse
transport imports, cycles, nested modules, packages outside the module, and
production `workbench` naming. The test is data-driven so later approved
packages can extend the allowed graph deliberately.

### Keep disposable tool state local

All Go caches, temporary generation, test/build artifacts, and binaries live
under `backend/.cache/` or `backend/.tmp/`, both ignored. Scripts set
backend-local `GOCACHE`, `GOMODCACHE`, `GOPATH`, `TMPDIR`, `GOENV=off`, and
`GOWORK=off`. They verify containment and remove only those two exact roots at
final handoff. No custom fault-injection or host telemetry protocol is required.

## Verification

- `go tool oapi-codegen` generation drift check.
- Targeted lifecycle, architecture, query, and Archive tests.
- `go test ./...`, `go test -race ./...`, `go vet ./...`.
- Build `cmd/api` to `backend/.tmp/bin/api`.
- Exact persistent inventory and no nested module/OpenSpec/forbidden feature.
- Strict targeted/all OpenSpec validation, OpenSpec doctor, Git diff checks,
  protected-contract hashes, and no cache/temp/binary residue.

## Risks / Trade-offs

- Go may download the pinned toolchain/modules into backend-owned caches; a
  network failure stops the change.
- The empty mux is intentionally not a readiness contract.
- Contract tests prove adapter compatibility, not the later full runtime.

## Migration Plan

1. Rebind and approve all three Wave 1B changes in one planning checkpoint.
2. Run backend, frontend, and updater owners in parallel on disjoint paths.
3. Main accepts each candidate independently.
4. Archive/sync accepted changes and commit a bounded Wave 1B foundation phase.

## Open Questions

None.
