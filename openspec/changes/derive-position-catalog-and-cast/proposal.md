## Why

The immutable Archive producer can build and validate a snapshot, but the
rewrite still lacks the governed derivation that turns the exact
`bangumi/common` position catalog and exact Archive character relations into
canonical staff, cast, group, shortcut, and dormant staff-set rows. Without
that layer, later query and catalog endpoints would either depend on a static
legacy mapping or invent private position semantics.

## What Changes

- Add Contracts-owned strict schemas and closed goldens for dynamic five-type
  common positions, multi-category grouping, fixed shortcuts, dormant
  staff-set configuration, exact cast joins, quality classifications, and
  canonical catalog-configuration identity.
- Add an Updater-owned derivation stage that compiles those contracts into the
  existing SQLite v1 staff/cast/catalog tables before manifest finalization.
- Generate one stable `staff:{type}:{positionId}` for every current common
  position, exactly four anime/game `cast:{type}:main|all` positions, and no
  active `staffset:*` positions while retaining and testing the strict
  extension point.
- Preserve the accepted global `valid_cv` person whitelist, derive cast only
  from exact same-subject `(subjectId, characterId)` joins, keep official
  position IDs 101–106 exclusively in `staff:*`, and block snapshots on
  unexplained quality or contract drift.
- Include the canonical catalog configuration and accepted cast-rule identity
  in the existing manifest/dataVersion flow; never enrich an already finalized
  Archive.

Behavior classification:

- `PRESERVE_ORACLE`: preserve the accepted global `valid_cv` filtering
  behavior from oracle commit
  `644b7748674e553f863d0ffd61d029f86fdc0717`.
- `INTENTIONAL_DELTA`: replace the legacy finite/numeric position and voice
  mapping with the PRODUCT dynamic catalog, distinct `staff:*`/`cast:*`
  namespaces, exact-only cast, fixed shortcuts, and dormant staff sets, as
  governed by PRODUCT and accepted `DR-DATA-POSITION-001`,
  `DR-DATA-CAST-002`, and `DR-DATA-CAST-003`.
- `NEW_CAPABILITY`: produce governed catalog/cast rows and shared derivation
  evidence. This change adds no API route, UI, or operational behavior.

## Capabilities

### New Capabilities

- `contracts-position-catalog`: Strict language-neutral catalog configuration,
  derivation, cast-quality, and closed golden contracts.
- `updater-position-catalog`: One-shot compilation of common positions,
  display groups, shortcuts, dormant staff sets, and exact cast into an
  immutable Archive candidate.

### Modified Capabilities

None. The accepted Archive manifest/SQLite authority and producer lifecycle are
consumed unchanged.

## Impact

| Boundary | Declaration |
|---|---|
| Status | investigated: complete; specified: approved; implemented: no; verified: main semantic/dependency review plus strict change/all validation and doctor passed; committed/pushed/released/deployed: no |
| Owner | Contracts owner applies and hands off the strict schemas/goldens first; only after main-agent acceptance of that block may one Updater owner consume them and implement derivation; main agent reviews both blocks. |
| Writable paths | Planning: `openspec/changes/derive-position-catalog-and-cast/**`. Contracts apply block: `contracts/schemas/catalog/**`, `contracts/goldens/catalog/**`, and Contracts task markers only. Updater apply block: `updater/config/catalog/**`, `updater/src/bangumi_staff_stats_updater/catalog/**`, the accepted producer integration subtree `updater/src/bangumi_staff_stats_updater/producer/**`, `updater/tests/catalog/**`, `updater/tests/producer/**`, and Updater task markers only. |
| Read-only protected inputs | `contracts/schemas/archive/**`, `contracts/goldens/archive/**`, every other `contracts/**` path, `openspec/specs/**`, the archived `produce-immutable-archive` artifacts, `updater/src/bangumi_staff_stats_updater/archive_contract.py`, `updater/src/bangumi_staff_stats_updater/cli.py`, `updater/pyproject.toml`, `updater/uv.lock`, `updater/README.md`, all other `updater/**`, all `backend/**` and `frontend/**`, PRODUCT/DESIGN/guides/oracle, other changes/tasks, Git refs/remotes, hosts, and production. |
| Deletion complement | None; no existing authority, source, fixture, runtime behavior, configuration, or version may be deleted, renamed, rewritten outside the exact writable set, or treated as disposable. |
| Mutable refs | None; neither owner may stage, commit, sync/archive, switch/amend a ref, push, tag, release, or deploy. |
| Consumes | After its exit, accepted and archived `produce-immutable-archive`; the exited `correct-archive-raw-domain-semantics` authority; accepted `contracts-archive-manifest` and `updater-runtime-foundation`; the exact Archive/common identities and producer staging boundary; PRODUCT catalog behavior; the data/backend guides; accepted oracle decisions; and Contracts-owner catalog evidence. |
| Produces | Contracts: strict catalog/config/case/index schemas and closed synthetic goldens. Updater: canonical catalog-config bytes/digest, five-type staff positions/categories/groups, fixed shortcuts, empty active staff-set rows with a validated extension path, exact eligible cast rows, bounded quality evidence, and an augmented inactive Archive candidate through the accepted producer. |
| Dependencies | Direct DAG dependency: `produce-immutable-archive`, which MUST be main-agent accepted, synchronized, archived, and absent from active changes before either apply owner starts. `correct-archive-raw-domain-semantics` has exited and fixes raw numeric roles `1..6`, `main=1`, positive relation codes, and five subject types across Contracts and the Go consumer. Contracts completes and is accepted before Updater starts. |
| Deliverables | Contract schemas/tooling/goldens; versioned display and empty staff-set configuration; common parser/diff; deterministic catalog/cast compiler; producer integration; unit/property/golden/complete-source tests; bounded quality report and documentation inside owned subtrees. |
| Acceptance | Contracts closed-index and strict-schema gates; synthetic full derivation covering all rules and failures; complete-source common/Archive quality gate; every common `(type,id)` maps exactly once; multi-categories duplicate only references, never entities; fixed shortcuts are exact; main is a subset of all; only exact same-subject cast survives; 101–106 remain staff; active staff sets are empty; canonical config/dataVersion identities are deterministic; accepted Archive/producer, Python, OpenSpec, diff, inventory, and residue gates pass. |
| Non-goals | Cross-work/series cast inference, role-source policy changes, legacy numeric/168-item compatibility, active staff sets, catalog/query/statistical HTTP endpoints, Go domain work, frontend selectors/search/state, collection data, `current.json`, activation, scheduling, or operations. |
| Operations deferred | Production source credentials/roots, periodic acquisition, locks, activation/retention/rollback, restart/readiness orchestration, monitoring, deployment, release, and cutover. |
| Stop/rollback conditions | Hard-stop before mutation while the producer is not accepted/archived; also stop on raw-domain authority drift, owner-envelope drift, any Archive-authority need, protected-path integration need, or incomplete common/config/source evidence. This change SHALL NOT map numeric roles privately or edit the root contract. Any schema/meaning need outside `contracts/**/catalog/**` returns to a separate main-reviewed amendment. On apply failure, remove only owned disposable staging/output, preserve prior versions and protected inputs, and publish no candidate. |

External access is limited to read-only acquisition of the exact locked
Contracts development tool and an explicitly invoked HTTPS complete-source
verification against exact Archive/common identities. This change mutates no
external repository, remote ref, service, host, or production state. Apply
remains blocked until the direct producer dependency has been accepted and
archived. The planning artifacts are main-approved and strict-valid, and the
raw-domain authority correction has already exited.
