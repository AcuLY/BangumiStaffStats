## Context

The Query verifier builds real Redocly and Go child invocations from
`repositoryRoot`, which is currently derived from the verifier's own location.
That is the correct execution boundary: HOME, TMPDIR, GOCACHE, GOMODCACHE,
GOPATH, generated-tree paths, wrapper argv, and cwd must resolve inside the
current clone. The committed manifest, however, stores those runtime strings
after expansion. Its 86 occurrences of the original checkout root make an
otherwise byte-identical run-owned acceptance clone fail deep equality.

The correction is security-sensitive because command evidence includes both
standalone paths and packed historical argv strings. A generic string
replacement or expansion of manifest data could turn portability into a path
injection surface. The manifest must remain evidence, never execution input.

The clean formal-acceptance Query gate also exposes a separate reproducibility
gap. Its owned sequence runs prepare and then code-generation verification; it
does not run the historical interactive `go mod init`/`go get` correction.
Consequently a clean Product candidate has no `.tmp/go.mod` or `.tmp/go.sum`.
An ad-hoc local flow can create them, but a cache containing module zip files
without a sumdb lookup still cannot resolve them from scratch while network is
denied. The accepted module files are deterministic and already sealed, so
they must be explicit tracked inputs rather than residue from an earlier run.

The full shared OpenAPI has expanded since the Query golden was sealed. The
manifest still claims that Redocly lint and both `openapi-typescript` commands
consume that full authority. The accepted nine Redocly warnings and
29,729-byte TypeScript output are reproducible only from the prepared closed
Query source projections. The full authority now yields ten lint warnings and
159,822 TypeScript bytes, while the dereferenced bundle emits 312,879
TypeScript bytes; neither is the accepted Query-only evidence.

`contracts/goldens/query-domain` is a deliberate downstream byte-level
consumer: its manifest and verifier both seal the full Query manifest SHA-256.
The required Query manifest byte change therefore also requires a mechanical
Query Domain authority-hash update and the resulting verifier self-identity
update. That cascade is evidence-only; Query Domain cases and semantic seals
remain protected.

`contracts/goldens/statistics/index.json` then seals the complete Query Domain
manifest as its `query-result-handoff` authority. Its verifier reads that value
from the index rather than duplicating it, and no tracked consumer seals the
Statistics index bytes. Updating that one SHA-256 is therefore the final,
closed cascade.

Independent audit of the first apply candidate found that a green verifier was
not yet sufficient evidence. Its closed projection omitted Node/npm runtime
records, several Redocly isolation fields, Go module evidence, and historical
review fields; its Go-download policy could be enlarged by changing a source
graph and allowlist together; and executable bytes were compared only after
some children had already run. The final candidate must close those fields and
move identity/policy admission before execution. All earlier seals and clone
runs are invalidated by this finding.

### Change boundary

| Boundary | Declaration |
|---|---|
| Status | Design complete for a blocking Contracts correction; implementation and verification remain pending. |
| Owner | Main agent owns decisions/specification audit/final acceptance; one delegated Contracts owner owns implementation. |
| Writable paths | Tracked apply writes are limited to `contracts/goldens/query/verify.mjs`; new exact lock inputs `contracts/goldens/query/fixtures/go-module/{go.mod.lock,go.sum.lock}`; repository-root-derived evidence, closed-source Redocly lint and paired TypeScript source/command evidence, offline module-input evidence, and verifier self-identity in `contracts/goldens/query/manifest.json`; only the exact Query-manifest authority hash plus verifier self-identity in `contracts/goldens/query-domain/{verify.mjs,manifest.json}`; and only Statistics `authorities[id=query-result-handoff].sha256` in `contracts/goldens/statistics/index.json`. Task markers and every OpenSpec lifecycle edit remain main-agent-owned. Existing verifier activity may write only its exact approved transient roots below `contracts/goldens/query/{node_modules,.cache/npm,.cache/go-build,.cache/go-mod,.cache/go-path,.tmp}`. |
| Read-only protected inputs | Query/OpenAPI/schema/case/Unicode/package-lock authority; every Query Domain and Statistics field/case/authority except the named cascade; Statistics verifier; root `.gitignore`; all Backend/Frontend/Updater product sources and generated files; product/design/oracle authorities; integrated acceptance artifacts except the separately owned Query module-authority/cache/lint Harness correction; other OpenSpec content during apply; refs/remotes; hosts/services; and production. |
| Deletion complement | No tracked deletion. Cleanup remains limited to the six existing exact Query transient leaves and the already-specified empty `.cache` parent through the accepted no-follow bounded cleanup implementation. |
| Mutable refs | None; no index or Git ref mutation during apply. |
| Consumes | Existing `contracts-query-wire` authority and verifier, current manifest, the verifier-location-derived canonical clone root, and locked Node 24.16.0, Redocly 2.40.0, Go 1.25.4/gofmt, oapi-codegen 2.8.0, sandbox, and telemetry identities. |
| Produces | A one-way logical evidence encoder, closed manifest token admission, clone-local runtime-path assertions, self-consistent closed-source Redocly lint and paired TypeScript evidence, two exact tracked offline Go module locks with fail-closed prepare materialization, minimally rebound Query evidence, minimally rebound Query Domain authority/self evidence, one rebound Statistics handoff seal, and cross-clone proof. |
| Dependencies | Upstream: accepted `contracts-query-wire` authority/toolchain only. Downstream: Query Domain and Backend/Frontend Query generators consume unchanged Query semantics/generated bytes, while the separately owned acceptance Harness consumes the two Query module locks, corrected paired source-projection commands, and actual lint result. This archived correction is a prerequisite of `complete-integrated-development-acceptance`; acceptance never supplies execution paths to Query. |
| Deliverables | Revised Query verifier/manifest, two exact offline module lock inputs, minimally rebound Query Domain verifier/manifest, one rebound Statistics handoff SHA-256, positive and adversarial portability evidence, unchanged Query/Query Domain/Statistics semantic seals, exact diff/inventory/residue report, and main-agent lifecycle handoff. |
| Acceptance | Strict OpenSpec; zero original-checkout roots in committed manifest; a clean checkout reproduces the exact accepted `go.mod`/`go.sum` from the tracked inputs under network denial and without `GOSUMDB`/checksum bypass; paired source projections reproduce the accepted TypeScript seal while full authority and bundle do not; Query Domain and Statistics byte-seal consumers validate without semantic drift; full success from the original checkout and two different absolute clone roots; exact logical evidence and generated-byte equivalence; all injection/drift negatives; locked Query flow twice; Backend/Frontend Query gates; zero product runtime bundle inclusion or payload change. |
| Non-goals | Query/wire/product semantics, projection membership, tool upgrades, any dependency change except the exact compile-smoke-only indirect `github.com/google/uuid` v1.5.0 to v1.6.0 alignment, code-generation output, Go download admission beyond sealing that exact aligned pair, cleanup redesign, operations, or formal acceptance protocol changes outside its separately owned Query module-authority/cache/lint correction. |
| Operations deferred | This change creates no repository operations definition and mutates no Docker, Nginx, systemd, host, service, deployment, activation, rollback, or legacy state. |
| Stop/rollback conditions | Stop on path ambiguity/escape, token misuse, external identity drift, protected edit, output drift, unsafe cleanup, residue, external mutation need, or P0/P1 finding. Restore only exact owned unstaged preimages and keep integrated acceptance paused. |

The behavior classification is `PRESERVE_ORACLE`: the prototype oracle at
`644b7748674e553f863d0ffd61d029f86fdc0717` is unaffected, and there is no
intentional product delta or new product capability. No external repository,
ref, service, or host is writable.

## Goals / Non-Goals

**Goals:**

- Make committed Query command/evidence bytes independent of checkout root.
- Keep every absolute executed owned path canonical and below the current
  clone's exact approved roots; preserve owner-fixed repository-relative child
  arguments only when their resolution against the verified cwd is contained
  by the same roots.
- Reject token, path, tool, sandbox, environment, argv, and cwd drift before it
  can be accepted or used for a child process.
- Make Redocly lint and TypeScript evidence name and execute the prepared
  closed source projections that actually produce the existing accepted
  warnings and output seal.
- Make the formal clean-checkout Query sequence create its exact accepted Go
  smoke-module files from immutable tracked lock inputs, with no network or
  checksum-policy weakening.
- Preserve Query Domain's deliberate byte-level authority chain by rebinding
  only the changed Query-manifest hash and the verifier self-identity caused by
  that one constant update.
- Preserve Statistics' deliberate Query Domain handoff by rebinding only that
  final authority SHA-256.
- Prove the same tracked Query candidate from three absolute roots without
  changing generated Query or product runtime bytes.

**Non-Goals:**

- Reading repository roots from the manifest, environment, CLI, or Git.
- Turning arbitrary strings into templates or adding a general interpolation
  facility.
- Changing external executable/telemetry paths, dependencies, authority,
  projection membership/bytes, schema, case, generated TypeScript/Go output,
  Go download, cleanup, Backend, Frontend, or Updater behavior.

## Decisions

### Use a one-way evidence encoder; never expand manifest paths

The verifier SHALL continue to derive its canonical repository root only from
the real path of `import.meta.url` and the fixed
`contracts/goldens/query/verify.mjs` layout. It SHALL construct and validate
real argv/environment/cwd independently of manifest data. Absolute owned paths
use the current root; owner-fixed repository-relative child arguments are
resolved against the verified cwd and containment-checked immediately before
spawn. Only after runtime evidence exists shall a pure encoder replace
admitted repository-root segments with the exact literal `@repo-root@` for
comparison with committed evidence.

The manifest token is never decoded, expanded, passed to `spawnSync`, joined
with a path, or used to choose a writable location. This separates execution
authority from persistent evidence and makes manifest tampering incapable of
redirecting a child.

Alternative considered: expand manifest tokens into the current root and then
execute/compare. Rejected because committed evidence would become an execution
template. Storing every owned value in new structured relative-path objects was
also considered; it is safer than expansion but would create a broad manifest
schema migration for a narrow correction.

### Admit one token through a closed lexical and structural grammar

`@repo-root@` is the sole legal token. Encoding applies only when the exact
canonical root is bounded on the left by start-of-string, `=`, or one ASCII
space and on the right by end-of-string or `/`. The following suffix must be
the already-expected normalized path below the exact Query-owned generated or
temporary roots; empty, `.`, `..`, repeated separators, backslashes, NUL, and
escaping suffixes are rejected.

Before any generator/tool child starts, the verifier SHALL scan the manifest's
exact evidence shape. A token is legal only at a JSON location and scalar
position produced by encoding the verifier's closed expected path-evidence
shape. Unknown token spellings, extra/missing occurrences, token text in
external identities or non-path evidence, unresolved source-checkout roots,
and tokenized arbitrary absolute paths fail. This is a structural comparison,
not recursive manifest-controlled substitution.

Alternative considered: global `String.replaceAll(repositoryRoot, token)`.
Rejected because it cannot distinguish owned path segments from prose,
external values, malformed prefixes, or injected packed argv.

### Assert executable evidence immediately before every child

Before any relevant tool is handed execution, the verifier SHALL compare the
actual regular non-symlink Node/npm, Go/gofmt, Redocly CLI, and TypeScript CLI
files with their exact path, byte-length, SHA-256, and version evidence. Go and
gofmt SHALL repeat their exact file check immediately before every child so a
same-path replacement cannot execute first and fail only afterward.

Node is the verifier's bootstrap runtime and npm installs its locked
dependencies before the dependency-using verifier modes can run. Their
caller-provisioned execution remains covered by the existing locked acceptance
tool admission; at the verifier's earliest dependency-free entry it SHALL
still validate the running Node path/version/file and the declared npm
path/version/file before accepting any later Query command plan. No manifest
field may choose either bootstrap executable.

Immediately before spawning, the verifier SHALL assert that argv, environment
object keys and values, and cwd contain no token. The Go boundary SHALL select
one closed operation plan for primary generation, deterministic replay,
gofmt, or compile smoke; validate the exact path-bearing argument indexes and
their role-specific Query roots; and reject every unclassified absolute path,
escaping relative path, or path admitted only by a broader union of Query
roots. The absolute Node, npm, Go, gofmt, `/usr/bin/env`,
`/usr/bin/sandbox-exec`, fixed PATH, sandbox profile, and Go telemetry path
remain exact external constants and are never encoded. Environment key order,
wrapper argv boundaries, cwd, sandbox digests, Redocly telemetry-off flag, and
Go controls remain deep-equal evidence.

This duplicates a small final boundary check intentionally: construction-time
validation proves the model, while spawn-time validation prevents a future
call-site from bypassing it.

### Freeze complete execution policy and historical evidence

Preflight SHALL close the full runtime evidence, every Redocly identity and
isolation field, the Go module `go.mod`/`go.sum` evidence, all Go output command
argv used later for comparison, and the full historical recovery record. The
generated module files SHALL also be compared to their declared bytes after
they exist.

The complete `goDownloadProgress` subtree SHALL be bound by an independent
stable seal before any Go child. The seal covers graph labels, main modules,
graph commands, every module/version pair, and the final union allowlist.
Structural sorting/union checks remain defense in depth, but a manifest cannot
authorize a new pair merely by inserting it consistently into both a graph and
the union.

### Materialize the accepted Go smoke module from sealed tracked inputs

`contracts/goldens/query/fixtures/go-module/go.mod.lock` and `go.sum.lock`
SHALL contain exactly the reviewed 197-byte and 1,306-byte module files, with
SHA-256 values
`dded0ad8642adcdbb5a786de7b12165ba33ec550adbaefae7fd3bba0479c2a94`
and
`46983b3967ffaae472baff9b8bd827dc57b7cfe6462fe589112b3e8ea24f38a0`.
The only module-version delta from the superseded local residue is the
compile-smoke-only indirect `github.com/google/uuid` v1.5.0 to v1.6.0
alignment. The accepted Backend source/target Go closure already contains
v1.6.0; the Query module/version set SHALL be proven a subset of that closure
before the formal Harness may reuse it.
They are inputs, not generated evidence and not a second dependency authority:
the manifest closes their path, bytes, and digest, and the verifier closes the
same constants independently.

The dependency-free prepare mode SHALL require both inputs to be canonical
regular non-symlink files below the current clone, compare their exact bytes
before use, require the `.tmp/go.mod` and `.tmp/go.sum` destinations to be
absent, and create those destinations without overwrite. It SHALL immediately
read back and compare the resulting physical files to the accepted output
seals. A deterministic physical-write fault probe SHALL interrupt
materialization after the first owned output exists, prove no Go child starts,
and prove owner cleanup removes only the exact partial outputs. A missing,
changed, symlinked, hard-linked-to-output, pre-existing, or partially written
input/output SHALL fail before any Go child.

The formal and clone flows SHALL no longer depend on an interactive
`go mod init`/`go get` bootstrap. Go generation and compile smoke continue to
run under the existing network-denying sandbox with the seeded module zip
cache. The populated `go.sum` retains the accepted module and `go.mod`
checksums, so this correction neither sets `GOSUMDB=off` nor changes
`GOPROXY` or the Go download stderr grammar. The independently sealed graph
and union SHALL replace only `github.com/google/uuid@v1.5.0` with
`github.com/google/uuid@v1.6.0`; no other module pair may change.

Immediately before and after every Go child, and once again before successful
cleanup, the verifier SHALL re-read and re-seal the materialized `go.mod` and
`go.sum`. Any path, type, mode, byte, size, or digest drift SHALL fail the
owning operation. This is a single-owner frozen-candidate gate: concurrent
mutation by another same-user process is outside the accepted operating model,
but any drift observable at a required seal boundary remains blocking.

Alternative considered: populate sumdb cache on every acceptance run or permit
network only for `go get`. Rejected because either introduces mutable external
state into a reproducibility gate. Disabling checksum verification was also
rejected because a present zip is not itself the accepted dependency
authority.

### Prove portability with real isolated clone roots and pure negative fixtures

Verification SHALL run the locked Query flow against the original candidate
and byte-identical copies at two distinct absolute clone roots. Clone fixtures
live only under the approved Query `.tmp` transient root, contain no symlink or
hard-link alias to protected sources, and are removed through the existing
bounded cleanup. Each run must accept the same committed logical evidence and
produce the same authority/projection/bundle/TypeScript/Go byte seals.

Adversarial cases use pure/in-process evidence fixtures so they cannot invoke a
child. They cover an external absolute path disguised as owned, `..`, `.`,
duplicate separators, backslashes, unknown/duplicate/misplaced token,
old-checkout residue, wrong executable or version, altered sandbox/profile,
telemetry/PATH/GO control drift, packed environment merging, owned-path escape,
wrong cwd, and token-bearing spawn input.

They also cover changed Node/npm evidence, Redocly identity/isolation evidence,
Go module evidence, Go-download graph/allowlist evidence, output command-plan
argv, a token-bearing execution-input object key, a clone-external absolute Go
argument, `../` relative escape, and a path from the wrong Query runtime role.
Every case fails before `spawnedChildCount` changes.

Alternative considered: compare only two synthetic root strings. Rejected
because that proves encoder arithmetic but not the actual verifier's
location-derived root and command/evidence path.

### Rebind only location-derived manifest evidence

The implementation SHALL mechanically transform the 86 current source-root
occurrences to admitted logical forms, update only evidence objects whose
content necessarily changes plus the verifier byte length/SHA-256, and leave
all cases, authority identities, external paths, projection semantics, and
generated output hashes untouched. The final verifier proves that no original
checkout root remains and that no additional manifest subtree changed.

No library is added: Node path, fs, assert, child_process, and crypto primitives
already provide every required operation, so bundle/runtime cost is zero.

### Bind lint and TypeScript A/B to closed source projections

The Redocly lint command SHALL consume
`codegen-a/source/openapi/openapi.yaml` and reproduce the accepted nine
warnings with zero errors. The full shared OpenAPI's current ten-warning result
is an explicit negative and SHALL NOT replace that evidence.

The manifest's TypeScript `source` and two command `childArgv` entries SHALL
name the prepared `codegen-a/source/openapi/openapi.yaml` and
`codegen-b/source/openapi/openapi.yaml` inputs respectively. Those projections
are already independently derived from the shared authority, sanitized,
audited, and byte-sealed before TypeScript generation. A/B SHALL remain
independent and produce the existing identical 29,729-byte output with
SHA-256
`345565cd0e972830bc052488cb63c9af5b5d34cc8ac7cf6cf19b1f4f2e510e2b`.

The full shared OpenAPI and each dereferenced bundle are explicit negative
inputs for this Query-only TypeScript wire. The verifier never treats their
different output as an accepted update, and no generated product source is
changed.

Alternative considered: keep the stale full-authority command evidence while
only changing the acceptance Harness. Rejected because the manifest would
continue to attest a command that cannot produce its own sealed output.

### Cascade the byte seal through Query Domain without changing semantics

The Query Domain manifest and verifier SHALL replace only their exact
`shared-query-manifest-v1` SHA-256 with the accepted relocated Query manifest
SHA-256. Because the verifier contains that constant, its byte length/SHA-256
self-identity in the Query Domain manifest SHALL be updated as the sole second
cascade. Every other Query Domain authority entry, case, coverage item,
algorithm, semantic output seal, and file byte remains unchanged.

Alternative considered: make Query Domain ignore location-bearing Query
manifest fields. Rejected because that weakens an intentional byte-level
authority chain and creates a broader semantic projection change.

### Terminate the cascade at Statistics' Query Domain handoff

After the Query Domain manifest is accepted, Statistics SHALL update only the
SHA-256 of its `query-result-handoff` authority to those exact bytes. The
Statistics verifier, cases, file inventory, required coverage, algorithm,
classification, and result seals remain byte-identical. A repository-wide
consumer scan SHALL prove no tracked authority seals the resulting Statistics
index bytes.

## Risks / Trade-offs

- **[Packed historical argv obscures path boundaries]** → Parse only the exact
  admitted evidence shape and delimiters; compare against independently built
  logical expected values; never evaluate or split for execution.
- **[A future evidence field gains an owned path]** → Fail closed until the
  closed path-evidence shape and tests are intentionally reviewed.
- **[Clone fixture testing is expensive]** → Reuse the locked installed input
  closure, run two bounded disposable roots, and keep all fixture bytes under
  the existing cleanup boundary.
- **[A token accidentally reaches a child]** → Enforce a token-free
  spawn-boundary assertion for executable, argv, environment, and cwd.
- **[Artifact hashes contain commit metadata]** → Verify exact runtime payload
  inventories/bytes and exclusion of Query tooling; do not mistake unrelated
  revision-label metadata for product behavior.
- **[Full OpenAPI growth silently changes Query evidence]** → Bind lint and
  A/B generation to audited closed source projections, and reject the
  full-authority lint count plus full-authority/bundle TypeScript output seals.
- **[The downstream byte seal becomes stale]** → Update only the one Query
  manifest authority hash and resulting Query Domain verifier self-identity,
  then update the one Statistics handoff SHA-256 and run both unchanged
  semantic verifiers.
- **[A clean clone lacks prior Go bootstrap residue]** → Track the two accepted
  module files as exact lock inputs, materialize them in prepare with
  create-only writes and read-back seals, and run every positive flow from
  physically absent `.tmp` outputs under network denial.
- **[Materialization stops after one output is created]** → Inject a physical
  write failure between the two create-only writes, prove zero Go children,
  and run exact owner cleanup without touching any pre-existing destination.
- **[Module files drift while a Go child runs]** → Re-seal both files before and
  after every Go child and before successful cleanup. The gate assumes one
  frozen candidate owner; it does not claim a process-wide open-file/TOCTOU
  exclusion stronger than these observable seals.

## Migration Plan

1. Main agent reviews and approves all four strict-valid artifacts while
   integrated acceptance remains paused.
2. The delegated Contracts owner adds pure token/path preflight and tests before
   changing committed evidence.
3. Add the exact reviewed Go module lock inputs, including the sole
   compile-smoke-only indirect uuid v1.6.0 alignment, and prepare-only,
   no-overwrite materialization; bind their exact evidence in the manifest,
   add physical-fault cleanup and per-child re-seals, and prove clean-checkout
   networkless replay without a bootstrap command.
4. Rebind only the admitted 86 source-root occurrences, closed-source Redocly
   lint and paired TypeScript source/command evidence, and Query verifier
   self-identity; inspect the exact manifest JSON-pointer diff.
5. Rebind only Query Domain's exact Query-manifest authority hash and resulting
   verifier self-identity; prove every other Query Domain byte/field unchanged.
6. Rebind only Statistics' `query-result-handoff` SHA-256 and prove the byte
   seal chain terminates there.
7. Run original-root, two-clone, adversarial, determinism, Query, Query Domain,
   Statistics, Backend/Frontend consumer, artifact-exclusion, and residue
   gates.
8. Main agent audits, synchronizes, archives, commits, and rebuilds the formal
   Product candidate before resuming integrated acceptance.

Rollback restores only the two Query files, the two admitted Query Domain
evidence files, the one Statistics index field, and this change's task-marker
preimages while no child is active, then runs physical residue checks. No ref
rewrite, broad cleanup, or protected-path restoration is authorized.

## Open Questions

None. Apply remains blocked until strict validation and explicit main-agent
review are complete.
