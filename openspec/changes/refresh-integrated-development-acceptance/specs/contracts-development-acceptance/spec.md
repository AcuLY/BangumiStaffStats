## Capability Boundary

| Field | Declaration |
|---|---|
| Status | Investigated: complete; specified/implemented/verified/committed/pushed/archived: no; released/deployed/activated: no. |
| Owner | Main-agent specification/audit/lifecycle owner and one bounded remote execution owner. |
| Writable paths | This change, later synchronized `openspec/specs/contracts-development-acceptance/spec.md`, archive lifecycle, and the proposal-declared run-owned remote complement only. |
| Read-only protected inputs | Final Product, containing Harness, oracle, every implementation path, other OpenSpec, Git objects outside lifecycle commits, and all non-admitted remote state. |
| Deletion complement | No tracked/pre-existing object; only identity-proven run-created files/containers and conditionally run-pulled fixed image refs. |
| Mutable refs | Exact change/root-spec/archive, main-agent commits/push, one run root, run containers, and conditionally owned image refs. |
| Consumes | Product exact-head Actions, Harness package, fixed container digests, remote Docker capability, and prior non-green lifecycle semantics. |
| Produces | Ordered Product/Harness/archive identities, exact difference proof, separately attributed targeted evidence, cleanup/non-interference/audit closure. |
| Dependencies | Product Actions → Harness commit → identity proof → remote admission/gates → cleanup/audit → archive. |
| Deliverables | Strict-valid artifacts, exact evidence fields, synchronized root requirement, archive identity, zero residue. |
| Acceptance | Proposal/design acceptance and every scenario below. |
| Non-goals | Formal 56-cell result, product/Operations implementation, release/deploy/production/SLO claim, local product execution. |
| Operations deferred | Receipt/code rebinding and all Operations candidate/host validation remain separate. |
| Stop/rollback conditions | Any identity, ownership, result, exception, cleanup, or protected-state mismatch fails closed without broadening mutation or claims. |

## ADDED Requirements

### Requirement: An authorized targeted refresh SHALL preserve dual source identity

An authorized non-green acceptance refresh SHALL bind one final
acceptance-free Product revision/tree, one descendant Harness implementation
revision/tree, and one descendant archived-refresh revision/tree as distinct
identities. The complete Development workflow SHALL succeed at the exact
Product head before remote mutation. Git ancestry and a complete sorted
path/status/mode/blob-or-byte inventory SHALL prove that Product and Harness
differ only in the exact receipt-declared acceptance and lifecycle paths; the
non-allowed difference count SHALL be zero.

The refresh SHALL transfer and attest separate immutable Product and Harness
source archives and complete extracted inventories. Product SHALL own the
Updater `RuntimePruneTests`; Harness SHALL own package verification,
supervisor, and selected targeted acceptance-control tests. No result MAY
represent a Harness command as executed from Product or relabel one source
archive as the other.

#### Scenario: Product and Harness are compatible

- **WHEN** exact-head Product Actions are green, Harness descends Product, both source archives/inventories validate, and every changed mode/blob is in the exact declared acceptance/lifecycle set
- **THEN** Product-owned and Harness-owned targeted gates may run under their respective immutable identities

#### Scenario: Product or Harness identity is widened

- **WHEN** Actions names another head/tree, ancestry fails, one non-declared path/mode/blob differs, an archive/inventory is mixed, or Harness evidence is attributed to Product
- **THEN** the refresh SHALL stop before remote test execution and SHALL NOT authorize Operations receipt rebinding

### Requirement: Targeted refresh execution SHALL be fixed, isolated, and attributable

The refresh SHALL run on the explicitly approved `myserver` only below one
previously absent owned root
`/srv/bgmss-development-acceptance-refresh-<run-id>`. Actual gates SHALL use
the corrected exact Tencent-mirror RepoDigest/root, unique linux/amd64 child,
config image ID, and layer graph for Node 24.18.0/npm 11.16.0 and Python
3.14.6 declared by the change. The registry name SHALL be transport only:
raw OCI bytes, descriptor sizes, `RepoDigests`, config diff-IDs, OS/arch, and
in-container versions SHALL validate, no tag may resolve, and every gate
SHALL run by config image ID. Gates SHALL use `--network none`, read-only
container roots, `/tmp` tmpfs, no published port, no Compose project, no
Docker network or volume, and only run-owned writable mounts. Host Node, npm,
Python, Go, or application toolchains SHALL NOT be admission gates.

Product SHALL execute
`python -m unittest -v build.test_artifact.RuntimePruneTests` from Product's
Updater copy and record actual names/count/TAP/log digest. Harness SHALL pass
`verify-package`, perform its exact offline no-script npm install, pass all 21
supervisor tests, and run one frozen exact-name selected core set. The selected
set and actual TAP pass/fail/skip counts SHALL be recorded. Only test
`escaped fixture fallback cleans only an exact owned process identity` MAY
fail, only on the recorded Linux host, and only with exact message
`escaped fixture process identity differs before cleanup`; it waives no
production behavior. Every other failure, missing selected name, extra
selected name, or result-parse ambiguity SHALL fail the refresh.

#### Scenario: Fixed Product and Harness gates close

- **WHEN** Product Updater tests pass, Harness package and 21 supervisor tests pass, the selected-name set is exact, and no failure exists beyond the exact classified Darwin-text fixture mismatch
- **THEN** evidence SHALL separately record each source identity, command, actual count, TAP/log digest, runtime image identity, and exception classification

#### Scenario: Execution uses a broader capability

- **WHEN** a gate uses host toolchains, network access, a mutable/unverified image, another source revision, port/network/volume/Compose state, a widened test pattern, or another exception
- **THEN** the run SHALL fail and SHALL NOT emit lifecycle closure evidence

### Requirement: Refresh cleanup SHALL prove non-interference and preserve formal omissions

Before the first write, the refresh SHALL record the absent/non-symlinked run
root and image pre-existence. For legacy `/srv/bgmss`, it SHALL record lstat,
realpath, filesystem identity, a complete path-bound lstat
metadata inventory digest, and type/count/logical-size distribution. It SHALL
NOT open or hash regular-file contents or emit secret/live-data path names.
When and only when that root is a Git worktree, it SHALL additionally record
Git identity and status digest. A non-Git published legacy root SHALL be
represented explicitly and SHALL NOT be mislabeled as Git. The preflight
SHALL also record stable existing container/network/volume inventories,
`nginx -T` digest, listener/process facts, and one actual Host/SNI loopback
route status/header/body digest.

When both a fixed RepoDigest and its config image ID are absent, the exact
mirror RepoDigest pull MAY be the first bounded post-admission mutation.
Before pull, the run SHALL recompute and bind the root, unique linux/amd64
child, config, and every layer digest/size. After pull, the immutable config
ID, `RepoDigests`, diff-IDs, OS, architecture, and runtime version SHALL
validate before cache preparation or tests. A tag lookup, descriptor
ambiguity, Docker Hub fallback, pre-existing config ownership, digest/size
mismatch, registry probe, or pull failure SHALL fail closed. Cleanup SHALL
remove only
manifest-bound run files and directories bottom-up, run containers by
immutable ID/label, and a fixed image reference only when this run pulled it
and its ownership/identity remain exclusive. Broad recursive cleanup,
wildcard deletion, Docker prune, Git clean, Compose down, network/volume
removal, service change, and production or legacy mutation SHALL be forbidden.

Postflight SHALL require every protected seal unchanged and all run roots,
containers, archives, caches, dependency trees, and source residue absent or
explicitly report an ambiguous cached image that was safely preserved.
Zero-P0/P1 review SHALL precede lifecycle archive.

The highest result SHALL remain
`development-acceptance-closed-by-authorized-ci-and-remote-evidence`. All 56
formal Archive/artifact/API/browser/oracle/performance/residue cells SHALL
remain explicitly unexecuted. The refresh SHALL NOT emit a canonical formal
result, synthesize `development-accepted-operations-pending`, or claim release,
deployment, activation, production readiness, or SLO completion.

#### Scenario: Cleanup and protected-state comparison close

- **WHEN** run-owned cleanup succeeds, every protected before/after seal matches, no run residue remains, and the audit has zero P0/P1
- **THEN** the change MAY synchronize/archive and pass its Product, Harness implementation, and Harness archive identities to the separately reviewed Operations change

#### Scenario: Residue, drift, or a formal claim remains

- **WHEN** cleanup ownership is ambiguous, run residue or protected drift remains, an unexecuted cell is marked passed, a formal verdict is synthesized, or release/deployment/production readiness is inferred
- **THEN** the refresh SHALL fail closed, preserve exact evidence, and SHALL NOT unblock Operations receipt consumption
