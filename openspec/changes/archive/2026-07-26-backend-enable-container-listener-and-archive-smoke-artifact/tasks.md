## Task Boundary

| Field | Declaration |
|---|---|
| Status | Apply-ready only after strict validation and main-agent approval. |
| Owner | One Backend implementation subagent. |
| Writable paths | `backend/cmd/api/main.go`, new test, `backend/Dockerfile`, `backend/build/**`, exact inventory lines in `backend/scripts/check.sh`, and this change's task markers. |
| Read-only protected inputs | All other Backend/product/contracts/harness/CI/operations paths, refs/remotes, and external state. |
| Deletion complement | None beyond guarded cleanup of owned ignored artifact output. |
| Mutable refs | None during apply. |
| Consumes | Approved proposal/spec/design and current accepted Backend/artifact implementations. |
| Produces | Listener configuration and two-binary Backend artifact. |
| Dependencies | No overlapping owner; exact toolchains and Docker builder. |
| Deliverables | Code, tests, artifact metadata/verification, smoke, and handoff evidence. |
| Acceptance | Focused/full Backend tests, repeated artifact build, internal-bridge smoke, Contracts verification, strict OpenSpec, diff/residue. |
| Non-goals | Route semantics, dependency changes, operations files, host ports, deploy/activation. |
| Operations deferred | Compose/Nginx/systemd/secrets/topology/cutover. |
| Stop/rollback conditions | Stop on unexpected dirty overlap, protected edit, unsafe admission, nondeterminism, residue, or external mutation. |

## 1. API listener

- [x] 1.1 Preflight branch/HEAD, exact allowed dirty paths, toolchains, and no
  overlapping Backend owner; stop before mutation on mismatch.
- [x] 1.2 Add the strict testable `-listen-address` parser with the preserved
  loopback default, fixed non-reflecting error envelope, and comprehensive
  positive/negative tests including oversized/newline-bearing input.
- [x] 1.3 Pass only the accepted address to `app.RunWithOptions`; update the
  exact persistent inventory without changing internal HTTP behavior.

## 2. Backend artifact

- [x] 2.1 Export normalized same-target `bgmss-api` and `archive-smoke`
  binaries and include both in deterministic bundle metadata schema v2.
- [x] 2.2 Extend bundle verification/tests for inner inventory, modes, sizes,
  digests, duplicate/extra/tamper rejection, and API-only OCI rootfs.
- [x] 2.3 Replace namespace-sharing smoke with a unique internal bridge and
  separate helper probe; capture immutable resource IDs and implement exact
  ownership-checked failure-safe cleanup.
- [x] 2.4 Export explicit OCI media types through the pinned Docker exporter,
  strictly admit its bounded closed layout and exact compatibility manifest,
  normalize final bytes, reject every numeric UID-zero encoding, and cover
  unsafe/extra/orphan/mismatch/root-user negatives.

## 3. Verification and handoff

- [x] 3.1 While implementation is uncommitted, run focused CLI/build tests,
  full Backend check/race/vet, pure/synthetic artifact and static policy gates,
  strict OpenSpec, and exact diff/inventory/residue checks; hand off the exact
  unstaged implementation without claiming clean attestation.
- [x] 3.2 Main agent audits and commits the implementation candidate, then from
  that clean candidate runs two byte-identical artifact builds, internal-bridge
  smoke, rootfs/bundle inspection, Contracts component verification, and final
  residue. Any failure returns a bounded correction to the Backend owner.
- [x] 3.3 After clean acceptance, main agent syncs and archives this change,
  commits lifecycle state, and rebuilds integrated artifacts.
