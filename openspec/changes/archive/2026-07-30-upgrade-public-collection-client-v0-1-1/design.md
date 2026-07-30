## Context

The production image revision `1150a94e77dcd7e269bf58a96f5df93ba451882a`
contains the same `v0.1.0` dependency pin as this repository. A real personal
ranking request reached `api.bgm.tv`, then failed during collection decode
because the external client accepts an omitted optional `comment` but rejects
the live API's equivalent explicit null. Full bounded structural inspection of
the selected public collection found no other library-contract violation.

The field is copied into the immutable collection snapshot and digest but does
not participate in rankings or score computation. Normalizing null to the
existing empty-string representation therefore restores readability without
changing results.

## Goals / Non-Goals

**Goals:**

- Consume the separately accepted immutable `v0.1.1` patch.
- Prove the dependency's corrected wire behavior through the real production
  adapter boundary.
- Preserve all meaningful collection integrity and privacy checks.
- Produce an Actions-built, revision-bound release and a real-query proof.

**Non-Goals:**

- Reimplement or fork the external decoder in this repository.
- Relax identity/type/status/range/pagination/size checks.
- Change collection caching, digests, ranking math, query API, frontend
  behavior, routes, or operations topology.

## Decisions

### Upgrade the fixed external tag instead of adding an adapter workaround

`backend/go.mod` and `go.sum` will move from `v0.1.0` to exact `v0.1.1`.
`backend/scripts/check.sh` and the architecture dependency inventory will
continue to enforce that exact tag and the absence of a replacement or
pseudo-version.

The adapter cannot safely work around the current failure because the external
client rejects a page before returning DTOs. Copying the decoder locally would
create two authorities and violate the accepted dependency boundary.

### Add one consumer-level transport regression

An `httptest` endpoint will return one complete valid collection page whose
only special shape is `comment: null`. The test will construct the real
anonymous client through `newAnonymousSource`, fetch the snapshot, and assert
that the item is complete with an empty comment. Existing library tests own
the broader malformed-value matrix; this test owns integration and prevents
an accidental dependency downgrade.

No test fixture or log will contain a real UID, comment, or response body.

### Keep build and live acceptance separate

The dependency change first passes the full Development Actions pipeline and
produces a `linux/amd64` bundle tied to the exact commit. The active
`adopt-host-rule-egress` change then installs that bundle through the existing
single-host transaction. Acceptance summarizes status, counts, data version,
request ID, and one image result; it does not persist the personal response.

## Risks / Trade-offs

- **The new tag is unresolved or mutable** → require the pushed external commit,
  immutable tag, module proxy/checksum resolution, exact `go.sum`, and Actions.
- **The integration test masks another decoder relaxation** → keep the client
  change focused and retain all existing dependency/Backend full gates.
- **Production query evidence leaks collection content** → emit only bounded
  aggregate metadata and discard the response body immediately.
- **Deployment combines product and egress changes** → require exact bundle
  revision, existing rollback, and independent health/query/image checks.

## Migration Plan

1. Accept and publish external library `v0.1.1`.
2. Update the four exact dependency-pin paths and add the transport regression.
3. Pass strict OpenSpec and Development Actions; generate and verify the exact
   operations preview bundle.
4. Deploy using the active application transaction after host-egress migration
   prerequisites pass.
5. Rerun the bounded personal ranking and image request. If any product check
   fails, use `rollback-app` to restore the previous release; never move the
   external tag.

## Open Questions

None.
