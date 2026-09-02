## Task Boundary

| Field | Boundary |
|---|---|
| Status | Not started; implementation blocked until task 1 completes |
| Owner | Primary agent; Contracts, Backend, and Frontend groups retain their repository ownership |
| Writable paths | This change and named main specs; identified refresh-bearing contract schemas/OpenAPI/goldens/generated models; identified backend request/service/cache/handler source/tests; identified frontend API/app/query source/tests; three named implementation guides |
| Read-only protected inputs | Product/design/oracle/Impeccable context, unrelated code/tests/specs, archived OpenSpec history, user's primary dirty worktree |
| Deletion complement | Ordinary collection provider/load/cache/stale/result behavior, statistical semantics, global/view/detail/partners/co-star behavior, unrelated UI/CSS |
| Mutable refs | `codex/remove-collection-refresh` only |
| Consumes | Approved proposal/design/delta specs and existing generators/toolchains |
| Produces | Removed wire/UI/backend capability, synchronized specs, verified local branch |
| Dependencies | Contracts before generated/backend/frontend consumers; backend remains statistical authority; frontend only presents results |
| Deliverables | No active explicit-refresh member, action, bypass, state branch, fixture, test, guide, or accepted-spec residue |
| Acceptance | Strict OpenSpec, contracts/generators, backend full gate, frontend full gate/rendered QA, active-tree residue scan, diff hygiene |
| Non-goals | TTL/provider/formula redesign, broad cleanup, historical rewrite |
| Operations deferred | Commit is local only if made; push/PR/merge/release/deploy/host mutation are not authorized |
| Stop/rollback conditions | Stop on branch/HEAD/dirty mismatch, authority conflict, generated drift outside scope, or failing gate requiring expansion; never reset/checkout/clean/broad-delete; roll back only by discarding the isolated branch/worktree after inspection |

## 1. Planning Gate — OpenSpec artifacts

- [x] 1.1 Preflight `codex/remove-collection-refresh` at `94329c9`, confirm only this change is dirty, confirm no active owner conflict, and read every apply context file.
- [x] 1.2 Complete main-agent proposal/design/spec review with zero P0/P1 planning findings and run `npx --yes @fission-ai/openspec@1.6.0 validate contracts-remove-explicit-collection-refresh --strict`.

## 2. Contracts Owner — schemas, goldens, and generated consumers

- [x] 2.1 Preflight branch/HEAD/dirty state and artifact approval; stop if any file outside the declared contract/generated-model set is concurrently modified.
- [x] 2.2 Remove the explicit refresh member/path vocabulary from rankings/candidates schemas, OpenAPI, query/API goldens, verifiers, and generic endpoint error fixtures while preserving closed unknown-field behavior.
- [x] 2.3 Regenerate every affected Go and TypeScript operation wire model with repository generators; do not hand-maintain generated output.
- [ ] 2.4 Run query/rankings/candidates/related endpoint contract and generator checks plus `node --test contracts/artifacts/test/*.test.mjs`; record exact results.

## 3. Backend Owner — request propagation and cache policy

- [x] 3.1 Preflight branch/HEAD/dirty state and approved contract outputs; stop on generated drift or source overlap.
- [x] 3.2 Remove refresh fields and validation/propagation from rankings, candidates, and HTTP handlers; retain generic closed-request rejection.
- [x] 3.3 Remove the caller-controlled collection-cache bypass parameter and refresh-only tests while preserving fresh hits, expiry loads, stale fallback, negative caching, and result-core reuse.
- [ ] 3.4 Run focused ranking/candidates/httpapi/runtimecache tests and `backend/scripts/check.sh`; record exact results.

## 4. Frontend Owner — single apply action and ordinary state

- [x] 4.1 Preflight branch/HEAD/dirty state, approved generated types, Impeccable route brief/craft floor, and source overlap; stop on mismatch.
- [x] 4.2 Remove the Query Editor refresh action/emit/wiring and all driver/coordinator/app request metadata and refresh-only transaction/dependent-replay state while preserving ordinary apply, cancel, recovery, revision, invalidation, sharing, and stale warnings.
- [x] 4.3 Remove or rewrite refresh-specific API/component/coordinator/integration tests so ordinary closed requests and query state remain covered without deleted vocabulary.
- [ ] 4.4 Run focused frontend tests, clean install plus `npm run check`, then render ranking/co-star Query Editors in Light/Dark at representative 390px and 1440px widths; verify one primary apply action, keyboard focus, overflow, console, and built artifact.

## 5. Current Documentation, Specs, and Final Acceptance

- [x] 5.1 Preflight branch/HEAD/dirty state and completed component gates; stop if any current guide/spec edit would change preserved behavior.
- [x] 5.2 Remove the deleted capability from the three current implementation guides and synchronize all eleven delta specs into accepted main specs without rewriting archived history.
- [x] 5.3 Run a case-insensitive active-tree residue scan excluding `openspec/changes/archive/**` and Git history; require no deleted field/copy/cache-bypass concept in current source, contracts, tests, guides, or accepted specs.

## Verification Evidence

- Contract API goldens for rankings, candidates, person-detail, partners, and co-star passed; all affected TypeScript wire drift checks passed after generator writes.
- Affected backend ranking/candidates/httpapi/person-detail/partners/runtimecache tests passed. The complete Windows `go test -p=1 ./...` remained red only on pre-existing POSIX SQLite URI assumptions and one sub-millisecond co-star timing assertion.
- Frontend typecheck, production build, architecture check with Windows separator normalization, wire checks, 138 focused tests, and isolated core ranking/co-star App flows passed. The unmodified full Vitest concurrency run reported 359/362 passing, with three core tests passing when isolated under a proportional timeout.
- Browser QA passed for Light desktop `/ranking` at 1440px and Dark mobile `/co-star` at 390px: one submit action, deleted copy absent, no horizontal overflow, no framework overlay, and no console warnings/errors.
- Full query/artifact harnesses remain blocked by their accepted POSIX/macOS-only path/runtime assertions on this Windows host; no test infrastructure was changed to mask those failures.
- [ ] 5.4 Run `git diff --check`, owned-diff review, strict change and all-spec validation, and applicable final contract/backend/frontend gates; record investigated/implemented/verified/committed/pushed/merged/released/deployed states separately.
- [ ] 5.5 Archive the completed OpenSpec change after sync and rerun `openspec validate --all --strict`.
