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
- Materialize those logical paths to the current clone's canonical absolute
  root only when constructing and executing real child commands; retain exact
  fixed external executable, sandbox, telemetry, and tool paths.
- Reject unknown or misplaced tokens, absolute/escaping/non-normalized logical
  suffixes, ambiguous substitutions, and runtime paths outside the current
  owned clone.
- Prove byte-equivalent success in the original checkout and at least two
  different absolute clone roots, plus fail-closed negatives for path,
  toolchain, sandbox, environment, argument, and working-directory drift.
- Preserve all Query authority, projection, code-generation, Go download
  admission, cleanup, wire semantics, and generated product bytes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `contracts-query-wire`: make committed Query code-generation evidence
  relocatable while keeping executed paths absolute, canonical, clone-owned,
  and fail-closed.

## Impact

| Boundary | Declaration |
|---|---|
| Status | Formal acceptance blocker identified and specified; implementation not started. The active integrated-development acceptance remains paused until this dependency is implemented, verified, synchronized, and archived. |
| Owner | Main agent decides, audits, and accepts the specification and candidate; one delegated Contracts owner implements the bounded correction. |
| Writable paths | Apply may modify only `contracts/goldens/query/verify.mjs` and repository-root-derived fields plus verifier self-identity in `contracts/goldens/query/manifest.json`. Task markers, specification edits, synchronization, and archive lifecycle are reserved to the main agent. |
| Read-only protected inputs | `contracts/openapi/**`, `contracts/schemas/**`, all Query case and Unicode files, `contracts/goldens/query/package.json`, `contracts/goldens/query/package-lock.json`, root `.gitignore`, Backend/Frontend/Updater sources and generated files, `PRODUCT.md`, `DESIGN.md`, the immutable prototype oracle at `644b7748674e553f863d0ffd61d029f86fdc0717`, the active acceptance change, every other OpenSpec change/spec during apply, refs/remotes, external hosts, services, and production state. |
| Deletion complement | No tracked file may be deleted. Only the verifier's already-approved exact generated roots under `contracts/goldens/query/{node_modules,.cache/npm,.cache/go-build,.cache/go-mod,.cache/go-path,.tmp}` may be cleaned by the existing bounded primitives; no other path is removable. |
| Mutable refs | None. Apply may not create, move, rewrite, stage, commit, tag, push, or otherwise mutate any Git ref or index entry. |
| Consumes | The current Query manifest/verifier, current shared Query authority, accepted locked Node/Redocly/Go identities, current clone canonical root, and the existing sandbox/environment/cleanup contracts. |
| Produces | One closed repository-root token contract, canonical encode/materialize validation, relocatable committed evidence, and deterministic cross-clone positive/negative proof. |
| Dependencies | Existing accepted `contracts-query-wire` capability and locked Query toolchain. This correction is a blocking dependency of `complete-integrated-development-acceptance`; acceptance may resume only after this change is strict-valid, implemented, accepted, synchronized, and archived. No new library or tool dependency is introduced. |
| Deliverables | Revised verifier, minimally rebound manifest evidence, cross-clone portability proof, adversarial path/tool/environment proof, exact diff and residue evidence, and an archived capability delta after main-agent acceptance. |
| Acceptance | Strict OpenSpec; exact 86 original-root occurrences reduced to zero; original checkout plus two distinct absolute clone roots pass with byte-equivalent committed inputs/evidence and identical generated Query bytes; locked full Query verifier/codegen/cleanup passes twice where determinism is material; Backend and Frontend Query generation gates pass; all specified negative cases fail before unsafe execution or acceptance; no transient residue or product-bundle byte impact. |
| Non-goals | Changing Query/API semantics, authority selection, projection inventory, generated TypeScript/Go bytes, dependency versions, Go download syntax/admission, cleanup behavior, product UI, statistical behavior, or the formal acceptance protocol. |
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
