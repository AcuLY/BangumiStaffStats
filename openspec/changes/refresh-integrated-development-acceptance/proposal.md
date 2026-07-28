## Why

The accepted development lifecycle predates the Updater runtime-pruning
correction, while the final acceptance-free Product revision intentionally
does not contain `contracts/acceptance/**`. Operations therefore needs a new
same-product acceptance closure that keeps Product-owned checks and
Harness-owned checks on their actual revisions instead of attributing Harness
evidence to Product.

## What Changes

- Freeze final Product revision
  `34176077787b7942741ae412d3f012c732a51ee0` and require the complete
  Development workflow to succeed at that exact head before remote mutation.
- Bind one descendant Harness implementation revision that contains the
  existing acceptance package plus this change, and prove by complete Git
  byte-and-mode inventory that it differs from Product only in the exact
  declared acceptance/lifecycle paths.
- On `myserver`, run the Product Updater pruning tests from Product and the
  package, supervisor, and selected targeted acceptance tests from Harness in
  fixed digest-addressed, networkless, read-only containers below one absent
  run-owned root.
- Record both immutable source archive identities/inventories, exact commands,
  selected test names and actual counts, TAP/log digests, the one permitted
  Darwin-text fixture exception, cleanup, protected-state comparison, and
  zero-P0/P1 audit without emitting a canonical formal result or claiming
  `development-accepted-operations-pending`.
- Synchronize and archive this refresh so Operations may rebind its
  accepted-development receipt to Product → Harness implementation → Harness
  archive.

Externally visible product behavior is `PRESERVE_ORACLE`; immutable oracle
`644b7748674e553f863d0ffd61d029f86fdc0717` and every product/UI byte are
unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `contracts-development-acceptance`: Add a dual-identity same-product
  targeted refresh path that preserves the formal matrix as explicitly
  unexecuted and attributes each check to its real Product or Harness source.

## Impact

| Field | Declaration |
|---|---|
| Status | Investigated: complete; specified/implemented/verified/committed/pushed/archived: no at proposal creation; released/deployed/activated: no. |
| Owner | Main agent owns specification, identity decisions, audit, acceptance, Git, and lifecycle. One delegated execution owner may run the closed remote command set because the remote/container detail is context-heavy and independently bounded. |
| Writable paths | Repository planning only: `openspec/changes/refresh-integrated-development-acceptance/**`, followed by synchronization to `openspec/specs/contracts-development-acceptance/spec.md` and archive lifecycle. Remote only after exact-head Product Actions and read-only admission: one previously absent regular root `/srv/bgmss-development-acceptance-refresh-<run-id>/**`; uniquely named run-labeled networkless containers; and only the fixed Node and Python image references if that run proves they were absent and pulls them. No application source is edited. |
| Read-only protected inputs | Product `34176077787b7942741ae412d3f012c732a51ee0`; the containing Harness implementation; oracle; all application/Contracts/Operations implementation; every OpenSpec outside this change and its later root-spec sync; Git history outside main-agent commits; external registries except exact image reads; and all remote state outside the admitted run root/container/image complement. On `myserver`, `/srv/bgmss/**`, `/srv/bgmss-v2/**`, `/srv/bgmss-ops-validation/**`, pre-existing containers/images/networks/volumes, Nginx/systemd/TLS/configuration, listeners, processes, and legacy data remain read-only. |
| Deletion complement | No tracked file and no pre-existing remote object. Cleanup may remove only run-created files/directories from the exact owned manifest, run-labeled containers by immutable ID, and an exact image reference only if the run pulled it, its identity still matches, and no pre-existing or foreign reference/container uses it. No Docker prune, Git clean, glob cleanup, broad recursive target, network, volume, Compose, or service deletion. |
| Mutable refs | This change, later synchronized root spec/archive, main-agent commits/push, exact run root files, run containers, and conditionally run-pulled fixed image references. No product/Harness source ref, tag, release, registry publication, production/legacy ref, route, service, volume, network, or public port is mutable. |
| Consumes | Final Product revision/tree and exact-head Development Actions; descendant Harness implementation; existing accepted package/supervisor/targeted harness; fixed Node 24.18.0/npm 11.16.0 and Python 3.14.6 container digests; current `myserver` Docker capability; prior non-green lifecycle semantics and explicit 56-cell unexecuted inventory. |
| Produces | Exact Product/Harness ancestry and difference proof; two immutable source identities; Product-owned 22-test Updater evidence; Harness-owned package/supervisor/selected-targeted evidence; exception/unexecuted/cleanup/non-interference/audit evidence; one archived refresh identity consumable by Operations. |
| Dependencies | Product exact-head Development run must be green; Harness must descend Product; Product/Harness non-allowed byte-or-mode difference count must be zero; read-only remote collision/protected-state preflight must pass before writes. |
| Deliverables | Strict-valid proposal/design/delta/tasks; clean Harness implementation commit; canonical run input/result summaries and hashed logs kept only as bounded execution evidence; archived refresh plus synchronized root requirement; no remote or generated residue. |
| Acceptance | Pinned OpenSpec strict validation and diff hygiene; exact-head Product Actions; Git ancestry and full byte/mode inventory; Product `RuntimePruneTests` with actual count; Harness `verify-package`, 21 supervisor tests, and a frozen selected targeted set with only the exact permitted fixture mismatch; networkless/read-only container execution; before/after legacy/container/network/volume/Nginx/route comparison; exact cleanup; zero P0/P1 review. |
| Non-goals | No product/UI/API/statistical/contract implementation change; no local product test/build/Docker; no full formal 56-cell Archive/API/browser/oracle/performance execution; no canonical formal result; no `development-accepted-operations-pending`; no Operations candidate build; no release, deployment, production activation, or SLO claim. |
| Operations deferred | Operations receipt/code rebinding, AMD64 candidate assembly, Operations Actions, `/srv/bgmss-ops-validation` runtime validation, and every release/deploy/production/host-integration action remain in the separate Operations change. |
| Stop/rollback conditions | Stop before remote writes on non-green/mismatched Product Actions, dirty or wrong revisions, ancestry/difference failure, absent tool capability, existing/symlinked root, image ownership ambiguity, protected-state inventory failure, or undeclared network/port/volume need. After an owned write, preserve the primary failure, clean only identity-matching run-owned objects, report ambiguous residue, and never touch protected state to force success. |

This change touches no other repository. Its only external mutation is the
explicitly bounded isolated validation above; production state remains
unchanged. Apply is blocked until proposal, specification, design, and tasks
are complete, strict-valid, and approved by the main agent.
