## Why

`contracts/goldens/query/manifest.json` persists 86 occurrences of the original
checkout root, while `verify.mjs` correctly derives owned HOME, TMP, cache,
working-directory, environment, and child-argument paths from its current
clone. The same product bytes therefore fail formal acceptance solely because
the run-owned clone has a different absolute path; Query evidence needs a
closed relocatable representation without weakening runtime containment.

## What Changes

- Represent only repository-owned absolute paths in committed Query manifest
  evidence through one fixed repository-root token and strict canonical
  repository-relative suffixes.
- Construct runtime paths independently from the current clone's canonical
  absolute root rather than expanding manifest tokens. Preserve only the
  owner's fixed repository-relative child arguments, resolve them against an
  already verified cwd before spawn, and retain exact external executable,
  sandbox, telemetry, and tool paths.
- Reject unknown or misplaced tokens, absolute/escaping/non-normalized logical
  suffixes, ambiguous substitutions, and runtime paths outside the current
  owned clone.
- Close every fixed execution/evidence identity before use: exact Node/npm,
  Go/gofmt, Redocly/TypeScript CLI files and versions; the complete Redocly
  isolation record; Go module files, output command plan, recovery history,
  and the complete Go-download admission policy. A manifest must not be able
  to enlarge an allowlist by changing both its graph and union.
- Make a clean Query candidate self-contained for offline Go verification:
  preserve the 197-byte `go.mod` and 1,306-byte `go.sum` as tracked,
  hash-sealed lock inputs, and have the dependency-free prepare mode
  materialize those exact bytes into `.tmp` before any Go child. Align only the
  compile-smoke-only indirect `github.com/google/uuid` requirement from v1.5.0
  to v1.6.0 so the Query module set is a subset of the already accepted
  Backend-seeded offline cache closure. This replaces the accidental reliance
  on a prior interactive `go get` without disabling checksum verification,
  admitting network access, or changing generated Go bytes.
- Make the final Go spawn boundary operation-specific and fail-closed: reject
  token-bearing object keys as well as values, every unclassified absolute or
  escaping relative argument, and any path admitted under the wrong Query
  runtime root.
- Correct the stale codegen command evidence so Redocly lint consumes the
  prepared `codegen-a` closed Query source projection with its accepted nine
  warnings, and TypeScript A/B consume their paired closed source projections
  whose accepted 29,729-byte output is already sealed, rather than the
  now-expanded full shared OpenAPI or a dereferenced bundle.
- Prove byte-equivalent success in the original checkout and at least two
  different absolute clone roots, plus fail-closed negatives for path,
  toolchain, sandbox, environment, argument, and working-directory drift.
- Rebind the Query Domain golden's exact Query-manifest authority hash and its
  verifier self-identity, because that downstream consumer intentionally seals
  the complete Query manifest bytes; no Query Domain case or semantic seal may
  change.
- Rebind only Statistics' `query-result-handoff` authority SHA-256 to the
  resulting Query Domain manifest; that is the final tracked byte-seal consumer
  in this dependency chain.
- Preserve all Query authority, projection, code-generation, Go download
  admission, cleanup, wire semantics, and generated product bytes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `contracts-query-wire`: make committed Query code-generation evidence
  relocatable while keeping absolute runtime paths and resolved
  repository-relative child arguments canonical, clone-owned, and fail-closed.

## Impact

| Boundary | Declaration |
|---|---|
| Status | Formal acceptance blocker identified and specified; implementation is in progress under this reviewed change. The active integrated-development acceptance remains paused until this dependency is implemented, verified, synchronized, and archived. |
| Owner | Main agent decides, audits, and accepts the specification and candidate; one delegated Contracts owner implements the bounded correction. |
| Writable paths | Apply may modify `contracts/goldens/query/verify.mjs`; add only `contracts/goldens/query/fixtures/go-module/{go.mod.lock,go.sum.lock}` as the accepted offline module inputs; modify repository-root-derived fields, closed-source Redocly lint and paired TypeScript source/command evidence, offline module-input evidence, and verifier self-identity in `contracts/goldens/query/manifest.json`; modify only the resulting exact Query-manifest authority hash plus Query Domain verifier self-identity in `contracts/goldens/query-domain/{verify.mjs,manifest.json}`; and modify only Statistics `authorities[id=query-result-handoff].sha256` in `contracts/goldens/statistics/index.json`. Task markers, specification edits, synchronization, and archive lifecycle are reserved to the main agent. |
| Read-only protected inputs | `contracts/openapi/**`, `contracts/schemas/**`, all Query, Query Domain, and Statistics case/Unicode files, golden package/lock authorities, every Query Domain and Statistics manifest field not explicitly named writable, Statistics verifier, root `.gitignore`, Backend/Frontend/Updater sources and generated files, `PRODUCT.md`, `DESIGN.md`, the immutable prototype oracle at `644b7748674e553f863d0ffd61d029f86fdc0717`, the active acceptance change except its separately owned Query module-authority/cache/lint harness correction, every other OpenSpec change/spec during apply, refs/remotes, external hosts, services, and production state. |
| Deletion complement | No tracked file may be deleted. Only the verifier's already-approved exact generated roots under `contracts/goldens/query/{node_modules,.cache/npm,.cache/go-build,.cache/go-mod,.cache/go-path,.tmp}` may be cleaned by the existing bounded primitives; no other path is removable. |
| Mutable refs | None. Apply may not create, move, rewrite, stage, commit, tag, push, or otherwise mutate any Git ref or index entry. |
| Consumes | The current Query manifest/verifier, the prepared paired closed Query source projections, Query Domain's exact Query-manifest authority seal, Statistics' exact Query Domain handoff seal, current shared Query authority, accepted locked Node/Redocly/Go identities, current clone canonical root, and the existing sandbox/environment/cleanup contracts. |
| Produces | One closed repository-root token contract, canonical one-way encoding and independent runtime-path validation, self-consistent closed-source Redocly lint and paired TypeScript command evidence, exact tracked offline Go smoke-module inputs and fail-closed materialization, relocatable committed evidence, minimally rebound Query Domain authority/self and Statistics handoff seals, and deterministic cross-clone positive/negative proof. |
| Dependencies | Existing accepted `contracts-query-wire` capability and locked Query toolchain. This correction is a blocking dependency of `complete-integrated-development-acceptance`; acceptance may resume only after this change is strict-valid, implemented, accepted, synchronized, and archived. No new library or tool is introduced; the sole dependency-version delta is the compile-smoke-only indirect `github.com/google/uuid` v1.5.0 to v1.6.0 alignment already present in the accepted Backend cache closure. |
| Deliverables | Revised Query verifier, the two exact offline module lock inputs, minimally rebound and self-consistent Query manifest evidence, minimally rebound Query Domain authority/self evidence, one rebound Statistics handoff SHA-256, cross-clone portability proof, adversarial path/tool/environment proof, exact diff and residue evidence, and an archived capability delta after main-agent acceptance. |
| Acceptance | Strict OpenSpec; exact 86 original-root occurrences reduced to zero; the 197-byte `go.mod` with SHA-256 `dded0ad8642adcdbb5a786de7b12165ba33ec550adbaefae7fd3bba0479c2a94` and 1,306-byte `go.sum` with SHA-256 `46983b3967ffaae472baff9b8bd827dc57b7cfe6462fe589112b3e8ea24f38a0` are reproduced from tracked sealed inputs in a clean checkout with no network and no checksum bypass; the only module-version delta is compile-smoke-only indirect `github.com/google/uuid` v1.6.0 and all generated Go/TypeScript bytes remain identical; Redocly lint consumes the `codegen-a` source projection and reproduces nine warnings; paired TypeScript commands consume `codegen-a`/`codegen-b` source projections and reproduce the accepted 29,729-byte/SHA-256 seal; Query Domain and Statistics exact byte-seal consumers validate with no semantic evidence drift; original checkout plus two distinct absolute clone roots pass with byte-equivalent committed inputs/evidence and identical generated Query bytes; locked full Query verifier/codegen/cleanup passes twice where determinism is material; Backend and Frontend Query generation gates pass; all specified negative cases fail before unsafe execution or acceptance; no transient residue or product-bundle byte impact. |
| Non-goals | Changing Query/API semantics, authority selection, projection membership/bytes, generated TypeScript/Go bytes, any dependency version other than the exact compile-smoke-only indirect `github.com/google/uuid` v1.5.0 to v1.6.0 alignment, Go download syntax/admission beyond sealing that exact pair, cleanup behavior, product UI, statistical behavior, or the formal acceptance protocol beyond its separately specified Query module-authority/cache/lint correction. |
| Operations deferred | No operations configuration, host validation, deployment, activation, legacy retirement, service, Nginx, systemd, Docker, or production change is part of this Contracts correction. |
| Stop/rollback conditions | Stop on an ambiguous token boundary, non-canonical root/suffix, repository escape, external path normalization, changed fixed tool/telemetry/sandbox identity, generated-byte drift, protected-path edit, unexpected deletion, network/host/ref mutation need, residue, or P0/P1 finding. Preserve evidence, revert only exact owned unstaged edits, and return formal acceptance to its pre-correction paused state; never use broad cleanup or history rewrite. |

Externally visible product behavior is `PRESERVE_ORACLE`: the immutable oracle
commit remains authoritative and this tooling-only correction creates no visual,
interaction, wire, statistical, or runtime product delta. It touches no other
repository or external state; push, pull request, tag, release, deployment,
host mutation, production activation, and legacy retirement remain separately
gated.

Apply is blocked until proposal, specs, design, and tasks are complete, pass
strict validation, and receive explicit main-agent review.
