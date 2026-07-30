## Why

Production personal queries currently fail when Bangumi returns the normal
optional representation `comment: null`: the pinned
`bangumi-collection-go v0.1.0` rejects the entire collection page as a protocol
error. The external library is being corrected in `v0.1.1`; this repository
must admit that exact patch and prove the real user path without weakening its
other collection invariants.

## What Changes

- Pin `github.com/AcuLY/bangumi-collection-go` to immutable `v0.1.1` and update
  the two existing exact-version quality gates.
- Add a consumer transport regression proving an otherwise valid collection
  record with `comment: null` becomes an empty domain comment and remains
  usable by the production source.
- Preserve all required-field, identity, status, range, cache, digest, privacy,
  error-classification, and statistical behavior.
- Pass Development Actions, deploy the admitted combined release through the
  active operations change, and prove one real personal ranking plus image
  flow without retaining personal response data.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `backend-public-collection-source`: admit the corrected fixed dependency tag
  and accept the upstream optional null-comment representation as an empty
  domain comment.

## Impact

| Boundary | Declaration |
|---|---|
| Status | Investigated and proposed; specified, implemented, verified, committed, pushed, released, deployed, and real-query accepted are initially false. Apply is blocked until all artifacts are complete, strict-valid, and main-agent reviewed with zero P0/P1. |
| Owner | Main agent owns spec, dependency/revision audit, acceptance, Git lifecycle, and coordination with deployment; one Backend subagent owns the exact implementation block. |
| Writable paths | `backend/go.mod`; `backend/go.sum`; `backend/scripts/check.sh`; `backend/internal/architecture/dependencies_test.go`; `backend/internal/publiccollection/transport_test.go`; this change's task markers. Lifecycle may synchronize `openspec/specs/backend-public-collection-source/spec.md` and archive this change. |
| Read-only protected inputs | All other Backend/product/contracts/frontend/updater/operations files; PRODUCT/DESIGN/guides/oracle; external library source/tag after release; live user response bodies; hosts, secrets, data, and active sibling change artifacts. |
| Deletion complement | None. |
| Mutable refs | Main agent only: `codex/production-egress-and-footer` and its remote counterpart; later merge to `master` under the already authorized final lifecycle. No external library ref moves in this change. |
| Consumes | External OpenSpec `accept-null-collection-comments` and immutable `bangumi-collection-go v0.1.1`; existing `admit-public-collection-client`; active `adopt-host-rule-egress` for eventual admitted deployment. |
| Produces | An exact consumer pin, integration regression, green admitted build, deployed Backend image, and bounded live-query evidence. |
| Dependencies | External `accept-null-collection-comments`; repository `admit-public-collection-client`; live deployment depends on `adopt-host-rule-egress`. |
| Deliverables | Five-path Backend delta, strict OpenSpec evidence, Development Actions, exact `linux/amd64` bundle, production activation, real ranking/image result, health/metrics/log evidence. |
| Acceptance | Focused Backend test; full Development Actions; exact module version/checksum; bundle revision equality; production `/livez`, `/readyz`, `/metrics`, Prometheus; and HTTP 200 for the bounded `lucay126` request with non-empty summary/items and image retrieval, without storing the full payload. |
| Non-goals | Changing query/statistical semantics; treating malformed required fields as valid; changing retry/cache/digest policy; logging upstream bodies or collection details; adding credentials; UI/route changes; updating unrelated dependencies. |
| Operations deferred | Repository production mechanics remain owned by active `adopt-host-rule-egress`; this change supplies the accepted product artifact and acceptance query, not another deployment topology. |
| Stop/rollback conditions | Stop on unresolved `v0.1.1`, checksum/version mismatch, unexpected dependency delta, consumer/Actions failure, required-field regression, personal payload persistence, deployment revision mismatch, or failed health/query/image check. Use the existing application rollback; never move the external tag. |

External behavior classification: **INTENTIONAL_DELTA**, governed by
`PRODUCT.md` lines 11–19 and 58–60 plus the public-collection guide: a valid
public collection must be queryable without credentials. The immutable oracle
commit `644b7748674e553f863d0ffd61d029f86fdc0717` remains unchanged for visual,
interaction, copy, and responsive behavior.
