## Task boundary

| Field | Decision |
| --- | --- |
| Status | Specified; implemented/verified initially false. |
| Owner | Primary agent. |
| Writable paths | Exact source/test/doc/spec paths in proposal.md. |
| Read-only protected inputs | All unrelated or concurrent work, contracts, higher authorities and other changes. |
| Deletion complement | Only archive this completed change. |
| Mutable refs | None in this consumer repository. |
| Consumes | Published immutable v0.1.2; existing adapter and local runtime. |
| Produces | Verified version pin and local working query. |
| Dependencies | Library accept-reclassified-subject-types and v0.1.2 release. |
| Deliverables | Exact diff and evidence below. |
| Acceptance | Module verification, focused/full Go checks, strict specs/diff and local smoke. |
| Non-goals | Unrelated fixes, replacements, frontend work or deployment. |
| Operations deferred | All production and consumer Git integration; local API restart is authorized. |
| Stop/rollback conditions | Preflight branch/HEAD and owned dirty paths; preserve prior timeout changes; no destructive cleanup. |

## 1. Admission

- [x] 1.1 Review/validate plan and confirm v0.1.2 resolves to the reviewed merged library commit.

## 2. Consumer

- [x] 2.1 Preflight and upgrade only the package pin/sums and fixed assertions; preserve other dependencies.
- [x] 2.2 Add adapter regression and update package documentation/specification.
- [x] 2.3 Run focused tests and Linux full tests/race/vet/build; record module and diff evidence.

## 3. Local completion

- [x] 3.1 Rebuild/restart only local API and verify health, images and the real zhong_mo query.
- [x] 3.2 Sync/archive this change and run strict all-spec and diff checks.

## Evidence

Plan reviewed and strictly validated. Package PR #2 merged after two successful GitHub CI runs and exact-head review of 3a7172e822b96211fbd20898134f06884d5d9f93. Merged tree 710b80c7c744452e4273ae2effa3ed3fd0a3994c is identical to the reviewed candidate. Annotated v0.1.2 tag 97c95688a3d82849e08a62a021a245ee3b2753b8 points to that merge. Published release: https://github.com/AcuLY/bangumi-collection-go/releases/tag/v0.1.2 . Normal Go download verified Origin.Hash=710b80c7c744452e4273ae2effa3ed3fd0a3994c and sum h1:uDSLWV73Y2OAB8MZ7mLhO6PiXK3kN3TvuI/cT4TT7fU=.

Module graph diff: only collection v0.1.1 -> v0.1.2; generated go.sum removes the two old entries and adds the two published v0.1.2 entries. No replace/pseudo-version or transitive version change. Source adapter and timeout defaults unchanged.

The current Windows worktree's publiccollection tests passed; architecture scan saw pre-existing untracked legacy backend/pkg/bangumi and backend/pkg/httpclient. They were preserved. Clean LF Linux export of HEAD plus exact owned backend patch excluded unrelated files: Go 1.26.5 gofmt, go mod tidy (go.mod unchanged), go mod verify, go test -count=1 ./..., go test -race -count=1 ./..., go vet ./... and go build ./... all passed. The generated go.sum was copied back only after verifying the exact two removed old-version lines. Existing umbrella-script baseline issues from the preceding timeout change were not reclassified as passes or expanded into this change.

Local startup first confirmed service availability before package publication. After upgrade, only the managed WSL API was restarted; frontend PID 1848 on port 5174 remained running. Startup readiness, Catalog, global ranking and person/subject image probes passed. Built executable metadata confirms collection v0.1.2 with the verified module sum.

Real local ranking: zhong_mo, anime, completed+in_progress, staff:anime:2, count-desc, page 1/10. Cold collection cache request returned HTTP 200 in 28.8369 seconds, request ID f4be8b796584c22ab035b91ebad3a7b7, personCount 1462 and workCount 3983. Server-Timing: collection 28241.861ms, SQLite 91.545ms, compute 216.182ms, projection 1.284ms. No upstream protocol error. Package PR #2 merged and v0.1.2 published; consumer remains local/uncommitted, not pushed or deployed. Main package CI at merged commit 710b80c also passed.

Main spec sync and pre-archive all-spec strict validation passed 80/80 items; diff hygiene passed.
