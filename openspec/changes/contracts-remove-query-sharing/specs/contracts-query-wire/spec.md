## Capability Boundary

| Boundary | Declaration |
|---|---|
| Status | Apply blocked until all planning artifacts pass strict validation and primary review. User authorized the change and preservation of existing dirty edits. |
| Owner | Primary owns frontend, authorities, specs and final acceptance; delegated contracts/backend owner owns contract removal and generated consumers. |
| Writable paths | Frontend: `frontend/src/app/{App.vue,routes.ts}`, `frontend/src/api/adapters/queryWire.ts`, `frontend/src/features/query/{share.ts,session.ts,recovery.ts}`, `frontend/src/features/query/components/{AppHeader.vue,QueryIcon.vue}`, `frontend/src/shared/styles/base.css`, directly affected `frontend/tests/{api,app,features/query,shared}/**`, `frontend/scripts/{check-architecture.mjs,generate-query-wire.mjs,check-query-wire-generated.mjs}`, generated query-wire consumers. Contracts/backend: `contracts/schemas/query/share-payload-v1.schema.json`, share entries in `contracts/openapi/openapi.yaml`, `contracts/goldens/query/{cases,manifest.json,verify.mjs}`, directly dependent golden verifiers/manifests, `backend/scripts/{prepare-query-wire.mjs,generate-query-wire.sh}`, `backend/internal/httpapi/wire/query_wire.gen.go` and directly affected wire/query tests. Documentation: `PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json` and relevant surface brief, `frontend/{ARCHITECTURE,README}.md`, share references in active `tmp-formal-development/*.md`; share requirements/references in active `openspec/specs/**` and active changes (only reconciliation notes/references); this change and its archive destination. Disposable generator/validation artifacts in existing ignored `.tmp`, `.cache`, `node_modules`, `dist` roots. |
| Read-only protected inputs | Statistical implementations, Archive/data files, operations configuration, secrets, legacy directories, unrelated dirty edits and historical archives. |
| Deletion complement | Delete only share-only code/schema/fixtures/tests and generated declarations; no broad cleanup or removal of normal SharedQuery types. |
| Mutable refs | Current master working tree only; no commit/ref movement. |
| Consumes | Accepted query and operation contracts, session state, existing Header tokens. |
| Produces | No public sharing protocol; local validated recovery; fixed legacy link; regenerated types and focused regression evidence. |
| Dependencies | Existing Vue/Naive/Ajv and pinned generator toolchains; no new dependency. Contracts change before generated consumers. |
| Deliverables | Coherent implementation, regression tests, active docs/specs and verification evidence. |
| Acceptance | Focused recovery/route/Header/API tests, full frontend check, relevant backend wire tests and backend gate, contract artifact tests, deterministic generation checks, desktop/mobile browser with keyboard and theme, strict OpenSpec and diff hygiene. Report environmental failures honestly. |
| Non-goals | Remove tab recovery, remove shared query APIs, persist results, keep old share compatibility, change statistics or redesign Header. |
| Operations deferred | No host, routing, deployment, push, merge or release. `/old/` hosting and eventual root cutover are separate work. |
| Stop/rollback conditions | Stop for new concurrent overlap or scope expansion; preserve pre-existing changes and revert only owned edits if needed. |

## MODIFIED Requirements

### Requirement: Versioned single-authority contract bundle

The Contracts owner SHALL publish the v1 shared-query authority as JSON Schema
draft 2020-12 files under `contracts/schemas/query/**`, referenced by stable
named components in `contracts/openapi/openapi.yaml` using OpenAPI 3.1 and the
2020-12 dialect. Stable components SHALL include `SharedQueryV1`,
`EffectiveQueryV1`, and `QueryDigestProjectionV1` in addition to the named
input/view/error components. Every schema object SHALL reject undeclared
properties, every `$ref` SHALL resolve within the approved contract roots, and
the initial OpenAPI document SHALL define no business endpoint path or result
DTO.

Formal consumers SHALL generate from this authority without maintaining a
second schema source. A compatible generator MAY read the referenced authority
directly. A generator that cannot consume its external JSON Schema references
MAY instead use a deterministic consumer-local projection that copies the
authority, removes only proven generator-incompatible schema metadata, and
fully dereferences it with a pinned tool. Every projection SHALL be disposable,
shall preserve the exact 14-component semantic inventory, and shall neither
modify `contracts/**` nor be committed.

API query version selection SHALL be the `/api/v1` family plus versioned schema
IDs/component names; a query-body `schemaVersion` or other undeclared version
field SHALL be rejected.

#### Scenario: Both generators consume one authority

- **WHEN** the TypeScript 6 frontend generator reads the referenced authority directly and the Go foundation generates from its deterministic disposable projection
- **THEN** both types-only outputs SHALL cover all 14 named component schemas without unresolved references or schema-level errors
- **AND** no projection, schema copy, temporary tool installation, or generated consumer file outside its approved owner path SHALL persist

#### Scenario: An undeclared body version is submitted

- **WHEN** a v1 query contains `schemaVersion`, even when its value is `1`
- **THEN** v1 validation fails with the stable unknown-field classification
- **AND** the field is not ignored or used to select another schema

#### Scenario: A nested control plane is proposed

- **WHEN** apply output contains an `openspec/` root or generated OpenSpec skill set below `contracts/`, `backend/`, `frontend/`, `updater/`, `apps/`, or `packages/`
- **THEN** acceptance fails and no implementation commit is authorized


### Requirement: Tag filters use a normalized exact-match AST

Wire tags SHALL be expressed only as:

- `include[]` groups with non-empty `anyOf[]`, where outer groups are AND and inner tokens are OR;
- `exclude[]` groups with non-empty `allOf[]`, where outer groups are OR and inner tokens are AND.

Each token SHALL apply the same exact TrimV1 set as UID, normalize with NFKC, transform with Unicode 15.1 Default Case Folding, and later match exactly. The Contracts owner SHALL commit the official Unicode 15.1 `CaseFolding.txt`, `DerivedAge.txt`, and `NormalizationTest.txt` bytes under `contracts/goldens/query/unicode/`, preserve each Unicode license/source header, and verify their SHA-256 values as `4e55acfdc32825a22e87670e9056a3bf94ad7c5400065778e9e10f8314372bcf`, `04e16379344bdb9973cdb6f6bf0a5dd66f7cd41b014cd9f79d848768ae757256`, and `871238e37e3be0696ec2bd0891119a041b052da1a84485eda05a5438724b223e`. The exact source URLs SHALL be the corresponding filenames beneath `https://www.unicode.org/Public/15.1.0/ucd/`.

Every tag-input code point SHALL be a Unicode scalar value assigned in Unicode 15.1 by the pinned Derived Age data. Consumers SHALL reject post-15.1/unassigned values before normalization and SHALL pass the pinned Unicode 15.1 NFKC conformance cases. Default folding SHALL consume statuses `C` and `F`, exclude Turkic `T`, and prefer full `F` mappings over `S`. Every JSON string key and value SHALL be recursively rejected before canonicalization if it contains an unpaired UTF-16 surrogate. JavaScript locale lowercasing, an unversioned runtime Unicode table, or unchecked `JSON.stringify`/canonicalization SHALL NOT substitute for these gates.

Empty tokens/groups SHALL fail. Equivalent normalized tokens and groups SHALL be deduplicated, and commutative token/group collections SHALL sort by normalized Unicode scalar sequence for deterministic output.

There SHALL be at most 32 include groups, 32 exclude groups, 16 tokens per group, 256 normalized tokens total, and 256 UTF-8 bytes/Unicode code points per normalized token. Personal matching later consumes public, meta, and that UID's collection tags; global matching later consumes public and meta tags only. This change SHALL NOT implement matching or access a collection.

#### Scenario: Include and exclude semantics are preserved
- **WHEN** a positive golden contains multiple `anyOf` groups and an exclusion golden contains multiple `allOf` groups
- **THEN** the manifest declares include outer-AND/inner-OR and exclude outer-OR/inner-AND
- **AND** both future consumers can run the same language-neutral vector

#### Scenario: Equivalent tokens normalize once
- **WHEN** tokens differ only by surrounding TrimV1 whitespace, NFKC width form, or Unicode 15.1 default case fold
- **THEN** normalization emits one canonical token/group and remains idempotent

#### Scenario: TrimV1 is cross-language exact
- **WHEN** UID and tag vectors place `U+0085`, `U+FEFF`, or mixed TrimV1 boundary runs before and after content
- **THEN** `U+0085` and every other enumerated White_Space scalar are removed only at the boundaries
- **AND** `U+FEFF` is preserved
- **AND** JavaScript `String.trim()`, Go `strings.TrimSpace`, or any other runtime-native whitespace set cannot replace TrimV1

#### Scenario: Unicode mapping provenance is exact
- **WHEN** the contract verifier loads the committed CaseFolding, Derived Age, and Normalization Test data
- **THEN** their source version, preserved license headers, and SHA-256 values match the required values
- **AND** every pinned NFKC conformance case passes before tag vectors run

#### Scenario: Input is outside the Unicode 15.1 scalar boundary
- **WHEN** a tag contains a post-15.1/unassigned code point, or any JSON key/value contains an unpaired high or low surrogate
- **THEN** validation fails before NFKC, RFC 8785, or digest computation

#### Scenario: UI delimiter syntax crosses the wire
- **WHEN** a caller submits `/` or `+` as structural syntax, an empty token, an empty group, or a prototype `enabled` wrapper
- **THEN** validation fails and no tag matching is executed

#### Scenario: Tag defense limit is exceeded
- **WHEN** any group/token/byte/total-token limit is exceeded
- **THEN** validation fails with a bounded field error
- **AND** the verifier does not allocate based on the untrusted declared size

### Requirement: Effective-query normalization and queryDigest are deterministic and cycle-free

The authoritative normalization vectors under `contracts/goldens/query/**` SHALL define submitted query, catalog context, expected Effective Query, expected closed `QueryDigestProjectionV1`, exact RFC 8785 canonical projection JSON, exact digest preimage, exact queryDigest, and expected error where applicable. Successful normalization SHALL materialize boolean defaults, retain only the first occurrence of each ordered PositionKey, canonicalize unordered collection statuses and tag groups, omit empty filter containers, preserve decimal JSON number meaning, and revalidate against closed Effective Query and digest-projection schemas before canonicalization.

Normalization SHALL be idempotent and SHALL NOT consume or embed its own digest. RFC 8785 bytes SHALL be produced by the reviewed, locked `canonicalize@3.0.0` implementation in the Contracts verifier and SHALL pass official RFC 8785 adversarial number/string/Unicode-key vectors; a handwritten recursive key sort or bare platform `JSON.stringify` SHALL NOT be the authority.

The exact digest algorithm SHALL be:

```text
projection = QueryDigestProjectionV1(EffectiveQueryV1)
canonical = RFC8785(projection)
preimage = ASCII("bgmss.query.v1") || OCTET(0x00) || UTF8(canonical)
queryDigest = "q1:" || lowercase_hex(SHA-256(preimage))
```

`QueryDigestProjectionV1` SHALL contain exactly effective `scope`, `subjectType`, ordered unique `positionKeys`, personal `collectionStatuses`, explicit `includeNSFW`/`mergeSeries`, and normalized active filters; it SHALL omit personal `uid`. The fixed prefix SHALL be 15 bytes total: the 14 ASCII bytes for `bgmss.query.v1` followed by exactly one NUL octet `0x00`, never the printable characters backslash and zero. Every successful digest golden SHALL record the projection, separator, and complete preimage as lowercase hexadecimal and unpadded base64url so Go, TypeScript, and the contract verifier compare exact bytes without source-language escape ambiguity.

`uid`, `dataVersion`, operation, operation input, view,
search, sort, order, page, pageSize, section, query revision, input digest,
collection digest, result, rank, and statistic SHALL NOT enter the digest
projection, canonical bytes, or queryDigest preimage. The path/operation
determines mode. The digest is a shared contract output but SHALL NOT by itself
implement a runtime cache key or lookup; a later backend cache capability
composes it with separately owned dimensions.

#### Scenario: Two semantically equivalent submissions normalize
- **WHEN** two valid inputs differ only in default omission, repeated PositionKeys after the same first occurrence, collection-status order/duplicates, or tag token/group order/duplicates
- **THEN** they emit the same effective-query JSON value
- **AND** they produce the same canonical preimage and queryDigest

#### Scenario: Normalized output is normalized again
- **WHEN** every expected effective query is fed back through the same contract normalizer
- **THEN** the second output is byte-equivalent under RFC 8785 canonicalization
- **AND** the exact preimage and queryDigest remain unchanged

#### Scenario: Digest exclusion field changes
- **WHEN** only personal UID, dataVersion, operation, input, view, search, sort, order, page, pageSize, section, query revision, input digest, or collection digest changes outside the digest projection
- **THEN** the queryDigest remains unchanged
- **AND** a later cache key may still differ when its owning capability composes those dimensions

#### Scenario: Canonicalization adversarial vector runs
- **WHEN** the verifier processes the official RFC 8785 number, escaped-string, Unicode-key-order, negative-zero, and precision edge vectors plus project Effective Query vectors
- **THEN** `canonicalize@3.0.0` emits the declared exact UTF-8 bytes
- **AND** any non-finite or non-JSON numeric input fails before canonicalization

#### Scenario: Mode or digest field is submitted
- **WHEN** `mode`, `operation`, `queryDigest`, `inputDigest`, `dataVersion`, or `queryRevision` appears inside the shared query
- **THEN** strict validation rejects it as the wrong layer or an unknown field

### Requirement: Search, sort, order, and pagination are strict view values

The contract SHALL define closed v1 primitives: search defaults to `""` and is bounded to 256 Unicode code points/UTF-8 bytes; order is `asc|desc` and defaults `desc`; page is a positive JSON-safe integer and defaults `1`; pageSize is exactly `5|10|20` and defaults `10`. Submitted views MAY omit defaulted fields, but normalized views SHALL materialize them.

The named components SHALL have exactly this field/default matrix:

| Component | Exact fields | Defaults and contextual validation |
|---|---|---|
| `RankingsViewV1` | optional `search`, `sort`, `order`, `page`, `pageSize` | `""`, `count`, `desc`, `1`, `10`; sort `count|average|overall|preference`, personal-only `preference` |
| `CandidatesInputV1` | required `positionKey` | Explicit Effective Query key; never inferred |
| `CandidatesViewV1` | optional `search`, `sort`, `order`, `page`, `pageSize` | `""`, `count`, `desc`, `1`, `10`; personal `count|average|globalAverage`, global `count|average` |
| `PersonDetailInputV1` | required `personId` | Positive JSON-safe integer |
| `PersonDetailViewV1` | optional `section`, `search`, `sort`, `order`, `page`, `pageSize` | section `works`; common `""`, `desc`, `1`, `10`; omitted sort is `globalScore` for works or `role` for characters; works permits `globalScore`, personal-only `personalScore|collectionUpdatedAt`, series-only `seriesSize`; characters permits `role|workCount|name` |
| `PartnersInputV1` | required closed `source {personId,positionKeys}`; optional `candidatePositionKey` | Source ID positive JSON-safe; source keys non-empty/ordered/unique query subset; optional candidate is a query key; omission means all positions, never an `"all"` sentinel |
| `PartnersViewV1` | optional `search`, `sort`, `order`, `page`, `pageSize` | `""`, `count`, `desc`, `1`, `10`; `count|average|overall|preference`, personal-only `preference` |
| `CoStarInputV1` | required ordered `participants` | 2–10 unique positive JSON-safe person IDs; each has non-empty ordered unique query keys; at most 20 total person/key identities |
| `CoStarViewV1` | optional `search`, `sort`, `order`, `page`, `pageSize` | `""`, personal `personalScore` or global `globalScore`, `desc`, `1`, `10`; global permits `globalScore`, personal adds `personalScore|collectionUpdatedAt`, series adds `seriesSize` |

Sort, search, order, page, pageSize, and section SHALL be view state, not shared-query filters and SHALL NOT enter the queryDigest projection. Operation-input arrays SHALL already be normalized and reject duplicates, unlike submitted query arrays. These components SHALL validate request state but SHALL NOT perform searching, sorting, rank assignment, or pagination. Future endpoint request schemas SHALL reuse the exact named components by `$ref`; they SHALL NOT introduce loose JSON or a competing input/view schema. Changing a field, optionality, enum, or default SHALL first modify this capability through OpenSpec.

#### Scenario: View defaults are applied
- **WHEN** a view omits optional search/order/page/pageSize values
- **THEN** the corresponding operation's declared defaults normalize deterministically

#### Scenario: Page boundary is valid
- **WHEN** page is 1 and pageSize is 5, 10, or 20
- **THEN** the view validates

#### Scenario: Invalid view is rejected
- **WHEN** page is zero/fractional, pageSize is not 5/10/20, search exceeds its limit, sort/section is unknown, or a personal-only sort is used by global scope
- **THEN** validation fails with a view field error

#### Scenario: View fields are placed in query
- **WHEN** search, sort, order, page, pageSize, or section appears inside `SharedQueryV1`
- **THEN** validation fails rather than changing the query's result-set identity

#### Scenario: Endpoint defines a competing view
- **WHEN** a future endpoint wrapper copies, loosens, or independently redefines an operation input/view instead of referencing the named component
- **THEN** contract acceptance fails until the schema uses the shared `$ref` or this capability is explicitly modified

### Requirement: Operation input remains distinct from query and view

The named input components SHALL provide strict reusable shapes for positive JSON-safe person IDs (`1..9007199254740991`), ordered unique identity PositionKeys, and explicit candidate PositionKey. Candidate current position, detail person, partner source/candidate-position filter, and co-star participants SHALL be input values; they SHALL NOT be embedded in the shared query or inferred from a result page.

This capability SHALL NOT define endpoint wrappers, handler behavior, response bodies, or statistics. Later endpoint capabilities SHALL compose these exact named v1 primitives by `$ref` and may add operation-specific constraints only through a reviewed modification of `contracts-query-wire`.

#### Scenario: Candidate position is explicit
- **WHEN** a candidate input is represented in a golden
- **THEN** it contains an explicit PositionKey that is present in the Applied Query
- **AND** the consumer does not silently substitute the query's first key

#### Scenario: Identity is outside the Applied Query
- **WHEN** a person identity uses a PositionKey absent from the effective query
- **THEN** semantic validation fails before an endpoint request

#### Scenario: Endpoint result is proposed in this change
- **WHEN** apply introduces a rankings/candidates/detail/partners/co-star response DTO, handler, store, cache, or statistical expected result
- **THEN** path/content acceptance fails as outside `contracts-query-wire`

### Requirement: Language-neutral goldens cover positive, negative, normalization, digest, and canonical bytes

`contracts/goldens/query/**` SHALL be data-first and consumable without JavaScript-specific value encodings. A manifest SHALL identify each case, schema, catalog/path context, expected accept/reject result, stable error code/field path, normalized output, digest projection, exact RFC 8785 projection JSON, exact queryDigest separator/preimage/digest. Its code-generation evidence SHALL additionally record exact generator identity/version/command, OpenAPI path count, authoritative component-schema count and sorted names, generated byte length and SHA-256, and the sorted generated declaration inventory. For Go, every authoritative component name SHALL occur as a generated type declaration; byte-positive comment/package output SHALL fail.

Positive vectors SHALL cover both scopes, every PositionKey family, repeated-position first-occurrence normalization, all range/tag forms, every operation component/default, JSON-safe integer boundaries, a valid error envelope. Negative vectors SHALL cover unknown fields at every object layer, scope leakage, malformed/conflicting/catalog-invalid positions, invalid/empty ranges and tags, post-15.1/unassigned scalars, lone high/low surrogates in JSON keys/values, non-finite/non-JSON or unsafe integers via textual fixtures where required, invalid pages/sorts/sections, error-envelope failures. Normalization/digest vectors SHALL prove UID exclusion, canonical equivalence, idempotence, excluded-field invariance, exact projection/separator/preimage, and exact lowercase SHA-256 output. Official RFC 8785 and pinned Unicode 15.1 normalization/age/folding vectors SHALL be represented with source/version provenance.

Oracle-derived limit evidence SHALL record commit/path provenance and measured UID/tag byte lengths without copying the bulk personal fixture. The Contracts verifier is a test oracle only; it SHALL NOT become a runtime query/statistical implementation.

#### Scenario: Every manifest case is executed
- **WHEN** `verify.mjs` runs from a locked clean install
- **THEN** every declared positive, negative, normalization, queryDigest, Unicode, and RFC 8785 case is discovered exactly once
- **AND** missing files, extra undeclared case files, duplicate IDs, or expectation mismatches fail

#### Scenario: Unknown fields are injected at all layers
- **WHEN** the negative matrix adds an unknown field to query, nested filter/range/tag, input/view, error/meta, and operation identity objects
- **THEN** each case fails at the declared boundary

#### Scenario: Future consumers run the same files
- **WHEN** backend and frontend foundation changes add Go and TypeScript consumer tests
- **THEN** they consume the committed JSON vectors directly
- **AND** neither rewrites expected outcomes into language-specific fixtures

### Requirement: Query authority evidence SHALL use one closed owned projection

The Query golden verifier SHALL derive its authority from one deterministic
projection of the shared OpenAPI document containing zero paths, exactly the 14
accepted Query component schemas, exactly the nine accepted shared error
responses, and the accepted fixed Query description. It SHALL audit and copy
only that projected OpenAPI plus the six Query schema files. Endpoint paths,
endpoint-only components, and rankings/candidates/person-detail/partners/co-star
schema roots SHALL remain outside Query ownership and generated-tree inventory.

The canonical authority/projection evidence SHALL change when an owned Query
component changes and SHALL remain byte-identical when an unrelated path,
component, header, response, description, or endpoint schema is added. Both
disposable codegen trees, the backend Query generator, and the frontend Query
generator SHALL agree on the public Query component inventory and generated
wire bytes.

#### Scenario: Independent endpoints exist in the shared authority

- **WHEN** the shared OpenAPI contains accepted endpoint paths and external
  endpoint schema references
- **THEN** Query verification SHALL select and validate only its closed
  projection without traversing or copying those references

#### Scenario: Unrelated authority changes

- **WHEN** a synthetic unrelated path and component are added outside the
  Query projection
- **THEN** the canonical Query projection digest and generated Query bytes
  SHALL remain unchanged

#### Scenario: Owned Query authority changes

- **WHEN** a selected Query component is missing or its content changes
- **THEN** Query verification SHALL fail or produce different projection
  evidence before accepting generated wire bytes

### Requirement: Contract tooling is locked, development-only, and removable

> Historical platform and cleanup evidence: current Query execution is governed by “Current Query verification SHALL retain semantic and deterministic acceptance”. The platform-specific controls and completed one-time freezes below SHALL be interpreted only as archived evidence, never as a requirement to re-execute or claim that historical run. Retained semantic, dependency and ownership invariants continue to apply.

The only committed Node tooling files SHALL be `contracts/goldens/query/package.json`, `contracts/goldens/query/package-lock.json`, and `contracts/goldens/query/verify.mjs`. Root `.gitignore` SHALL be exact UTF-8/LF bytes, including its final LF: `# macOS\n.DS_Store\n\n# Local secrets and environment overrides\n.env\n.env.*\n!.env.example\n!.env.*.example\n\n# Query contract tool state; physically absent at candidate handoff\n/contracts/goldens/query/node_modules/\n/contracts/goldens/query/.cache/npm/\n/contracts/goldens/query/.cache/go-build/\n/contracts/goldens/query/.cache/go-mod/\n/contracts/goldens/query/.cache/go-path/\n/contracts/goldens/query/.tmp/\n`. It SHALL remove broad Node/Vite/Python/Go/log/scratch patterns that hide another owner's escape. Positive `git check-ignore --no-index -v` probes SHALL cover `.DS_Store`, `.env`, a representative `.env.*`, and all six Query transient classes; `.env.example` and `.env.*.example` SHALL be visible exceptions. It SHALL ignore no persistent contract/product/lock/source/test/OpenSpec/editor/foreign probe outside the exact preserved macOS/environment classes, and ignored state never satisfies physical cleanup. Development dependencies SHALL be exactly justified and locked: `ajv@8.20.0`, `ajv-formats@3.0.1`, `@redocly/cli@2.40.0`, `openapi-typescript@7.13.0`, and `canonicalize@3.0.0`. The package and acceptance gate SHALL enforce `node >=20.19.0 <21.0.0 || >=22.12.0` and `npm >=10`; npm engine mismatches SHALL fail rather than warn. Package lifecycle scripts SHALL be disabled during installation. Locked Redocly SHALL only lint authority with `--extends recommended` or fully dereference the two sanitized codegen-only projections through its exact sealed CLI under telemetry/config/network isolation; plain/unsanitized bundles, import mappings, and a committed projection/bundle are forbidden. `oapi-codegen/v2@v2.8.0` SHALL be invoked at that exact version against proven bundle A with exact generation selection `models,skip-prune`; default component pruning is forbidden for this zero-path contract document.

These tools SHALL have zero backend/frontend/updater runtime imports and zero application bundle bytes. `canonicalize@3.0.0` SHALL be the Contracts verifier's reviewed RFC 8785 implementation and SHALL pass official adversarial vectors; future Go/TS runtimes SHALL independently reproduce the golden bytes rather than import this Node verifier. OpenAPI lint, strict schema compilation, vector/digest/canonical-byte execution, and generation feasibility SHALL all be mandatory acceptance gates. A future equivalent repository-owned verifier SHALL remove redundant dependencies through a separate reviewed change rather than accumulating a second toolchain.

All installation, Go build/module/workspace cache, generator temporary, and generated-check output SHALL stay within exactly `contracts/goldens/query/node_modules/**`, `contracts/goldens/query/.cache/npm/**`, `contracts/goldens/query/.cache/go-build/**`, `contracts/goldens/query/.cache/go-mod/**`, `contracts/goldens/query/.cache/go-path/**`, or `contracts/goldens/query/.tmp/**`. Apply SHALL resolve and verify the effective npm cache, `GOCACHE`, `GOMODCACHE`, `GOPATH`, and `TMPDIR` under those roots, SHALL use `GOENV=off`, `GOWORK=off`, and `GOTOOLCHAIN=local`, and SHALL NOT resolve configurable cache/temp output to the system temp directory, home/default package caches, an inherited Go workspace, `frontend/**`, or `backend/**`. Before any ordinary Go process starts, apply SHALL invoke the absolute Go executable's `go env GOTELEMETRY GOTELEMETRYDIR` inside a bootstrap macOS `sandbox-exec` profile combining `(allow default)`, `(deny network*)`, and `(deny file-write*)`, with the same three Go environment controls. This first and only discovery process cannot write telemetry or start an uploader. Apply SHALL stop if the returned non-settable mode is upload-enabled or unknown. The completed discovery reported `local` and canonical directory `/Users/luca/Library/Application Support/go/telemetry`; it SHALL NOT be rerun.

Whole-directory telemetry snapshots SHALL be diagnostic only because persistent editor-owned `gopls`/`vscgo` processes can mutate the same directory independently. Apply SHALL NOT require global snapshot equality, infer exclusive writer attribution from a digest delta, terminate/configure those user processes, or use their activity to excuse an unsandboxed Query Go process. With `local` mode, every later command capable of starting Go—including generation, `gofmt`, temporary compile/test, and a nested verifier command—SHALL execute through `/usr/bin/sandbox-exec` with a reviewed profile containing `(version 1)`, `(allow default)`, and `(deny file-write* (subpath "<canonical telemetry directory>"))`. Apply SHALL record the exact wrapper argv/profile and child command. A direct Go invocation, missing sandbox inheritance, profile/path mismatch, wrapper failure, or unavailable `sandbox-exec` SHALL stop apply with no fallback. The external collection-client Go owner SHALL remain interrupted through this acceptance. Apply SHALL NOT change global telemetry mode, interpret/delete counters for product logic, authorize upload, or write the telemetry directory.

The manifest SHALL define `go-download-progress-v1` with an exact lexically sorted union allowlist of complete `module@version` pairs from the pinned generator tool dependency graph and the temporary compile dependency graph. Pair membership SHALL be atomic: a module and version that occur separately in other allowed pairs SHALL NOT be cross-combined. This policy applies only to final status-zero candidate-success primary generation, deterministic replay, and temporary compile/test records. Earlier rejected attempts and the authorized corrected smoke SHALL remain in a separately named recovery-history namespace and SHALL neither satisfy nor fail candidate admission.

For every candidate-success generation/replay/compile child, stdout and deterministic product evidence SHALL remain exact. Its stderr SHALL be either empty or one or more complete LF-terminated lines of exact form `go: downloading <module> <version>`; each token SHALL be non-empty and free of whitespace/control characters, and their exact reconstructed `module@version` pair SHALL be in the policy allowlist. CRLF, a missing final LF, an unlisted pair, warning, telemetry or sandbox denial, or any other diagnostic SHALL fail closed. Wrapped `gofmt` stderr SHALL always be empty. The committed manifest SHALL record the policy version and exact pair allowlist and SHALL NOT pin cache-dependent observed stderr bytes for accepted commands; the transient candidate handoff SHALL record each candidate-success child's actual bytes and policy result.

Before candidate handoff, `verify.mjs` SHALL first run a static/synthetic cleanup-safety mode under `.tmp/cleanup-safety/**` without trialing or repointing the live roots. It SHALL prove nested read-only-directory removal; internal relative-link unlink-only behavior while an outside-target sentinel remains byte-identical; exact-root and dangling-ancestor link rejection; retry/error/postcondition handling; and zero synthetic fixture residue. Only after that mode and the full verifier pass may `--cleanup-generated` run once against the live allowlist.

The live cleanup allowlist SHALL contain only exact `node_modules`, `.cache/npm`, `.cache/go-build`, `.cache/go-mod`, `.cache/go-path`, and `.tmp` roots under the canonical real `contracts/goldens/query` directory. For each root, cleanup SHALL use `path.relative` to prove containment and `lstat` every repository/golden-root/target path segment; only `ENOENT` means absent, while another error or any real/dangling exact-root or ancestor symlink fails before mutation. An internal symlink strictly below a validated target SHALL be an unlink-only leaf and SHALL never be resolved, followed, recursively traversed, `stat`-followed, or chmodded. Permission repair SHALL add owner `rwx` only to real directories inside that target and SHALL never chmod files or links. Each present root SHALL be recursively removed with `force=false`, `maxRetries=5`, and `retryDelay=100`, after which a new `lstat` SHALL return `ENOENT`. Retry exhaustion, a surviving root, or any outside-target sentinel change SHALL fail. Success evidence SHALL contain exact lexically sorted `removed` and `alreadyAbsent` lists. All six roots SHALL then be physically and index absent; none may be committed or tolerated merely because ignored.

After the four exact `.cache/*` leaves are `ENOENT`, cleanup SHALL also prune exact container `contracts/goldens/query/.cache` without treating arbitrary content as removable. It SHALL reuse `path.relative` containment and segment-by-segment `lstat`; accept only initial exact `ENOENT` or a real non-symlink directory; and require `readdir` to return zero entries. It SHALL use one initial non-recursive exact-target removal plus at most five retries. Only removal errors `EBUSY`, `EMFILE`, `ENFILE`, or `EPERM` MAY wait exactly 100 ms and retry, and every retry SHALL first repeat exact-parent `lstat` and zero-entry `readdir`. `ENOTEMPTY`, an `ENOENT` race after initial presence, link/type/entry/identity drift, escape, another error, retry exhaustion, or a non-`ENOENT` postcondition SHALL fail immediately without recursive deletion and preserve any observed child. Evidence SHALL report exact stable `emptyParents.removed` and `emptyParents.alreadyAbsent` separately from the six-leaf result.

The first six-leaf cleanup already completed once but left this empty parent, so one correction apply is authorized only after this amended OpenSpec passes independent review. It may modify only `verify.mjs`, exactly `acceptanceEvidence.projectionTool.verifier.{bytes,sha256}` in `manifest.json`, and its own task checkbox. The other 22 Query product files SHALL remain byte-identical, and the verifier diff SHALL be limited to generated-root/empty-parent cleanup helpers, cleanup-safety cases/lifecycle, cleanup dispatch, and cleanup evidence output; schema/vector/normalization/Unicode/codegen/Go-stderr-admission and every other path SHALL remain unchanged.

Safety preflight SHALL require exact `.tmp` `ENOENT`; the revised mode MAY create only exact `.tmp` as its synthetic container, SHALL remove all fixtures/children, and SHALL then non-recursively remove that exact `.tmp` through the bounded primitive with a fresh `lstat -> ENOENT`. The owner may then run one corrected cleanup invocation against the already-absent leaves and exact empty parent, followed only by read-only gates. It SHALL NOT rerun npm/install, Redocly, TypeScript/Go generation, compile, schema/vector/full verifier work, recreate another product/cache root, or edit other OpenSpec status text. The corrected invocation SHALL report all six leaves `alreadyAbsent`, report `.cache` under `emptyParents.removed`, and leave no cache/temp/generated/symlink or fixture residue.

#### Scenario: Locked tooling verifies the bundle
- **WHEN** a clean locked install runs schema compilation, OpenAPI lint, Unicode/RFC 8785/normalization/queryDigest vectors, TS generation, and Go model-only generation with all cache paths redirected into the owned root
- **THEN** every command exits zero with deterministic generation output, the Go output is longer than the 190-byte rejected baseline and contains actual declarations for all 14 authoritative component-schema names, and temporary Go syntax/`gofmt`/compile smoke passes
- **AND** the manifest's exact commands, versions, path/component counts, declaration inventories, byte lengths, hashes, dependency versions, and lock integrity match the observed outputs

#### Scenario: Default pruning returns a header-only Go file
- **WHEN** Go generation exits zero but omits any authoritative component declaration, including the observed zero-path/default-pruning result
- **THEN** generation feasibility fails regardless of file non-emptiness or empty `gofmt -d`
- **AND** no candidate handoff or staging is authorized

#### Scenario: Generated tooling residue remains
- **WHEN** `node_modules`, `.cache/npm`, `.cache/go-build`, `.cache/go-mod`, `.cache/go-path`, `.tmp`, generated Go/TS, or any tool output remains in the physical tree/index at candidate handoff or appears outside the owned golden root
- **THEN** acceptance fails and no staging is authorized

#### Scenario: Cleanup cannot prove its exact no-follow boundary
- **WHEN** an exact cleanup root or ancestor is a real or dangling symlink, any path escapes lexical containment, an internal link is followed or chmodded instead of unlinked as a leaf, a non-directory is chmodded, bounded retries exhaust, a post-delete `lstat` returns anything except `ENOENT`, or an outside-target sentinel changes
- **THEN** cleanup fails closed and reports the exact root/cause without targeting another path
- **AND** ordinary locked npm internal links remain valid input only under the internal unlink-only rule, while real owned directories may receive owner `rwx` solely to permit bounded removal

#### Scenario: Cache parent is non-empty or unsafe
- **WHEN** exact `.cache` still has any entry after leaf cleanup, is linked/non-directory, escapes containment, cannot be inspected or removed within the bound, or remains after the prune
- **THEN** cleanup and candidate acceptance SHALL fail without recursively deleting the parent or its observed entry

#### Scenario: Editor telemetry changes concurrently
- **WHEN** `gopls`, `vscgo`, or another user-owned process changes the global telemetry directory while Query acceptance runs
- **THEN** that global delta is recorded only as diagnostic evidence and is neither attributed to Query nor used to waive its sandbox requirement
- **AND** no user-owned process or counter is terminated, modified, interpreted, or deleted

#### Scenario: A Query Go command lacks process-level isolation
- **WHEN** any Query command can start Go without the exact `sandbox-exec` telemetry-subpath write denial, or the wrapper/profile/inheritance cannot be proved
- **THEN** apply stops with no unsandboxed fallback, rebaseline, or repair

#### Scenario: Tool attempts runtime ownership
- **WHEN** apply imports a verifier/code generator into frontend, backend, or updater runtime code, generates an HTTP client/state layer, or commits generated consumer output
- **THEN** acceptance fails as outside this capability

#### Scenario: Install scripts or unlocked latest versions are used
- **WHEN** verification requires lifecycle scripts, an unpinned `latest`, or a lockfile-changing install not explicitly reviewed
- **THEN** verification fails closed and no commit is authorized

### Requirement: Query Go codegen children SHALL deny network without sandbox nesting

> Historical platform and cleanup evidence: current Query execution is governed by “Current Query verification SHALL retain semantic and deterministic acceptance”. The platform-specific controls and completed one-time freezes below SHALL be interpreted only as archived evidence, never as a requirement to re-execute or claim that historical run. Retained semantic, dependency and ownership invariants continue to apply.

The Query verifier SHALL remain the sole executor of its exact primary
generation, deterministic replay, formatting and compile-smoke Go children.
Every one of those four children SHALL run through the same exact
`/usr/bin/sandbox-exec` profile containing both `(deny network*)` and the
accepted Go telemetry-directory write denial. The verifier SHALL bind the
profile text and SHA-256, fixed clean-environment wrapper, exact argv/cwd/tool
identity and materialized-module pre/post seals.

The Query owner SHALL NOT depend on an outer macOS sandbox around
`--verify-codegen-projections`, because macOS rejects applying the child
sandbox from an already-sandboxed verifier. It SHALL NOT solve the nesting
failure by removing network denial, bypassing the inner wrapper, adding a
second Go executor or changing module/download/generated-output semantics.

Primary and replay generation SHALL use the standard
`tool github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen` directive and
run `go tool oapi-codegen` from the materialized Query module root. The exact
tool module and checksum closure SHALL be tracked in the Query `go.mod`/`go.sum`
locks, remain an exact subset of accepted Backend `go.sum`, and resolve from
the sealed module cache with checksum policy unchanged. The gate SHALL reject
`GOSUMDB=off`, an ad-hoc proxy, an untracked proxy-list file,
`go run <package>@version`, or any generated-output drift.

#### Scenario: The verifier runs without an outer sandbox

- **WHEN** the locked Query flow invokes `--verify-codegen-projections`
  directly with its exact Node executable, argv, cwd, clean environment and
  timeout
- **THEN** all four Go children SHALL execute successfully through the exact
  inner profile containing `(deny network*)`
- **AND** primary/replay SHALL use the locked `go tool oapi-codegen` command
  and all four children's argv, environment, module seals and generated
  outputs SHALL match the accepted evidence

#### Scenario: Network denial is missing or moved to an outer wrapper

- **WHEN** the inner profile omits or changes `(deny network*)`, its
  text/digest differs, any Go child does not use it, or the verifier is wrapped
  in a second macOS sandbox
- **THEN** the Query owner gate SHALL fail
- **AND** no successful codegen or development-acceptance verdict may be
  emitted

#### Scenario: The tool lookup requires public proxy state

- **WHEN** primary/replay uses `go run <package-subdirectory>@version`, changes
  checksum/proxy policy, or requires a module/checksum byte outside the tracked
  Backend-subset lock and sealed cache
- **THEN** the Query owner gate SHALL fail under the inner network-denial
  profile
- **AND** the accepted generated-output seal SHALL remain unchanged

## REMOVED Requirements

### Requirement: Share fragment v1 is self-contained, canonical, and bounded
**Reason**: The user removed query sharing.
**Migration**: No URL compatibility decoder. Same-tab recovery is frontend-owned JSON.

### Requirement: Share replay is one-time and uses ordinary query application
**Reason**: Query links no longer replay.
**Migration**: Ordinary queries and validated local session recovery remain.

## ADDED Requirements

### Requirement: Query contracts SHALL exclude sharing
The active contract bundle SHALL contain no share payload schema, share workspace components or sharing golden cases. Go and TypeScript consumers SHALL be regenerated from the remaining query authority. Ordinary SharedQueryV1, query normalization, operation inputs/views and errors SHALL remain semantically unchanged. Generated manifests SHALL describe current bytes and inventories reproducibly; historical platform acceptance SHALL not be presented as newly executed evidence.

#### Scenario: Regenerated consumers
- **WHEN** the pinned query generators run against the revised authority
- **THEN** they SHALL produce no SharePayload or ShareWorkspace declarations
- **AND** ordinary query and operation types SHALL remain valid consumers of the same authority

### Requirement: Current Query verification SHALL retain semantic and deterministic acceptance

`contracts/goldens/query/verify.mjs` SHALL delegate to the active
`verify-current.mjs`. Current acceptance SHALL validate the remaining closed
Query authority, strict positive and negative cases, normalization, digest,
RFC 8785, pinned Unicode behavior, malformed input rejection, and input
immutability. It SHALL independently validate authority, both metadata-only
projections, and both dereferenced bundles against the same cases, proving
that projections remove only root `$id`/`$schema` metadata and preserve every
remaining public component and reusable response. Query sharing cases and
schemas SHALL not participate in current acceptance.

The verifier SHALL derive its canonical repository root from its own fixed
`contracts/goldens/query/verify-current.mjs` location. It SHALL use the existing
pinned Go 1.26.5, oapi-codegen 2.8.0, Redocly 2.40.0 and
openapi-typescript 7.13.0 tools and the existing frontend generator/check.
It SHALL generate two independently prepared bundles and Go/TypeScript outputs,
require deterministic bytes after the documented LF normalization, check all
14 public Query declarations, compare production consumers, and run the Go
wire consumer tests. Disposable projection/output work SHALL remain below
`backend/.tmp/query-wire/current`, with containment and symlink checks before
creation and cleanup. Existing backend tool-module locks and installed
contract/frontend dependencies SHALL remain the execution inputs; this change
SHALL not upgrade dependencies or change runtime statistical semantics.

The current manifest SHALL record actual runtime/tool versions, closed
Query authority evidence, bundle and output byte lengths/digests,
public/helper declaration inventories, cross-validation counts, and production
consumer evidence. Check mode SHALL reject drift and SHALL not rewrite expected
evidence. Explicit refresh mode MAY update only the admitted generated consumers
and current manifest after successful semantic and determinism checks.

For current Query acceptance only, this requirement SHALL supersede the
historical platform-specific execution, exact machine-path/tool-file seals,
macOS `sandbox-exec`/telemetry profiles, six-leaf-only cache/output placement,
old smoke-module seals, execution transcript encoding, and one-time cleanup or
file-byte freezes in “Contract tooling is locked, development-only, and
removable”, “Apply is workspace-safe and path-exact”, “Development completion
is staged, accepted, committed, and archived without operations”, “Query golden
path evidence SHALL be relocatable and closed”, “Relocation SHALL preserve
exact Query execution authority”, and “Query Go codegen children SHALL deny
network without sandbox nesting”. Those completed host-specific controls are
historical evidence, not current portable-generator preconditions. Their
original verifier and manifest SHALL remain byte-for-byte historical artifacts
under `contracts-remove-query-sharing/evidence/historical-query/` (inside its
active or archived change directory). They SHALL not be executed, edited, or
reported as new evidence by current acceptance. All unrelated ownership,
contract strictness, closed inventory, dependency-pin, input-immutability and
production-safety requirements SHALL remain in force.

#### Scenario: Current portable verification runs
- **WHEN** current check mode runs with the pinned tools against the remaining Query authority
- **THEN** semantic cases, all five validation contexts, deterministic generation, 14 public declarations and production consumer comparisons SHALL pass
- **AND** current evidence SHALL match the manifest without relying on a previous host transcript

#### Scenario: Historical platform proof is unavailable
- **WHEN** current verification runs on a host without the historical macOS sandbox or absolute tool locations
- **THEN** it SHALL use the current bounded verification flow and retained semantic/determinism gates
- **AND** it SHALL not claim that historical network-denial or telemetry-isolation checks ran on that host

#### Scenario: A current semantic or generation invariant fails
- **WHEN** a case changes outcome, input is mutated, projection changes semantics, a Query declaration is missing, or deterministic/committed bytes drift
- **THEN** current acceptance SHALL fail even if historical archived acceptance was successful
