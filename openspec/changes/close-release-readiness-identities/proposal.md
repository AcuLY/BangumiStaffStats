## Why

The complete development acceptance now reaches the product owner gates and
fails closed because the Catalog golden's temporary Go module is not a sealed
offline closure. A release candidate also cannot safely claim compatibility
while Archive domain/cast rule versions remain arbitrary tokens and component
artifacts have no single application release identity.

## What Changes

- Make the Catalog Go projection replay and compile from an explicit,
  deterministic module closure that remains runnable without public network.
- Make `domain-raw-v1` plus `cast-exact-v1` the one supported production
  Archive rule pair and bind the pair plus compatibility-matrix digest through
  the producer, Backend consumer, component statements, and assembled
  compatibility manifest.
- Add repository-root `VERSION` as the canonical whole-application
  `v0.1.0` identity and bind it into all three component statements and
  artifacts.
- Add Backend link-time version/revision identity and an exclusive
  `archive-smoke --build-info` inspection mode without changing normal API or
  Archive validation behavior.
- Preserve the immutable prototype's visual and interaction behavior exactly;
  this change contains no UI markup, styling, copy, state, or responsive
  behavior change.

## Capabilities

### New Capabilities

- `contracts-application-release-identity`: Defines the canonical application
  version and its cross-component artifact, binary, OCI, and SBOM bindings.

### Modified Capabilities

- `contracts-catalog-api`: Requires the authoritative Catalog generation gate
  to be reproducible from an explicit offline Go module closure.
- `contracts-archive-manifest`: Closes the Archive compatibility tuple over the
  exact production domain/cast rule pair.
- `contracts-artifact-compatibility`: Carries application and Archive rule
  identities through component statements and final assembly.
- `backend-archive-consumer`: Rejects an Archive whose rule pair is not the
  supported matrix tuple.
- `updater-archive-producer`: Prevents callers from overriding the supported
  production rule pair.

## Impact

| Field | Declaration |
|---|---|
| Status | investigated: complete; specified: complete after strict validation; implemented/verified/committed/pushed/released/deployed: no |
| Owner | Main agent owns decisions/spec audit/final acceptance. Contracts, Backend, and Updater/Frontend artifact implementation are separate subagent blocks. |
| Writable paths | `VERSION`; `contracts/goldens/api/catalog/{verify.mjs,generation.json,index.json}`; `contracts/schemas/archive/**`; `contracts/goldens/archive/**`; `contracts/artifacts/**`; `contracts/producer-runtime-inputs-v1.json`; `backend/internal/archive/**`; `backend/internal/releaseinfo/**`; `backend/internal/architecture/dependencies_test.go`; `backend/cmd/api/**`; `backend/cmd/archive-smoke/**`; `backend/build/**`; `updater/src/bangumi_staff_stats_updater/{archive_contract.py,producer/**}`; `updater/tests/**`; `updater/build/**`; `frontend/build/**`; and this change's OpenSpec lifecycle paths. |
| Read-only protected inputs | `PRODUCT.md`, `DESIGN.md`, `.impeccable/**`, frontend presentation/runtime source and tests outside `frontend/build/**`, immutable oracle `644b7748674e553f863d0ffd61d029f86fdc0717`, unrelated root specs/changes, external repositories, remotes, registries, hosts, secrets, and production state. |
| Deletion complement | None; obsolete generated fixture bytes may only be regenerated in place by the existing bounded Contracts tooling. |
| Mutable refs | Current local branch only through reviewed commits; no tag, release, deployment, or external ref mutation. |
| Consumes | Current accepted Archive/OpenAPI/catalog contracts, formal producer semantics, existing three component artifact builders, and the acceptance-routed Catalog failure evidence. |
| Produces | Deterministic Catalog owner gate, closed rule compatibility tuple, root application version, release-aware component artifacts, and fail-closed cross-component compatibility evidence. |
| Dependencies | All previously archived development capabilities. The active integrated acceptance remains suspended until this change is archived. |
| Deliverables | Production code, contract/golden updates, regenerated deterministic fixture evidence, and owner-local automated tests only. |
| Acceptance | Strict OpenSpec; Catalog verification with public network denied and a fresh owned cache; Contracts golden/schema/tooling checks; Backend race/unit/build/reproducibility/smoke; Updater format/lint/type/unit/build/reproducibility/smoke; Frontend artifact reproducibility; cross-component assembly/tamper tests; no UI diff; exact paths; no residue; `git diff --check`. |
| Non-goals | New product features, UI or interaction changes, schema SQL changes, dependency upgrades, signing, publishing, deployment, host mutation, production activation, or legacy retirement. |
| Operations deferred | Repository operations definitions and isolated `myserver` validation are a following OpenSpec after final development acceptance. Live nginx/systemd/Compose, DNS/TLS, cutover, and old-system removal remain out of scope. |
| Stop/rollback conditions | Stop on unsupported rule ambiguity, product behavior drift, UI source mutation, undeclared dependency/network use, dirty/mixed build identity, nondeterministic artifact bytes, path overlap, or external-state mutation. Roll back only uncommitted owned paths and ignored owner-local build output. |

External behavior classification is `PRESERVE_ORACLE` for all frontend visual,
interaction, state, copy, and responsive behavior at oracle
`644b7748674e553f863d0ffd61d029f86fdc0717`. Release/build metadata and stricter
Archive rejection are `NEW_CAPABILITY` internal release-readiness behavior
governed by the formal development guides and existing Archive contracts.

Apply is blocked until proposal, specs, design, and tasks pass strict
validation and main-agent review.
