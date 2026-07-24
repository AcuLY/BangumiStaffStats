## Capability Boundary

| Field | Declaration |
|---|---|
| Status | investigated: complete; specified: draft pending strict validation and main-agent approval; implemented: no; verified: no; committed: no; pushed: no; released: no; deployed: no |
| Owner | Contracts owner / capability `contracts-query-wire`; spec subagent plans, implementation/finalization subagents apply/test/commit/archive, main agent only reviews/amends OpenSpec and performs read-only acceptance |
| Writable paths | Planning: `openspec/changes/define-shared-query-wire/**`. Apply: `contracts/openapi/**`, `contracts/schemas/query/**`, `contracts/goldens/query/**` |
| Read-only protected inputs | `PRODUCT.md`; `DESIGN.md`; `openspec/config.yaml`; `openspec/specs/contracts-rewrite-baseline/spec.md`; `tmp-formal-development/formal-development-master-plan.md`; `tmp-formal-development/data-logic-implementation-guide.md`; `tmp-formal-development/backend-development-implementation-guide.md`; `tmp-formal-development/decisions/prototype-data-logic-audit.md`; `.impeccable/**`; oracle `644b7748674e553f863d0ffd61d029f86fdc0717`, especially `frontend/src/workbench/types.ts`, `frontend/src/workbench/components/QueryWorkspace.vue`, `frontend/src/workbench/composables/useWorkbench.ts`, `frontend/public/workbench-data/co-star-snapshot.json`, and `frontend/public/workbench-data/position-data.json` |
| Deletion complement | Empty; no existing tracked path may be deleted, moved, or rewritten outside the apply roots, and no pre-existing path inside those roots may be removed without an approved amendment |
| Mutable refs | Before apply, one delegated checkpoint subagent may advance `refs/heads/codex/formal-rewrite` once from exact parent `e5d67d7d74614b7a95da4a7887caa8e1f25bc307` using subject `docs(openspec): approve wave 1 shared contracts` and only the two approved Wave 1A change directories. During apply, only this change's checkbox markers may change and every Git ref/index remains immutable. After both candidates are accepted, one finalization subagent alone may advance the branch with the exact combined phase commit, without amend/rebase/tag/push |
| Consumes | Accepted `establish-formal-rewrite-baseline`; protected authorities/oracle; read-only locked npm and Go module downloads used only for contract verification |
| Produces | Authoritative OpenAPI 3.1 components, draft 2020-12 query/digest-projection/error/share schemas, language-neutral positive/negative/normalization/queryDigest vectors, pinned Unicode 15.1 age/NFKC/folding evidence, oracle limit evidence, and Go/TS generation-feasibility evidence |
| Dependencies | `establish-formal-rewrite-baseline` |
| Deliverables | Personal/global query union, PositionKey, tag/range/default normalization, UID-free digest projection and cycle-free canonical queryDigest, exact operation input/view matrix, closed share topology, error envelope, version/failure rules, locked contract tooling and cross-language generation inputs |
| Acceptance | Exact paired-checkpoint/index/path gates; strict OpenSpec; strict JSON Schema compilation; OpenAPI lint; all vectors and idempotence/digest/share-byte checks; Go/TS model generation without schema error; all cache/temp/generated paths confined to and cleaned from the owned golden root |
| Non-goals | Endpoint paths/results/handlers, store/cache lookup or cache-key composition/statistics, collection access, catalog implementation, Archive wire, UI/runtime adapters, server-side share service, runtime consumer tests |
| Operations deferred | No nginx, systemd, production Compose/timers, deployment/release, secrets, host changes, production activation, registry push, monitoring rollout, migration, or legacy removal |
| Stop/rollback conditions | Stop on missing approval, branch/HEAD/dependency/protected-input/dirty-state mismatch, write outside owned paths, unlocked tool, failed lint/vector/codegen, or P0/P1 finding. Preserve evidence and use explicit path-scoped correction only; never reset-hard, checkout rollback, git clean, broad recursive deletion, or history rewrite |

The authoritative contract producer is the Contracts owner. Future Go backend and TypeScript frontend foundations are independent consumers of `contracts/openapi/openapi.yaml`, `contracts/schemas/query/**`, and the same `contracts/goldens/query/**`; neither consumer becomes a second contract or statistical authority. This capability SHALL NOT create a nested `openspec/` root or nested generated OpenSpec skill set.

Wave 1A apply SHALL share one clean, approved planning checkpoint with `define-archive-manifest-contract`. The sibling envelope is exactly `contracts/schemas/archive/**`, `contracts/goldens/archive/**`, and checkbox markers in `openspec/changes/define-archive-manifest-contract/tasks.md`. This change's agent MAY observe concurrent sibling mutations only there, SHALL snapshot and never write those paths, SHALL keep the Git index empty, SHALL use path-scoped checks, and SHALL stop as an unstaged candidate. Only after both candidates pass main-agent acceptance MAY one finalization subagent stage the exact combined outputs, archive both active changes, and create one combined Wave 1A phase commit.

## ADDED Requirements

### Requirement: Versioned single-authority contract bundle

The Contracts owner SHALL publish the v1 shared-query authority as JSON Schema draft 2020-12 files under `contracts/schemas/query/**`, referenced by stable named components in `contracts/openapi/openapi.yaml` using OpenAPI 3.1 and the 2020-12 dialect. Stable components SHALL include `SharedQueryV1`, `EffectiveQueryV1`, and `QueryDigestProjectionV1` in addition to the named input/view/error/share components. Every schema object SHALL reject undeclared properties, every `$ref` SHALL resolve within the approved contract roots, and the initial OpenAPI document SHALL define no business endpoint path or result DTO.

API query version selection SHALL be the `/api/v1` family plus versioned schema IDs/component names; a query-body `schemaVersion` or other undeclared version field SHALL be rejected. Share version selection SHALL use its explicit outer `v1` marker.

#### Scenario: Both generators consume one authority
- **WHEN** `openapi-typescript@7.13.0` and `oapi-codegen/v2@v2.8.0` read `contracts/openapi/openapi.yaml`
- **THEN** both model-only generations complete without unresolved references or schema-level errors from the same referenced JSON Schemas
- **AND** no generated Go/TypeScript consumer file is committed by this change

#### Scenario: An undeclared body version is submitted
- **WHEN** a v1 query contains `schemaVersion`, even when its value is `1`
- **THEN** v1 validation fails with the stable unknown-field classification
- **AND** the field is not ignored or used to select another schema

#### Scenario: A nested control plane is proposed
- **WHEN** apply output contains an `openspec/` root or generated OpenSpec skill set below `contracts/`, `backend/`, `frontend/`, `updater/`, `apps/`, or `packages/`
- **THEN** acceptance fails and no implementation commit is authorized

### Requirement: Personal and global queries are a closed discriminated union

`SharedQueryV1` SHALL be a closed `scope`-discriminated union for `personal` and `global`.

A personal query SHALL require a TrimV1-normalized, case-preserving, non-empty public `uid`, non-empty collection statuses, a subject type, and non-empty ordered PositionKeys. TrimV1 SHALL remove only maximal leading/trailing runs of the Unicode 15.1 `White_Space` property set `U+0009..U+000D`, `U+0020`, `U+0085`, `U+00A0`, `U+1680`, `U+2000..U+200A`, `U+2028`, `U+2029`, `U+202F`, `U+205F`, and `U+3000`; `U+FEFF` SHALL be preserved and runtime-native trim predicates SHALL NOT define the contract. Submitted collection-status and PositionKey arrays MAY contain repetitions so normalization can produce one canonical value; the closed Effective Query SHALL require both arrays unique. It SHALL permit personal-only filters.

A global query SHALL require a subject type and non-empty ordered PositionKeys and SHALL structurally forbid `uid`, `collectionStatuses`, `collectionUpdatedAt`, `personalScore`, and `scoreDifference`, including null or empty forms. Both variants SHALL accept only subject types `book`, `anime`, `music`, `game`, and `real`, SHALL default `includeNSFW` and `mergeSeries` to false, and SHALL allow `mergeSeries=true` only for `anime`.

UID SHALL reject control/NUL characters and exceed neither 256 Unicode code points nor 256 UTF-8 bytes after trimming. This contract SHALL NOT impose a guessed ASCII username grammar or lowercase conversion.

#### Scenario: Minimal personal query is accepted
- **WHEN** a personal query contains a valid UID, one collection status, one matching selectable PositionKey, and a supported subject type
- **THEN** it validates and normalizes to an effective personal query with explicit false boolean defaults

#### Scenario: Minimal global query is accepted
- **WHEN** a global query contains a supported subject type and one matching selectable PositionKey with no personal field
- **THEN** it validates and normalizes to an effective global query with explicit false boolean defaults

#### Scenario: Global carries a personal field
- **WHEN** a global query includes `uid`, `collectionStatuses`, `collectionUpdatedAt`, `personalScore`, or `scoreDifference` with any value including null, empty string, empty array, or empty object
- **THEN** validation fails with a field error
- **AND** the field is neither hidden nor silently dropped

#### Scenario: Personal UID is unsafe
- **WHEN** the TrimV1-normalized personal UID is empty, contains a control/NUL character, or exceeds either UID limit
- **THEN** validation fails before any collection access is possible

#### Scenario: Series merge is requested for a non-anime type
- **WHEN** `mergeSeries=true` and `subjectType` is not `anime`
- **THEN** semantic validation fails with a subject-type field error

### Requirement: Collection statuses and inactive filters have canonical wire forms

Personal `collectionStatuses` SHALL use only `completed`, `in_progress`, `on_hold`, and `dropped`. Normalization SHALL remove duplicates and emit them in that fixed order. Global queries SHALL forbid the field.

The wire SHALL NOT contain prototype `{enabled,value}` wrappers. An inactive filter SHALL be omitted. A present range SHALL contain at least one of `min` or `max`; an empty range SHALL be invalid rather than equivalent to inactive.

#### Scenario: Collection statuses normalize stably
- **WHEN** a personal query submits repeated collection statuses in arbitrary order
- **THEN** normalization emits each selected status once in the fixed canonical order
- **AND** a second normalization produces an identical JSON value

#### Scenario: Prototype enabled wrapper is submitted
- **WHEN** a filter or tag uses an `enabled` property or two-string `value` tuple from the oracle UI state
- **THEN** strict validation rejects the undeclared representation

#### Scenario: Empty range is submitted
- **WHEN** a range object contains neither `min` nor `max`
- **THEN** validation fails rather than silently removing or enabling it

### Requirement: PositionKey has stable opaque syntax and catalog-context semantics

`PositionKeyV1` SHALL accept only:

- `staff:{book|anime|music|game|real}:{positive-decimal-position-id}`;
- `cast:{anime|game}:{main|all}`;
- `staffset:{book|anime|music|game|real}:{lower-kebab-slug}`.

Consumers SHALL treat the full key as opaque and SHALL NOT infer capability from a localized label, naked integer, legacy 168-item value, or runtime prefix parsing. Every normalized query PositionKey SHALL be selectable in the supplied catalog context and match the query subject type. Submitted arrays MAY repeat a key; normalization SHALL retain its first occurrence and remove later occurrences without moving any other key. The resulting ordered array SHALL remain non-empty and ordered because its first entry is the default co-star candidate group.

No arbitrary `maxItems` SHALL shrink the dynamic exact-position catalog beyond the 64 KiB request limit and general resource validation. `cast:{type}:main` and `cast:{type}:all` for the same type SHALL be mutually exclusive.

#### Scenario: Every PositionKey family is accepted
- **WHEN** a syntactically valid exact staff, supported cast, or dormant staff-set key is present and selectable in a matching golden catalog context
- **THEN** validation preserves the exact opaque string

#### Scenario: Position order is significant
- **WHEN** two valid distinct PositionKeys are submitted in an allowed order
- **THEN** normalization preserves that order exactly
- **AND** the first key remains available as the default candidate group

#### Scenario: Repeated key is submitted
- **WHEN** the same PositionKey occurs twice
- **THEN** normalization retains the first occurrence, removes later occurrences, and preserves all remaining relative order
- **AND** repeated normalization produces the same ordered array

#### Scenario: Key and subject type disagree
- **WHEN** a key's embedded type or catalog type differs from `query.subjectType`
- **THEN** validation fails with `POSITION_SUBJECT_TYPE_MISMATCH`

#### Scenario: Key is unknown or non-selectable
- **WHEN** syntax is valid but the supplied catalog context does not contain the key or marks it non-selectable
- **THEN** validation fails with `POSITION_NOT_FOUND` or `POSITION_NOT_SELECTABLE` respectively

#### Scenario: Cast main and all conflict
- **WHEN** the same query contains both `cast:anime:main` and `cast:anime:all`, or both corresponding game keys
- **THEN** validation fails with `POSITION_SELECTION_CONFLICT`

### Requirement: Range values are finite, closed, and type-correct

`subjectDate` and personal `collectionUpdatedAt` SHALL use real `YYYY-MM` month values and closed lexical bounds. `personalScore` and `globalScore` SHALL use finite JSON numeric bounds in `[0,10]`; personal `scoreDifference` SHALL use finite bounds in `[-10,10]`; `ratingCount` SHALL use integer bounds from `0` through the JSON interoperable maximum `9007199254740991`. Every shared JSON integer SHALL be within `[-9007199254740991,9007199254740991]`; IDs and pages SHALL be positive and at most `9007199254740991`. Whenever both ends exist, `min` SHALL be less than or equal to `max`.

Enabling a score-related filter SHALL not encode missing ratings as zero; the later Go result-set authority SHALL exclude objects lacking the required valid score. This capability SHALL validate only the query representation and SHALL NOT calculate the result set.

#### Scenario: Boundary ranges are accepted
- **WHEN** ranges use exact allowed minima/maxima, a valid month, or `ratingCount=0`
- **THEN** validation accepts them without changing their numeric meaning

#### Scenario: Range is inverted or malformed
- **WHEN** `min>max`, a month is impossible or has trailing text, a score is outside its bound, rating count is fractional/negative, or a number is non-finite
- **THEN** validation fails with a stable field error before any domain query

#### Scenario: Missing rating is represented as a wire number
- **WHEN** a caller attempts to use null, an empty string, or a sentinel non-number as a score bound
- **THEN** validation fails rather than treating it as zero or “unrated”

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
- **THEN** validation fails before NFKC, RFC 8785, digest, or share encoding

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

`uid`, `dataVersion`, operation, operation input, view, `refreshCollection`, share path/workspace, search, sort, order, page, pageSize, section, query revision, input digest, collection digest, result, rank, and statistic SHALL NOT enter the digest projection, canonical bytes, or queryDigest preimage. The path/operation determines mode. The digest is a shared contract output but SHALL NOT by itself implement a runtime cache key or lookup; a later backend cache capability composes it with separately owned dimensions.

#### Scenario: Two semantically equivalent submissions normalize
- **WHEN** two valid inputs differ only in default omission, repeated PositionKeys after the same first occurrence, collection-status order/duplicates, or tag token/group order/duplicates
- **THEN** they emit the same effective-query JSON value
- **AND** they produce the same canonical preimage and queryDigest

#### Scenario: Normalized output is normalized again
- **WHEN** every expected effective query is fed back through the same contract normalizer
- **THEN** the second output is byte-equivalent under RFC 8785 canonicalization
- **AND** the exact preimage and queryDigest remain unchanged

#### Scenario: Digest exclusion field changes
- **WHEN** only personal UID, dataVersion, operation, input, view, refreshCollection, share state, search, sort, order, page, pageSize, section, query revision, input digest, or collection digest changes outside the digest projection
- **THEN** the queryDigest remains unchanged
- **AND** a later cache key may still differ when its owning capability composes those dimensions

#### Scenario: Canonicalization adversarial vector runs
- **WHEN** the verifier processes the official RFC 8785 number, escaped-string, Unicode-key-order, negative-zero, and precision edge vectors plus project Effective Query vectors
- **THEN** `canonicalize@3.0.0` emits the declared exact UTF-8 bytes
- **AND** any non-finite or non-JSON numeric input fails before canonicalization

#### Scenario: Mode or digest field is submitted
- **WHEN** `mode`, `operation`, `queryDigest`, `inputDigest`, `dataVersion`, `queryRevision`, or `refreshCollection` appears inside the shared query
- **THEN** strict validation rejects it as the wrong layer or an unknown field

### Requirement: Search, sort, order, and pagination are strict view values

The contract SHALL define closed v1 primitives: search defaults to `""` and is bounded to 256 Unicode code points/UTF-8 bytes; order is `asc|desc` and defaults `desc`; page is a positive JSON-safe integer and defaults `1`; pageSize is exactly `5|10|20` and defaults `10`. Submitted views MAY omit defaulted fields, but normalized views and share payloads SHALL materialize them.

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

Sort, search, order, page, pageSize, and section SHALL be view state, not shared-query filters and SHALL NOT enter the queryDigest projection. Operation-input arrays SHALL already be normalized and reject duplicates, unlike submitted query arrays. These components SHALL validate request/share state but SHALL NOT perform searching, sorting, rank assignment, or pagination. Future endpoint request schemas and the share workspace SHALL reuse the exact named components by `$ref`; neither SHALL introduce loose JSON or a competing input/view schema. Changing a field, optionality, enum, or default SHALL first modify this capability through OpenSpec.

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

#### Scenario: Endpoint or share defines a competing view
- **WHEN** a future endpoint wrapper or the v1 share workspace copies, loosens, or independently redefines an operation input/view instead of referencing the named component
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
- **THEN** semantic validation fails before an endpoint request or share replay

#### Scenario: Endpoint result is proposed in this change
- **WHEN** apply introduces a rankings/candidates/detail/partners/co-star response DTO, handler, store, cache, or statistical expected result
- **THEN** path/content acceptance fails as outside `contracts-query-wire`

### Requirement: Error envelope has stable machine-readable boundaries

`ErrorEnvelopeV1` SHALL contain exactly:

- `error.code`, a stable enum that includes shared validation, position/capability/identity, collection/upstream, readiness/load, and internal classifications required by the backend guide;
- `error.message`, displayable text that consumers MUST NOT parse for logic;
- `error.retryable`, an explicit boolean;
- `error.fieldErrors`, a map from safe JSON-pointer-like known paths to non-empty arrays of stable field-error codes;
- `meta.requestId`, a required opaque non-empty string, and optional `meta.dataVersion`.

The initial shared code set SHALL include at least `INVALID_JSON`, `INVALID_REQUEST`, `FIELD_INVALID`, `POSITION_SELECTION_CONFLICT`, `POSITION_NOT_FOUND`, `POSITION_NOT_SELECTABLE`, `POSITION_SUBJECT_TYPE_MISMATCH`, `CAPABILITY_NOT_AVAILABLE`, `PERSON_NOT_IN_QUERY_RESULT`, `PARTICIPANT_LIMIT_EXCEEDED`, `IDENTITY_LIMIT_EXCEEDED`, `COLLECTION_NOT_PUBLIC`, `USER_NOT_FOUND`, `ENTITY_NOT_FOUND`, `REQUEST_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`, `RATE_LIMITED`, `SERVER_BUSY`, `NOT_READY`, `UPSTREAM_TIMEOUT`, `UPSTREAM_UNAVAILABLE`, `UPSTREAM_PROTOCOL_ERROR`, and `INTERNAL_ERROR`.

#### Scenario: Stable error validates
- **WHEN** an error golden contains a known code, retryability, safe field errors, display message, and request ID
- **THEN** the envelope validates and the expected logic classification depends only on codes/status metadata

#### Scenario: Envelope shape is ambiguous
- **WHEN** the envelope contains `success`, `data`, an unknown code, an empty field-code list, an unsafe field path, a missing request ID, or any unknown property
- **THEN** strict validation fails

#### Scenario: Localized message changes
- **WHEN** only `error.message` wording changes while stable codes and fields remain the same
- **THEN** client logic classification remains unchanged

### Requirement: Share fragment v1 is self-contained, canonical, and bounded

The exact v1 share form SHALL be `/ranking#q=v1.<payload>` or `/co-star#q=v1.<payload>`, where `<payload>` is unpadded base64url of uncompressed RFC 8785 canonical UTF-8 JSON.

The strict payload SHALL contain only a normalized successful Effective Query and one closed workspace:

- ranking is `{kind:"ranking", rankingsView, detail?}`; `rankingsView` references normalized `RankingsViewV1`, and optional `detail` contains exactly `PersonDetailInputV1` plus normalized `PersonDetailViewV1`;
- `/co-star` uses `kind:"co-star"` and a closed `state` union:
  - `empty` contains exactly normalized `candidates {input: CandidatesInputV1, view: CandidatesViewV1}` and represents zero selected people;
  - `partners` contains that candidates object plus normalized `partners {input: PartnersInputV1, view: PartnersViewV1}` and represents exactly one selected person through `partners.input.source`;
  - `analysis` contains that candidates object plus normalized `coStar {input: CoStarInputV1, view: CoStarViewV1}` and represents exactly 2–10 selected people through `coStar.input.participants`.

The share schema SHALL reuse those exact named components by `$ref`, not open JSON or copied alternatives. It SHALL contain no parallel loose people/identity array: the applicable operation input is the selected-state authority, and its ordered people/PositionKeys SHALL agree exactly with the visible selected state. Every identity PositionKey SHALL belong to the Effective Query; people SHALL be unique and co-star identities SHALL not exceed twenty. Payload/workspace/path, co-star state, selected-person count, and applicable operation input SHALL agree, while inapplicable operation objects SHALL be forbidden. The payload SHALL exclude Draft, responses, requestId, queryRevision, dataVersion, query/input digests, refreshCollection, theme, Drawer, scroll, Skeleton, cache outcome, and server session identifiers.

The encoded base64url part SHALL not exceed 16,384 ASCII bytes. The decoder SHALL enforce a 65,536-byte decoded cap before JSON parsing. Padding, non-base64url characters, malformed UTF-8/JSON, unknown properties, unsupported outer version, duplicate identities, person/identity overflow, and path/workspace mismatch SHALL fail before any business request.

#### Scenario: Ranking share round-trips exactly
- **WHEN** a valid ranking golden is RFC 8785-canonicalized, base64url encoded without padding, decoded, and validated
- **THEN** it matches the declared exact fragment and normalized payload byte-for-byte

#### Scenario: Co-star share preserves identities
- **WHEN** a valid co-star golden contains multiple people and ordered identity PositionKeys within the limits
- **THEN** round-trip preserves person and identity order exactly
- **AND** every identity remains a subset of the effective query positions

#### Scenario: Co-star workspace topology follows selected count
- **WHEN** the selected state has zero, one, or 2–10 people
- **THEN** the only valid workspace state is respectively `empty`, `partners`, or `analysis`
- **AND** its applicable operation input is the sole exact representation of those selected identities

#### Scenario: Co-star state and operation input disagree
- **WHEN** a state carries an inapplicable operation object, duplicates selected identities outside the operation input, or its operation input count/order/keys disagree with the declared state
- **THEN** share validation fails before replay

#### Scenario: Share contains excluded state
- **WHEN** a share payload contains Draft, response, request/version/digest/cache, appearance, Drawer/scroll/Skeleton, or server-session state
- **THEN** strict validation rejects the payload as unknown or forbidden

#### Scenario: Share is malformed or unsupported
- **WHEN** prefix/version/encoding/UTF-8/JSON/schema/size/path/identity validation fails
- **THEN** no business request is authorized
- **AND** the failure maps to a stable local share error vector

#### Scenario: Personal share is generated
- **WHEN** the user explicitly shares a successful personal Applied Query
- **THEN** the public UID and personal filters are present as required to replay it
- **AND** the contract identifies the fragment as unencrypted, untrusted user-disclosed data

### Requirement: Share replay is one-time and uses ordinary query application

On first document load the future frontend consumer SHALL attempt to consume at most one share payload. A valid payload SHALL take precedence over `?user=`, invoke the ordinary typed Query Application Service exactly once, and use ordinary operation inputs/views. Success or failure SHALL remove the fragment with history replacement so remount/hashchange cannot replay it.

An invalid share SHALL preserve the safe first-query UI, expose a stable error, issue no business query, and SHALL NOT silently fall back to an automatic UID query. There SHALL be no share API, short-code table, server-side query session, response snapshot, request-ID mapping, or share-specific backend/cache key.

#### Scenario: Valid share and user query parameter coexist
- **WHEN** a document opens with both a valid share fragment and `?user=other`
- **THEN** the share payload is the only automatically applied query
- **AND** replay uses the ordinary normalization/application path

#### Scenario: Invalid share and user query parameter coexist
- **WHEN** share validation fails while `?user=` is present
- **THEN** the fragment is removed, a stable error is shown, and no business query starts
- **AND** `?user=` may only remain as a non-applied Draft according to the later frontend contract

#### Scenario: Document remounts after consumption
- **WHEN** the application remounts or receives a hashchange after fragment removal
- **THEN** the original share is not applied again

### Requirement: Language-neutral goldens cover positive, negative, normalization, digest, and canonical bytes

`contracts/goldens/query/**` SHALL be data-first and consumable without JavaScript-specific value encodings. A manifest SHALL identify each case, schema, catalog/path context, expected accept/reject result, stable error code/field path, normalized output, digest projection, exact RFC 8785 projection JSON, exact queryDigest separator/preimage/digest, and exact share text when applicable.

Positive vectors SHALL cover both scopes, every PositionKey family, repeated-position first-occurrence normalization, all range/tag forms, every operation component/default, JSON-safe integer boundaries, a valid error envelope, ranking share, and all three co-star workspace states. Negative vectors SHALL cover unknown fields at every object layer, scope leakage, malformed/conflicting/catalog-invalid positions, invalid/empty ranges and tags, post-15.1/unassigned scalars, lone high/low surrogates in JSON keys/values, non-finite/non-JSON or unsafe integers via textual fixtures where required, invalid pages/sorts/sections, error-envelope failures, and share version/encoding/size/topology/identity/path failures. Normalization/digest vectors SHALL prove UID exclusion, canonical equivalence, idempotence, excluded-field invariance, exact projection/separator/preimage, and exact lowercase SHA-256 output. Official RFC 8785 and pinned Unicode 15.1 normalization/age/folding vectors SHALL be represented with source/version provenance.

Oracle-derived limit evidence SHALL record commit/path provenance and measured UID/tag byte lengths without copying the bulk personal fixture. The Contracts verifier is a test oracle only; it SHALL NOT become a runtime query/statistical implementation.

#### Scenario: Every manifest case is executed
- **WHEN** `verify.mjs` runs from a locked clean install
- **THEN** every declared positive, negative, normalization, queryDigest, Unicode, RFC 8785, and share case is discovered exactly once
- **AND** missing files, extra undeclared case files, duplicate IDs, or expectation mismatches fail

#### Scenario: Unknown fields are injected at all layers
- **WHEN** the negative matrix adds an unknown field to query, nested filter/range/tag, input/view, error/meta, share payload, workspace, and identity objects
- **THEN** each case fails at the declared boundary

#### Scenario: Future consumers run the same files
- **WHEN** backend and frontend foundation changes add Go and TypeScript consumer tests
- **THEN** they consume the committed JSON vectors directly
- **AND** neither rewrites expected outcomes into language-specific fixtures

### Requirement: Contract tooling is locked, development-only, and removable

The only committed Node tooling files SHALL be `contracts/goldens/query/package.json`, `contracts/goldens/query/package-lock.json`, and `contracts/goldens/query/verify.mjs`. Development dependencies SHALL be exactly justified and locked: `ajv@8.20.0`, `ajv-formats@3.0.1`, `@redocly/cli@2.40.0`, `openapi-typescript@7.13.0`, and `canonicalize@3.0.0`. The package and acceptance gate SHALL enforce `node >=20.19.0 <21.0.0 || >=22.12.0` and `npm >=10`; npm engine mismatches SHALL fail rather than warn. Package lifecycle scripts SHALL be disabled during installation. `oapi-codegen/v2@v2.8.0` SHALL be invoked at an exact version for model-only stdout generation.

These tools SHALL have zero backend/frontend/updater runtime imports and zero application bundle bytes. `canonicalize@3.0.0` SHALL be the Contracts verifier's reviewed RFC 8785 implementation and SHALL pass official adversarial vectors; future Go/TS runtimes SHALL independently reproduce the golden bytes rather than import this Node verifier. OpenAPI lint, strict schema compilation, vector/digest/canonical-byte execution, and generation feasibility SHALL all be mandatory acceptance gates. A future equivalent repository-owned verifier SHALL remove redundant dependencies through a separate reviewed change rather than accumulating a second toolchain.

All installation, Go build/module/workspace cache, generator temporary, and generated-check output SHALL stay within exactly `contracts/goldens/query/node_modules/**`, `contracts/goldens/query/.cache/npm/**`, `contracts/goldens/query/.cache/go-build/**`, `contracts/goldens/query/.cache/go-mod/**`, `contracts/goldens/query/.cache/go-path/**`, or `contracts/goldens/query/.tmp/**`. Apply SHALL resolve and verify the effective npm cache, `GOCACHE`, `GOMODCACHE`, `GOPATH`, and `TMPDIR` under those roots, SHALL use `GOENV=off`, `GOWORK=off`, and `GOTOOLCHAIN=local`, and SHALL NOT resolve configurable cache/temp output to the system temp directory, home/default package caches, an inherited Go workspace, `frontend/**`, or `backend/**`. Before any ordinary Go process starts, apply SHALL invoke the absolute Go executable's `go env GOTELEMETRY GOTELEMETRYDIR` inside a bootstrap macOS `sandbox-exec` profile combining `(allow default)`, `(deny network*)`, and `(deny file-write*)`, with the same three Go environment controls. This discovery process cannot write telemetry or start an uploader. Apply SHALL stop if the returned non-settable mode is upload-enabled or unknown, then canonicalize and byte-seal the returned directory. With `local` mode, every later command capable of starting Go SHALL run through a reviewed profile denying `file-write*` beneath that directory; with `off` mode, no later telemetry wrapper is required. Apply SHALL verify the seal after all Go work without interpreting/deleting counters, changing global mode, or authorizing upload. Existing developer caches outside the repository need not be absent, but neither discovery/later telemetry nor configurable apply state may drift there. Before candidate handoff, `verify.mjs --cleanup-generated` SHALL canonicalize and validate those exact bounded non-symlink roots, remove only them, and prove all are physically/index absent. None may be committed or tolerated as ignored residue.

#### Scenario: Locked tooling verifies the bundle
- **WHEN** a clean locked install runs schema compilation, OpenAPI lint, Unicode/RFC 8785/normalization/queryDigest/share vectors, TS generation, and Go model-only generation with all cache paths redirected into the owned root
- **THEN** every command exits zero with non-empty deterministic generation output
- **AND** dependency versions and integrity match the lock/evidence record

#### Scenario: Generated tooling residue remains
- **WHEN** `node_modules`, `.cache/npm`, `.cache/go-build`, `.cache/go-mod`, `.cache/go-path`, `.tmp`, generated Go/TS, or any tool output remains in the physical tree/index at candidate handoff or appears outside the owned golden root
- **THEN** acceptance fails and no staging is authorized

#### Scenario: Tool attempts runtime ownership
- **WHEN** apply imports a verifier/code generator into frontend, backend, or updater runtime code, generates an HTTP client/state layer, or commits generated consumer output
- **THEN** acceptance fails as outside this capability

#### Scenario: Install scripts or unlocked latest versions are used
- **WHEN** verification requires lifecycle scripts, an unpinned `latest`, or a lockfile-changing install not explicitly reviewed
- **THEN** verification fails closed and no commit is authorized

### Requirement: Apply is workspace-safe and path-exact

Before paired apply, the main agent SHALL approve the exact bytes for both changes, then one delegated checkpoint subagent alone SHALL stage only those two active change directories, run strict/cached/path checks, and create one clean planning checkpoint on branch `codex/formal-rewrite`. The main agent SHALL verify read-only that its exact HEAD contains only the approved planning delta, ordinary ancestry includes the accepted Gate 0 archive commit, `establish-formal-rewrite-baseline` is complete, and the worktree/index are clean. The main agent SHALL NOT stage or create the checkpoint commit.

This implementation subagent SHALL verify the exact checkpoint/approvals, snapshot the sibling's HEAD baseline and exact declared envelope, and SHALL never write, stage, format, clean, restore, or otherwise mutate the sibling paths. Concurrent sibling mutations MAY appear only under `contracts/schemas/archive/**`, `contracts/goldens/archive/**`, and checkbox markers in `openspec/changes/define-archive-manifest-contract/tasks.md`. This agent MAY write only its own three apply roots plus checkbox markers in its own tasks. All Git status/diff and tests SHALL be own-path scoped while also rejecting any path outside the exact combined envelope.

Both implementation agents SHALL keep the index empty and SHALL stop as unstaged candidates. Neither MAY commit while either apply agent is active. The sibling content need not remain byte-identical while its owner is actively applying, but this agent's before/after audit SHALL prove it issued no write/stage/cleanup command targeting those paths.

#### Scenario: Approved preflight matches
- **WHEN** branch, common checkpoint HEAD, both approvals, dependency, protected-input hashes, clean initial worktree, empty index, and disjoint declared envelopes all match
- **THEN** paired apply may begin and this agent may change only its three contract roots and own task checkbox markers

#### Scenario: Workspace is stale or unexpectedly dirty
- **WHEN** HEAD/branch/dependency/approval/protected inputs differ, the initial checkpoint is dirty, the index is non-empty, an unapproved path exists, or the two declared envelopes overlap
- **THEN** apply stops before further mutation and reports the exact mismatch
- **AND** it does not reset, clean, stash, overwrite, stage, or commit another owner's work

#### Scenario: Sibling changes within its envelope
- **WHEN** concurrent differences appear only in the sibling's exact task/apply paths
- **THEN** this agent records them as foreign, excludes them from own diff/test conclusions, and continues path-scoped work
- **AND** it never modifies, stages, restores, formats, cleans, or commits those paths

#### Scenario: Either apply agent stages or commits
- **WHEN** the index becomes non-empty or HEAD advances before both unstaged candidates have passed main-agent acceptance
- **THEN** both apply flows stop and report the coordination violation

#### Scenario: Apply writes outside the boundary
- **WHEN** status/diff/physical-path inspection finds a created, modified, deleted, moved, ignored, or staged artifact outside the exact combined envelope, or this agent's command log targets the sibling envelope
- **THEN** acceptance fails and finalization is blocked

### Requirement: Development completion is staged, accepted, committed, and archived without operations

Implementation SHALL be performed by a subagent in separately reviewable schema/OpenAPI and golden/tooling phases and SHALL finish with its own task checkboxes marked and all own product/task output unstaged. The paired archive-contract subagent SHALL independently do the same. The main agent SHALL perform separate read-only acceptance after each candidate's exact tests pass.

Only after both acceptances MAY one finalization subagent run with both apply agents quiescent. It SHALL stage the exact combined query/archive contract and checked-task paths, archive/sync both active changes, stage only the exact two archived-change trees and synchronized root specs generated by that lifecycle, rerun combined strict/path/tooling checks, and stop for final main-agent read-only acceptance of the staged archive candidate. Only that acceptance SHALL authorize one local commit with exact subject `feat(contracts): establish wave 1 shared contracts`. It SHALL not create separate implementation/archive commits for either change and SHALL not stage any other path.

Reports SHALL distinguish investigated, specified, implemented, verified, committed, pushed, released, and deployed. This change SHALL NOT push, open a pull request, tag, release, deploy, mutate a host/service/production state, or claim backend/frontend runtime consumer verification.

#### Scenario: Implementation passes but is not accepted
- **WHEN** apply tests pass but main-agent read-only acceptance is not recorded
- **THEN** status may be implemented/locally verified but SHALL remain unstaged, uncommitted, and unarchived

#### Scenario: Only this candidate is accepted
- **WHEN** query-wire acceptance passes but archive-manifest acceptance is missing or has a P0/P1 finding
- **THEN** no path is staged, neither change is archived, and no phase commit is created

#### Scenario: Both candidates are accepted
- **WHEN** both exact path diffs, task states, protected/sibling evidence, tests, and no-P0/P1 reviews pass
- **THEN** one finalization subagent may stage/archive/validate the exact combined output and stop for final main-agent staged-candidate acceptance
- **AND** only that acceptance authorizes the exact-subject Wave 1A phase commit
- **AND** all other agents remain quiescent throughout that index/commit window

#### Scenario: Operations action is proposed
- **WHEN** a task attempts push, PR, tag, release, deployment, production configuration, timer, secret, host mutation, activation, monitoring rollout, or migration
- **THEN** the task is rejected as operations deferred pending a separate user-approved change
