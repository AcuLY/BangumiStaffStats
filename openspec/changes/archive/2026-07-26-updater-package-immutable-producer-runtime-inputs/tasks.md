## Task Boundary

| Field | Declaration |
|---|---|
| Status | Apply-ready after strict validation, main-agent approval, and accepted Contracts dependency. |
| Owner | One Updater implementation subagent. |
| Writable paths | `updater/Dockerfile`, `updater/build/**`, and this change's task markers. |
| Read-only protected inputs | Exact Contracts manifest/records, catalog YAML pair, all other source/locks/components/harness/CI/operations/external state. |
| Deletion complement | None beyond guarded owned ignored build-output cleanup. |
| Mutable refs | None during apply. |
| Consumes | Approved change and accepted Contracts authority. |
| Produces | Self-contained producer input subtree and artifact evidence. |
| Dependencies | Contracts runtime manifest change accepted; no overlapping Updater owner. |
| Deliverables | Snapshot/package/image/metadata/verification/smoke implementation and tests. |
| Acceptance | Focused/full artifact tests, repeated builds, embedded runtime smoke, Contracts validation, strict OpenSpec, diff/residue. |
| Non-goals | Product source/config/lock changes, real produce/acquisition, archive-smoke, operations/deploy. |
| Operations deferred | External runtime paths/mounts, schedule, release, deployment, activation, cutover. |
| Stop/rollback conditions | Stop on dependency/authority/dirty drift, partial/broadened copy, protected edit, nondeterminism, residue, or external mutation. |

## 1. Attested producer inputs

- [x] 1.1 Preflight branch/HEAD, exact dirty allowlist, accepted Contracts
  dependency, authority bytes/modes, toolchains, and disjoint ownership.
- [x] 1.2 Strict-parse the attested manifest and select exactly its 42 Git
  blobs plus the exact two catalog YAML blobs into the normalized snapshot.
- [x] 1.3 Add fail-closed tests for missing/extra/reordered/unsafe/mismatched
  manifest records, live-worktree substitution, modes, and catalog pair drift.

## 2. Artifact packaging and evidence

- [x] 2.1 Package identical read-only producer trees and authority metadata in
  native bundle v2 and the OCI image fixed paths.
- [x] 2.2 Emit canonical producer-input metadata, fixed image labels, outer
  build metadata v2, and the component-statement manifest input.
- [x] 2.3 Extend native/OCI verification and tamper/type/mode/path/label/input
  mismatch negatives, including a writable nearest ancestor that could replace
  the fixed producer root, without weakening source/runtime minimization.
- [x] 2.4 Export through the pinned Docker exporter with explicit OCI media
  types; strictly admit and normalize its closed graph plus exact compatibility
  manifest, with Engine 26/28 load and unsafe/extra/orphan/mismatch negatives.

## 3. Embedded runtime smoke

- [x] 3.1 Run networkless source-free `contract-check` against embedded
  Contracts and an isolated catalog-loader digest probe against embedded input.
- [x] 3.2 Prove no product/Contracts/config mount, `produce`, acquisition,
  activation, runtime write, external request, foreign-container cleanup, or
  residual owned resource occurs; bind and verify a unique per-run ownership
  label and immutable ID before every container removal, and guard the loaded
  image identity against the closed verified config/manifest digest pair for
  classic/containerd stores without force-removing a replacement.

## 4. Verification and handoff

- [x] 4.1 While implementation is uncommitted, run full Updater
  format/lint/type/unit tests, focused pure/synthetic artifact and Dockerfile
  policy gates, strict OpenSpec, and exact diff/inventory/residue checks; hand
  off the exact unstaged implementation and do not claim clean attestation.
- [x] 4.2 Main agent audits and commits the implementation candidate, then from
  that clean candidate runs two byte-identical native/OCI builds, embedded
  smoke, Contracts component/compatibility verification, and final residue.
  Any failure returns a bounded correction to the implementation owner.
- [x] 4.3 After clean acceptance, main agent syncs and archives this change,
  commits lifecycle state, and rebuilds integrated artifacts.
