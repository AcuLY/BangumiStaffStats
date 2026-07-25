## Task Boundary

| Field | Declaration |
|---|---|
| Owner | One backend public-collection implementation agent. |
| Writable paths | `backend/internal/publiccollection/**`, `backend/internal/app/{run.go,run_test.go}`, `backend/{go.mod,go.sum}`, exact backend inventory/check hunk if required, and this file. |
| Protected inputs | External repository/tag during apply, all non-listed backend code, contracts/frontend/updater, other changes, refs/remotes, and operations state. |
| Consumes | Fixed public client `v0.1.0`, internal snapshot/failure contracts, five service provider interfaces. |
| Produces | Tested adapter, production assembly, fixed module pin. |
| Dependencies | Public immutable `v0.1.0`, accepted query/cache services, and co-star shared-path handoff. |
| Deliverables | Mapping/error tests, loopback/auth boundary tests, app integration tests, module checksum. |
| Acceptance | Focused and full backend gates; same provider for all personal services; no credentials, external leakage, `replace`, local path, or pseudo-version. |
| Non-goals | External code/ref changes, OAuth, duplicate cache/retry, API changes, operations, or deployment. |

## 1. Admit and apply

- [ ] 1.1 Record branch/HEAD/dirty state; verify public `v0.1.0` resolves to the
  accepted external commit, the module is immutable, co-star has released app
  wiring, this change is strict-valid, and no local replace is needed.
- [ ] 1.2 Implement the narrow adapter with exact enum/field/empty behavior,
  defensive immutable copying, pre-transport input validation, duplicate
  rejection, and the complete sanitized failure matrix.
- [ ] 1.3 Pin `v0.1.0` in the formal module and assemble one source for all five
  services; inject fakes in app tests and prove global scope makes no call.
- [ ] 1.4 Run focused adapter/app/service contract tests, `go test -race ./...`,
  `go vet ./...`, module/check inventories, `git diff --check`, and strict
  OpenSpec validation; leave the accepted candidate unstaged for main-agent
  commit/archive.
