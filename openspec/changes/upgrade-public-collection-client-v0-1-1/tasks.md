| Boundary | Declaration |
|---|---|
| Status | Implemented, committed, pushed, and accepted by Development Actions; bundle, deployment, and real-query acceptance remain separately tracked. |
| Owner | Main agent: spec/audit/Git/bundle/deployment coordination/acceptance. Backend apply subagent: exact five-path implementation and these task markers. |
| Writable paths | Apply: `backend/go.mod`, `backend/go.sum`, `backend/scripts/check.sh`, `backend/internal/architecture/dependencies_test.go`, `backend/internal/publiccollection/transport_test.go`, checkbox markers here. Lifecycle: this change/archive and synchronized `openspec/specs/backend-public-collection-source/spec.md`. |
| Read-only protected inputs | All other repository paths, sibling active changes, authorities/oracle, external library after release, live response bodies, host config/data/secrets. |
| Deletion complement | None. |
| Mutable refs | Main agent only: `codex/production-egress-and-footer`, its remote counterpart, and final merge ref under existing authorization. |
| Consumes | External `accept-null-collection-comments` and immutable `v0.1.1`; repository `admit-public-collection-client`; active `adopt-host-rule-egress`. |
| Produces | Exact dependency pin/test, green admitted bundle, deployed revision, and bounded real-query/image proof. |
| Dependencies | External `accept-null-collection-comments`; repository `admit-public-collection-client`; live phase depends on `adopt-host-rule-egress`. |
| Deliverables | Five Backend paths, strict spec, Actions/bundle evidence, deployed service, query/image/health/metrics/log evidence. |
| Acceptance | Exact version/checksum/no-replace audit, focused/full Actions, bundle revision equality, production checks, and HTTP 200 non-empty personal result without payload retention. |
| Non-goals | Other dependency updates; source/parser fork; required-field relaxation; statistical/cache/digest/API/UI/route/topology changes; credentials or payload logging. |
| Operations deferred | Host mechanics remain in `adopt-host-rule-egress`; this change only provides the product artifact and real-query acceptance input. |
| Stop/rollback conditions | Stop on branch/dirty overlap, unresolved or mutable tag, unexpected module delta, failed tests/Actions, revision mismatch, persisted personal data, or failed live check; use existing application rollback and never move the library tag. |

## 1. Main-agent planning acceptance

- [x] 1.1 Audit the live request/log/source/dependency evidence, proposal,
  design, complete delta requirements, exact paths, dependency ordering, and
  privacy boundary for zero P0/P1 findings.
- [x] 1.2 Run strict validation for this change and verify no Backend path is
  already dirty before apply; record the allowed concurrent operations and
  active-change paths without touching them.

## 2. Backend dependency apply

- [x] 2.1 Preflight exact branch/HEAD, empty index, allowed dirty complement,
  complete reviewed artifacts, and immutable resolvable external `v0.1.1`;
  stop without edits on mismatch.
- [x] 2.2 Update `go.mod`/`go.sum` to only the exact client patch and update
  both existing exact-version guards; prove no `replace`, local path,
  pseudo-version, or unrelated module drift.
- [x] 2.3 Add the real-client `httptest` transport regression for a complete
  anonymous page with `comment: null`, asserting a complete snapshot and empty
  comment without any real UID or collection content.
- [x] 2.4 Run focused Backend tests and source/static gates that do not perform
  a local production/container build, `git diff --check`, and exact path
  audit; hand the unstaged candidate to the main agent.

## 3. Main-agent review and admitted build

- [x] 3.1 Review the exact Backend diff and dependency graph for zero P0/P1,
  repeat proportionate source tests, strict change/all validation, and ensure
  the only other dirty paths are owned by accepted sibling changes.
- [ ] 3.2 Commit/push the accepted product and operations phases in reviewable
  order, obtain green Development Actions, dispatch the operations preview,
  and verify its `linux/amd64` source revision equals the green commit.

## 4. Production acceptance through operations

- [ ] 4.1 After `adopt-host-rule-egress` migration prerequisites pass, deploy
  the exact admitted bundle through `/srv/bgmss-v2` and verify image revision,
  public root `/`, `/v2/`, API live/ready/metrics, Prometheus, Archive identity,
  and bounded logs.
- [ ] 4.2 Rerun the same `lucay126` completed+in-progress anime personal
  ranking with explicit refresh; require HTTP 200, non-empty summary/items,
  current data version, and one proxied person image success while discarding
  the personal response body after the bounded summary.
- [ ] 4.3 Complete rollback/restart/non-interference checks, sync/archive this
  change with siblings, push final green state, merge to `master`, and report
  investigated/specified/implemented/verified/committed/pushed/released/
  deployed/live-query states separately.
