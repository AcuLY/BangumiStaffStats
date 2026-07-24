## Context

The branch is a clean-room baseline with no Go, Python, or Vue runtime. The first shared contract therefore has to be useful before any consumer exists, while remaining narrow enough that later endpoint changes can extend result DTOs without redefining query semantics.

The prototype oracle stores query state as a UI-shaped `QueryState`: numeric or free-form positions, an `isGlobal` boolean, `{enabled,value}` wrappers, and raw `/` / `+` tag text. Its fixtures are evidence for the product's selectable concepts and realistic data, not a production wire schema. PRODUCT.md and the accepted `DR-DATA-*` decisions intentionally replace several of those representations.

Read-only evidence examined for this design includes:

- oracle `644b7748674e553f863d0ffd61d029f86fdc0717`: `frontend/src/workbench/types.ts`, `QueryWorkspace.vue`, `useWorkbench.ts`, `co-star-snapshot.json`, and `position-data.json`;
- PRODUCT.md query/share/operation contracts and DESIGN.md query-workspace rules;
- the formal master plan Wave 1 contract boundary;
- the data implementation guide and accepted audit decisions;
- the backend development guide strict transport, shared-query, error-envelope, view, and share rules.

The oracle fixture contains a real eight-byte public UID, 7,059 public/meta/personal tag occurrences, and a longest observed tag of 72 UTF-8 bytes. The v1 defensive limits below retain substantial headroom without claiming the fixture is a full production distribution.

### Change boundary

| Field | Declaration |
|---|---|
| Status | investigated: complete; specified: initial checkpoint approved, toolchain correction pending approval; implemented: partial candidate retained; verified: preflight and paused-state seals only; committed: initial planning checkpoint only, correction and product not committed; pushed: no; released: no; deployed: no |
| Owner | Contracts owner / `contracts-query-wire`; spec subagent authors planning artifacts, implementation/finalization subagents apply/test/commit/archive, main agent reviews/amends OpenSpec and performs read-only acceptance |
| Writable paths | Planning only: `openspec/changes/define-shared-query-wire/**`. Apply only: `contracts/openapi/**`, `contracts/schemas/query/**`, `contracts/goldens/query/**` |
| Read-only protected inputs | `PRODUCT.md`; `DESIGN.md`; `openspec/config.yaml`; `openspec/specs/contracts-rewrite-baseline/spec.md`; `tmp-formal-development/formal-development-master-plan.md`; `tmp-formal-development/data-logic-implementation-guide.md`; `tmp-formal-development/backend-development-implementation-guide.md`; `tmp-formal-development/decisions/prototype-data-logic-audit.md`; `.impeccable/**`; oracle commit and the five oracle paths listed above |
| Deletion complement | Empty; no tracked deletion, move, or rewrite is authorized outside the apply roots, and no existing path within them may be removed without an approved OpenSpec amendment |
| Mutable refs | The accepted initial checkpoint is `c7f868e2861e8fea250f033c27538ecf793bacad`. One observed correction checkpoint may advance `refs/heads/codex/formal-rewrite` once from that commit with exact subject `docs(openspec): approve wave 1 archive toolchain correction` and exactly eight OpenSpec artifact paths after both apply owners stop, all product/cache bytes are sealed, and both task checkbox sets are sealed; no product path is staged. Apply resumes only after main-agent acceptance of the replacement checkpoint, then only task checkboxes may change and every Git ref/index remains immutable. After both final candidates are accepted, one finalization subagent alone may advance the branch with the exact combined phase commit; no amend, rebase, tag, push, or other ref mutation |
| Consumes | Accepted `establish-formal-rewrite-baseline`; protected authorities/oracle; read-only npm registry and Go module proxy downloads for locked development tools |
| Produces | OpenAPI 3.1 component document; JSON Schema draft 2020-12 query/error/share schemas; positive/negative/normalization/queryDigest/limit/codegen evidence; locked Node-only contract verifier |
| Dependencies | Exact direct dependency: `establish-formal-rewrite-baseline` |
| Deliverables | Strict v1 personal/global query, PositionKey, range/tag normalization, cycle-free canonical queryDigest, named operation input/views, error envelope, share fragment, versioning/failure behavior, language-neutral vectors, Go/TS generation feasibility |
| Acceptance | Strict OpenSpec; paired-checkpoint/index/path gates; JSON/YAML parse; strict schema compile; OpenAPI lint; all declared vectors; idempotent normalization and stable digest/share bytes; Go/TS generator success; all temp/cache/generated paths confined to and removed from the owned golden root; no generated consumer committed |
| Non-goals | Endpoint paths/results/handlers, runtime adapters, catalog/store/cache lookup/statistics, Archive wire, UI, server-side share persistence, runtime consumer tests |
| Operations deferred | Production proxy/process/container orchestration, timer, deployment/release, secrets, host mutation, production activation, registry push, monitoring rollout, migration |
| Stop/rollback conditions | Stop on branch/HEAD/approval/dependency/protected-input/dirty-state/path mismatch, schema disagreement, unlocked dependency, failed vector/codegen, or P0/P1 finding. Preserve evidence and use only explicit path-scoped corrections; never reset-hard, checkout rollback, git clean, broad recursive deletion, or history rewrite |

### Observed mid-apply recovery protocol

The initial apply reached a sealed, partially implemented state before the sibling Archive owner discovered the locked `quicktype@26.0.0` / `stream-json@3.5.0` engine contradiction. Both apply owners then stopped at `c7f868e2861e8fea250f033c27538ecf793bacad`, with an empty index and no ref mutation. Query had completed only tasks 1.1–1.3. Its current persistent inventory is exactly 23 regular files under the three owned roots; the sorted `shasum -a 256` output has aggregate `9203d122d69629e6fcd4c24774108f7c7e1831ebf1299228fa743c40d6295f44`. Including retained `.cache/npm/**` and `node_modules/**`, the same all-regular-file aggregate is `38dc3dfdf68ed1073d99a50ecb6574a1d87e63de8f050203f99c14a72962f586`; the sorted `path<TAB>readlink-target` stream for all symlinks has aggregate `4aa5af9e55948f608d1ef3d7f06ca5d76775946c2638deef2db7276d264fbfae`. Those bytes are evidence, not correction-checkpoint content.

The correction checkpoint contains exactly these eight paths:

- `openspec/changes/define-shared-query-wire/proposal.md`
- `openspec/changes/define-shared-query-wire/design.md`
- `openspec/changes/define-shared-query-wire/specs/contracts-query-wire/spec.md`
- `openspec/changes/define-shared-query-wire/tasks.md`
- `openspec/changes/define-archive-manifest-contract/proposal.md`
- `openspec/changes/define-archive-manifest-contract/design.md`
- `openspec/changes/define-archive-manifest-contract/specs/contracts-archive-manifest/spec.md`
- `openspec/changes/define-archive-manifest-contract/tasks.md`

A quiescent correction subagent first re-proves the branch, exact parent, empty index, checked-task sets, and both owners' persistent/physical/symlink seals. It stages only those eight paths, proves the cached path set is exact and no `contracts/**` byte is staged, creates the exact-subject correction commit, and stops. The main agent then performs read-only acceptance of the new HEAD, sole parent/delta/subject, empty index, and unchanged product/cache seals. Only after that acceptance may the two original owners resume: each re-snapshots the replacement HEAD and sibling state, keeps the retained candidate, and continues from its first unchecked task. No cleanup, install, generator, verifier, or other product-writing command is permitted between the initial seal and accepted replacement checkpoint.

Dependency direction is:

```text
establish-formal-rewrite-baseline
  -> contracts-query-wire
       -> bootstrap-backend-runtime (generated Go DTO consumer)
       -> bootstrap-frontend-foundation (generated TS DTO consumer)
       -> later endpoint contract changes (extend paths/results, reuse query components)
```

`contracts-query-wire` never imports backend/frontend implementation and never grants those owners write access to `contracts/**`.

Wave 1A uses a paired shared-worktree envelope with `define-archive-manifest-contract`. After the main agent approves the exact OpenSpec bytes, one delegated checkpoint subagent stages only the two approved change directories, validates the cached diff, and creates one clean planning checkpoint whose HEAD contains both directories and whose index/worktree are clean. The main agent verifies that checkpoint read-only. During apply:

- this agent may change only its three apply roots and its own task checkbox markers;
- the sibling may change only `contracts/schemas/archive/**`, `contracts/goldens/archive/**`, and checkbox markers in `openspec/changes/define-archive-manifest-contract/tasks.md`;
- each agent records the sibling baseline/path set and MUST never write, stage, format, clean, restore, or test by mutation within those sibling paths;
- Git status/diff and tests remain path-scoped, the index remains empty, and both agents stop as unstaged candidates;
- no agent commits while the sibling is running.

After both candidates pass main-agent read-only acceptance, one finalization subagent alone stages the exact combined contract/task paths, archives both changes, stages only the exact generated archive/root-spec paths, validates the combined tree, and stops for final main-agent read-only acceptance. Only that acceptance authorizes the exact-subject `feat(contracts): establish wave 1 shared contracts` phase commit.

## Goals / Non-Goals

**Goals:**

- Make one OpenAPI/JSON-Schema contract consumable from Go and TypeScript without shared runtime business code.
- Make illegal scope mixing, unknown fields, invalid ranges, tag empties, conflicting positions, unsafe pages, and invalid share payloads fail closed while canonicalizing repeated positions by first occurrence.
- Preserve the product's ordered positions and view semantics while separating query, operation input, and view state.
- Provide deterministic normalized values, a cycle-free queryDigest algorithm, and exact goldens that later consumers can run unchanged.
- Keep version selection explicit: API query components are v1 by schema/component identity, and share data has an outer `v1` marker.

**Non-Goals:**

- Define any business endpoint response, statistical result, ranking algorithm, runtime cache lookup/key composition, collection fetch, dynamic catalog implementation, or Archive structure.
- Commit generated Go or TypeScript, create a Go module/frontend package, or require runtime consumer tests before those foundations exist.
- Implement UI parsing of `/` / `+`, Query Draft/Applied state, Clipboard behavior, or a share service.
- Add a nested OpenSpec root, nested generated skills, CI, production configuration, release, deployment, or migration.

## Decisions

### 1. JSON Schema is authoritative; OpenAPI is the cross-language assembly surface

`contracts/schemas/query/**` contains conservative draft 2020-12 schemas with absolute versioned `$id` values and `additionalProperties: false` on every object. `contracts/openapi/openapi.yaml` is OpenAPI 3.1, uses the 2020-12 dialect, exposes named v1 components by `$ref`, and initially has an empty `paths` object. Later endpoint changes add paths/result components while reusing these names.

This avoids duplicating the same query definition inline in OpenAPI and JSON Schema. A fully inline OpenAPI-only model was rejected because language-neutral negative and normalization vectors need a standalone schema authority. Generator-hostile features are avoided where a direct discriminated union or duplicated small property set is clearer.

The API body does not repeat `schemaVersion`: `/api/v1`, versioned component names, schema `$id`, and strict unknown-field rejection select v1. A submitted `schemaVersion` field is therefore invalid rather than silently ignored. Share data has a separate explicit outer `v1` because a URL fragment has no API path.

### 2. Scope is a strict structural union

`SharedQueryV1` is `oneOf` two closed object variants:

- personal requires `scope="personal"`, TrimV1-normalized non-empty `uid`, non-empty `collectionStatuses`, subject type, and non-empty ordered `positionKeys`; it permits personal-only filters;
- global requires `scope="global"`, subject type, and non-empty ordered `positionKeys`; it does not declare `uid`, `collectionStatuses`, `collectionUpdatedAt`, `personalScore`, or `scoreDifference`.

Both variants permit `includeNSFW` and `mergeSeries`, defaulting to false, plus common filters. `mergeSeries=true` is valid only for `subjectType="anime"`. Global input containing even a null or empty personal field fails; absence, not hiding, is the boundary.

TrimV1 removes the maximal leading and trailing runs containing only the Unicode 15.1 `White_Space` property code points `U+0009..U+000D`, `U+0020`, `U+0085`, `U+00A0`, `U+1680`, `U+2000..U+200A`, `U+2028`, `U+2029`, `U+202F`, `U+205F`, and `U+3000`. No runtime-native whitespace predicate is authoritative; in particular `U+FEFF` is not trimmed. UID applies TrimV1 while preserving case, cannot be empty or contain control/NUL characters after TrimV1, and is capped at 256 UTF-8 bytes. JSON Schema supplies a 256-code-point guard and the language-neutral semantic verifier supplies the byte guard. This deliberately avoids guessing a Bangumi username grammar.

### 3. Effective-query normalization is deterministic and idempotent

Submitted and effective values are distinct golden fields. Normalization:

1. validates structure and scope before accepting a value;
2. applies TrimV1 to UID without case conversion;
3. materializes `includeNSFW=false` and `mergeSeries=false`;
4. preserves `positionKeys` order while removing repeated keys after their first occurrence, so the first item and default candidate group never move;
5. canonicalizes collection statuses to `completed`, `in_progress`, `on_hold`, `dropped` order and removes duplicates;
6. omits inactive/empty filter members; an explicitly empty range is invalid;
7. normalizes tag tokens, deduplicates/sorts commutative token groups and outer groups, and removes no semantic information;
8. emits the same effective value on repeated normalization.

Ranges are closed. Dates are exact `YYYY-MM` with a real month. Scores permit finite decimal bounds in `[0,10]`; score difference permits `[-10,10]`; rating count permits JSON integers from `0` through `9007199254740991`. Every shared JSON integer, including page and person IDs, is bounded to the interoperable safe-integer interval; positive IDs/pages use `1..9007199254740991`. If a score range is enabled, missing underlying ratings are excluded later by the Go authority; this contract does not calculate a result set.

The cycle-free pipeline is:

```text
submitted query
  -> closed structural validation
  -> catalog/cross-field validation
  -> normalization
  -> closed EffectiveQueryV1 revalidation
  -> closed QueryDigestProjectionV1 (Effective Query without uid)
  -> RFC 8785 canonical UTF-8 projection bytes
  -> queryDigest v1
```

`QueryDigestProjectionV1` contains exactly the effective `scope`, `subjectType`, ordered unique `positionKeys`, canonical `collectionStatuses` where personal, explicit `includeNSFW`/`mergeSeries`, and normalized active filters. It deliberately omits personal `uid`: user identity affects collection acquisition, while the later personal cache key independently includes `collectionDigest`. Neither the projection nor its canonical bytes contain the digest, so there is no self-reference. The digest is:

```text
projection = QueryDigestProjectionV1(EffectiveQueryV1)
preimage = ASCII("bgmss.query.v1") || OCTET(0x00) || UTF8(RFC8785(projection))
queryDigest = "q1:" || lowercase_hex(SHA-256(preimage))
```

The fixed prefix is 15 bytes total: the 14 ASCII bytes for `bgmss.query.v1` followed by exactly one NUL octet `0x00`; it is not the printable characters backslash and zero. The language-neutral normalization goldens record the Effective Query, digest projection, exact canonical projection JSON, and separator/complete preimage as lowercase hexadecimal and unpadded base64url, plus the exact digest. `uid`, `dataVersion`, operation, operation input, view, refreshCollection, share workspace/path, search, sort, order, page, pageSize, section, query revision, and collection digest are excluded. A later backend cache capability composes this digest with those independently owned dimensions; it does not redefine this preimage.

### 4. PositionKey is opaque and catalog-context validation is separate from syntax

The v1 syntax union is:

```text
staff:{book|anime|music|game|real}:{positive decimal position id}
cast:{anime|game}:{main|all}
staffset:{book|anime|music|game|real}:{lower-kebab slug}
```

Consumers treat the entire value as opaque. Syntax validation does not imply that a key exists or is selectable. Each semantic golden includes a minimal language-neutral catalog context so the same vectors can assert known/selectable/subject-type behavior without implementing the catalog.

Position arrays are non-empty and order-preserving. Repeated keys are accepted by the submitted-query schema and normalization keeps the first occurrence only; every remaining key must belong to the query subject type and be selectable in the supplied catalog context. Same-subject-type `cast:*:main` and `cast:*:all` are mutually exclusive and produce `POSITION_SELECTION_CONFLICT`. Dynamic exact positions do not receive an arbitrary array-count limit beyond the 64 KiB transport limit and catalog validation.

### 5. Tags cross the wire as an AST, never UI syntax

The wire contains:

```text
tags.include[] = { anyOf: [token...] }   // outer AND, inner OR
tags.exclude[] = { allOf: [token...] }   // outer OR, inner AND
```

`/`, `+`, and prototype `enabled` wrappers are UI-only and rejected when used as wire structure. A token first applies the exact TrimV1 set defined for UID, is then NFKC-normalized, and is then Unicode Default Case Folded using the committed official Unicode 15.1 mapping before exact matching by the later domain layer. Empty tokens/groups fail. Equivalent tokens/groups are deduplicated; commutative collections are sorted by normalized Unicode scalar sequence for stable output. Cross-language vectors include `U+0085` as removable boundary whitespace, `U+FEFF` as preserved non-whitespace, and mixed boundary runs so JavaScript `String.trim()` and Go `strings.TrimSpace` cannot silently become alternate authorities.

The Contracts owner commits the official Unicode 15.1 bytes for `CaseFolding.txt`, `DerivedAge.txt`, and `NormalizationTest.txt` as `contracts/goldens/query/unicode/CaseFolding-15.1.0.txt`, `DerivedAge-15.1.0.txt`, and `NormalizationTest-15.1.0.txt`. Their required SHA-256 values are respectively `4e55acfdc32825a22e87670e9056a3bf94ad7c5400065778e9e10f8314372bcf`, `04e16379344bdb9973cdb6f6bf0a5dd66f7cd41b014cd9f79d848768ae757256`, and `871238e37e3be0696ec2bd0891119a041b052da1a84485eda05a5438724b223e`; each preserves its Unicode license/source header and exact `https://www.unicode.org/Public/15.1.0/ucd/` source URL.

Tag input must consist only of Unicode scalar values assigned by Unicode 15.1 according to the pinned Derived Age data. This makes platform NFKC forward-stable: every consumer must pass the pinned 15.1 normalization conformance cases and reject later-version/unassigned code points before normalization. Default folding consumes CaseFolding statuses `C` and `F`, excludes Turkic `T`, and uses the full `F` mapping rather than an `S` mapping where both exist. NFKC/fold adversarial vectors include compatibility-width Latin, multi-code-point folds, sigma variants, dotted/dotless I, combining marks, idempotence, non-ASCII tokens, post-15.1 code points, and lone high/low surrogates. Every JSON string key and value is recursively rejected if it contains an unpaired surrogate before RFC 8785 or share canonicalization. Neither JavaScript locale lowercasing, an unversioned runtime Unicode table, nor raw `JSON.stringify` is an acceptable substitute.

Limits are 32 include groups, 32 exclude groups, 16 tokens per group, 256 total normalized tokens, and 256 UTF-8 bytes per normalized token. JSON Schema mirrors count/code-point limits and `verify.mjs` enforces UTF-8 byte/total-token rules. These values cover the oracle's longest observed tag (72 bytes) with more than 3.5× per-token headroom and remain subordinate to the 64 KiB body cap.

### 6. Query, operation input, and view remain separate

The component document defines `SearchTextV1` (default `""`, at most 256 code points/UTF-8 bytes), `SortOrderV1` (`asc|desc`, default `desc`), `PageV1` (`1..9007199254740991`, default `1`), and `PageSizeV1` (`5|10|20`, default `10`). Submitted views may omit defaulted fields; normalization materializes every default before a share payload is canonicalized.

The closed component matrix is normative:

| Component | Exact fields | Defaults and contextual rules |
|---|---|---|
| `RankingsViewV1` | optional `search`, `sort`, `order`, `page`, `pageSize` | `""`, `count`, `desc`, `1`, `10`; sort is `count|average|overall|preference`, with `preference` personal-only |
| `CandidatesInputV1` | required `positionKey` | Must explicitly belong to the Effective Query; never inferred from its first key |
| `CandidatesViewV1` | optional `search`, `sort`, `order`, `page`, `pageSize` | `""`, `count`, `desc`, `1`, `10`; personal sort is `count|average|globalAverage`, global is `count|average` |
| `PersonDetailInputV1` | required `personId` | Positive JSON-safe integer |
| `PersonDetailViewV1` | optional `section`, `search`, `sort`, `order`, `page`, `pageSize` | section defaults `works`; common defaults `""`, `desc`, `1`, `10`; omitted sort becomes `globalScore` for works or `role` for characters. Works allows `globalScore`, personal-only `personalScore|collectionUpdatedAt`, and series-only `seriesSize`; characters allows `role|workCount|name` |
| `PartnersInputV1` | required closed `source {personId, positionKeys}`; optional `candidatePositionKey` | Source ID is positive JSON-safe; source keys are non-empty, ordered, unique, and a subset of the Effective Query; candidate key, when present, is also a query key; omission means all query positions and no `"all"` sentinel |
| `PartnersViewV1` | optional `search`, `sort`, `order`, `page`, `pageSize` | `""`, `count`, `desc`, `1`, `10`; sort is `count|average|overall|preference`, with `preference` personal-only |
| `CoStarInputV1` | required ordered `participants` | Exactly 2–10 unique positive JSON-safe person IDs; each has non-empty ordered unique query PositionKeys; at most 20 total `personId + positionKey` identities |
| `CoStarViewV1` | optional `search`, `sort`, `order`, `page`, `pageSize` | `""`, scope default (`personalScore` personal, `globalScore` global), `desc`, `1`, `10`; global allows `globalScore`, personal adds `personalScore|collectionUpdatedAt`, and series adds `seriesSize` |

Search/sort/page do not enter `SharedQueryV1` or the queryDigest projection. Operation-input arrays are already normalized and therefore reject duplicates, unlike submitted query arrays that deliberately accept repetitions before first-occurrence normalization. The share schema references these exact named components and materializes their defaults; it does not use open JSON. Later endpoint changes own request wrappers/result DTOs and MUST reference the same components rather than create competing input/view schemas. Any required change to an enum, field, optionality, or default first modifies `contracts-query-wire`.

View goldens cover every matrix default, scope/section/series conditional enum, empty search, safe-integer page/ID edges, page-size rejection, unknown sort/section, and fields placed in the wrong layer. This change does not compute ranking, search matches, or pagination results.

### 7. Error envelope is strict and logic depends on codes

`ErrorEnvelopeV1` has exactly `error` and `meta`:

- `error.code` is a stable shared enum covering validation, identity/capability/position, collection/upstream, readiness/load, and internal classes from the backend guide;
- `error.message` is displayable text but MUST NOT be parsed for logic;
- `error.retryable` is explicit;
- `error.fieldErrors` is an object from safe JSON-pointer-like known paths to non-empty arrays of stable field-error codes;
- `meta.requestId` is opaque and required; `meta.dataVersion` is optional.

Unknown fields, unknown codes, empty field-code arrays, unsafe field paths, missing request ID, and success-envelope lookalikes fail. HTTP status mapping remains in OpenAPI reusable response documentation; no endpoint is implemented here.

### 8. Share v1 uses uncompressed canonical JSON and base64url

The exact text form is:

```text
/ranking#q=v1.<base64url-no-padding(RFC8785(payload JSON))>
/co-star#q=v1.<base64url-no-padding(RFC8785(payload JSON))>
```

Uncompressed v1 was chosen over deterministic compression because independent Go/TypeScript implementations can reproduce and debug it without a compression-library/version contract. The trade-off is a stricter practical payload size.

The strict payload contains only `query`, the normalized successful Effective Query, and one closed workspace. Ranking is `{kind:"ranking", rankingsView, detail?}`, where `rankingsView` references the normalized `RankingsViewV1` and optional `detail` contains exactly `PersonDetailInputV1` plus normalized `PersonDetailViewV1`.

The `/co-star` workspace is a closed `kind:"co-star"` union discriminated by `state`:

| State | Exact fields | Selected-person topology |
|---|---|---|
| `empty` | `candidates {input: CandidatesInputV1, view: CandidatesViewV1}` | zero selected people; no partners/co-star object |
| `partners` | the same `candidates` object plus `partners {input: PartnersInputV1, view: PartnersViewV1}` | exactly one selected person, represented only by `partners.input.source` |
| `analysis` | the same `candidates` object plus `coStar {input: CoStarInputV1, view: CoStarViewV1}` | exactly 2–10 selected people, represented only by `coStar.input.participants` |

There is no parallel loose `persons` or `identities` array: the applicable operation input is the selected-state authority. Its people, ordering, and PositionKeys must agree exactly with the visible selected identities; every key must belong to the Effective Query, people are unique, and the co-star total is at most 20 identities. Every view in a share is normalized with all matrix defaults materialized.

The payload excludes Draft, responses, requestId, queryRevision, dataVersion, digests, refreshCollection, theme, Drawer/scroll/Skeleton state, cache outcome, and any inapplicable operation object. Ranking/co-star path, workspace kind, co-star state, selected-person count, and operation input must agree.

The base64url part is at most 16,384 ASCII bytes and decoded JSON is capped at 65,536 bytes before parsing. Wrong prefix/version, padding, non-base64url characters, invalid UTF-8/JSON/schema, duplicate identity, identity/key outside the Applied Query, person/identity limit overflow, and path/workspace mismatch all fail before any business request.

The first document load consumes at most one payload. Success or failure removes the fragment with `replaceState`; success invokes the ordinary query-application path exactly once. A valid share takes precedence over `?user=`. Failure does not auto-query the fallback UID. Personal payloads contain public UID/filter data by explicit user action and are neither encrypted nor trusted.

### 9. Goldens are language-neutral data; the verifier is not a runtime authority

`contracts/goldens/query/**` contains:

- a manifest declaring each case, input/context, expected schema result, expected stable error code/path, and optional normalized output/queryDigest/exact share text;
- positive examples for both scopes, every PositionKey family, all ranges, tag AST, list-view defaults/bounds, error envelope, and both share workspaces;
- negative examples for unknown fields at every layer, wrong scope fields, malformed keys, catalog/type/selectability/conflict, invalid/empty ranges/tags, bad numbers, bad pages/sorts/sections, envelope failures, share version/encoding/size/identity/path failures;
- normalization pairs proving idempotence and canonical output;
- oracle-derived UID/tag-limit evidence with commit/path provenance but no copied bulk fixture;
- generation-feasibility metadata with exact tool versions and output hashes.

The committed verifier validates the contract bundle and goldens and implements only the approved contract normalization/canonicalization/queryDigest test oracle. It does not calculate a result set, statistic, endpoint response, cache lookup/key, or UI state. Go and TypeScript foundations later consume the same JSON files and must independently reproduce declared outcomes.

### 10. Development-only library additions

Only three tooling files are committed under `contracts/goldens/query/`: `package.json`, `package-lock.json`, and `verify.mjs`. The package declares and verification enforces the common execution floor `node >=20.19.0 <21.0.0 || >=22.12.0` and `npm >=10`, matching the locked graph rather than relying on npm's warning-only default engine handling.

| Library/tool | Purpose | Alternatives considered | Owner / path | Cost | Enforceable gate |
|---|---|---|---|---|---|
| `ajv@8.20.0` | Strict draft 2020-12 schema compilation and positive/negative validation | Handwritten shape checks (incomplete); Python `jsonschema` (adds a second package environment before updater exists) | Contracts dev-only; `contracts/goldens/query/package*.json`, used only by `verify.mjs` | Dev install and lockfile; no frontend/backend runtime or bundle bytes | `npm ci --ignore-scripts` and verifier must pass in strict mode; production dependency scan must show absent |
| `ajv-formats@3.0.1` | Standards-based date-time/URI format checks used by shared envelope metadata | Handwritten regexes (weaker and duplicated) | Same Contracts dev-only tooling | Small dev transitive cost; no runtime use | Verifier format cases pass and package remains dev-only |
| `@redocly/cli@2.40.0` | OpenAPI 3.1 structural/reference lint | Parse YAML only (misses OpenAPI semantics); Spectral (requires an additional ruleset/config decision) | Contracts dev-only | Largest Node dev dependency and supply-chain surface; zero product bundle/runtime cost | Locked install with scripts disabled; `redocly lint contracts/openapi/openapi.yaml` has zero errors; remove if equivalent repo-owned lint later replaces it |
| `openapi-typescript@7.13.0` | TypeScript generation feasibility from the shared OpenAPI | Handwritten TS types (drift); full request client generator (violates native-fetch boundary) | Contracts dev-only check; generated stdout only | Dev dependency; no generated client/runtime | Generation exits zero, produces non-empty deterministic stdout, and writes no `frontend/**` file |
| `canonicalize@3.0.0` | Reviewed RFC 8785 JSON Canonicalization Scheme implementation for queryDigest/share exact bytes | Handwritten recursive key sort (incorrect for number/string/Unicode edges); platform `JSON.stringify` (not a cross-language contract) | Contracts dev-only verifier and goldens only | Apache-2.0, ~16 KiB unpacked, no dependencies, no runtime/application bundle | Official RFC 8785 adversarial vectors and project preimage/share vectors pass; future runtime consumers independently reproduce the bytes |
| `oapi-codegen/v2@v2.8.0` | Go model generation feasibility from the same OpenAPI | Handwritten DTO (drift); generating handlers (premature transport ownership) | Read-only Go module proxy input; no committed Go tool file/output | One pinned development download/cache; no runtime dependency yet | Pinned `go run` model-only generation to stdout exits zero and pipes cleanly through `gofmt`; no `backend/**` write |

Package lifecycle scripts are disabled. No component library, HTTP client, state layer, statistical library, or production dependency is added.

All configurable tool state is redirected inside `contracts/goldens/query/**`: `node_modules/**`, `.cache/npm/**`, `.cache/go-build/**`, `.cache/go-mod/**`, `.cache/go-path/**`, and `.tmp/**`. Apply sets and verifies the effective npm cache, `GOCACHE`, `GOMODCACHE`, `GOPATH`, and `TMPDIR` beneath those roots, sets `GOENV=off` and `GOWORK=off`, and uses `GOTOOLCHAIN=local` rather than an implicit toolchain download. Nothing resolves to the system temp directory, home npm cache, default Go caches, an inherited workspace, `frontend/**`, or `backend/**`. Go's `GOTELEMETRY` and `GOTELEMETRYDIR` are non-settable toolchain state, and even `go env` may initialize telemetry before printing them. Therefore the first and only discovery probe starts the absolute Go executable inside a bootstrap macOS `sandbox-exec` profile with `(allow default)`, `(deny network*)`, and `(deny file-write*)`, while also supplying `GOENV=off`, `GOWORK=off`, and `GOTOOLCHAIN=local`. Only that non-mutating/non-uploading probe may reveal the existing mode and directory; apply refuses an upload-enabled or unknown mode. It then canonicalizes and byte-seals the directory. When the mode is `local`, every later command that can start Go runs under a reviewed profile that denies `file-write*` beneath that canonical telemetry directory; when it is `off`, the seal still proves no drift. Apply never changes global telemetry mode, interprets/deletes counters, or authorizes upload. Acceptance therefore proves no discovery or later Go telemetry write escaped the owned roots instead of carving such a write out of the claim. `verify.mjs --cleanup-generated` canonicalizes and checks each exact allowlisted generated directory, refuses symlink/escape targets, and removes only those bounded directories. The candidate gate requires all six generated roots absent from the physical tree and Git index; none may be committed or tolerated as ignored residue.

### 11. Oracle comparison method

Preservation evidence is a small behavior matrix traced to oracle commit/path and recreated as synthetic goldens:

- ordered positions and default candidate group;
- collection states 2/3/4/5;
- all existing range concepts and bounds;
- positive AND/OR and negative OR/AND grouping;
- Draft/Applied distinction as a share exclusion;
- ranking/candidate search/sort/page view concepts.

Intentional-delta vectors independently prove string subject/position identities, strict exact tags, omitted inactive filters, global personal-field rejection, 5/10/20 page sizes, and canonical path/share behavior. New-capability vectors cover error/share/version/codegen behavior. No whole oracle fixture, old implementation directory, old state machine, or old request/statistics code is copied.

## Risks / Trade-offs

- **[Risk] Direct JSON Schema unions generate awkward model names** → Keep stable named OpenAPI component refs, prefer direct closed variants, and fail the change if either generator reports schema-level errors.
- **[Risk] OpenAPI and standalone schema refs drift** → OpenAPI references the standalone schemas; the verifier resolves every ref and compares the expected component map.
- **[Risk] Semantic rules exceed JSON Schema expressiveness** → Keep machine-readable context/outcome goldens for cross-field/catalog/byte-limit rules; both future consumers must run them, rather than claiming schema validation alone is sufficient.
- **[Risk] Unicode normalization differs by runtime** → Commit/digest Unicode 15.1 CaseFolding, Derived Age, and Normalization Test data; reject scalars outside the pinned age boundary; require full pinned NFKC conformance and fold/idempotence vectors. A Unicode upgrade is a contract version change.
- **[Risk] Handwritten JSON canonicalization disagrees on numbers, strings, or Unicode keys** → Bound shared integers to the JSON safe interval, recursively reject unpaired surrogates before canonicalization, lock reviewed `canonicalize@3.0.0`, run official RFC 8785 adversarial vectors, record exact projection/preimage/share bytes, and require independent Go/TS reproduction downstream.
- **[Risk] 16 KiB uncompressed share payload cannot represent every valid 64 KiB request** → Sharing is an explicit bounded subset; oversize payload fails locally without a request. A compressed v2 requires a new reviewed encoding contract.
- **[Risk] Error-code enum grows as endpoints appear** → Later endpoint contracts modify this capability through OpenSpec; arbitrary free-form codes are not accepted as a shortcut.
- **[Risk] Node lint dependencies are relatively heavy** → They remain dev-only and locked, install scripts are disabled, no application bundle imports them, and removal is required when equivalent repository-owned tooling exists.
- **[Risk] Parallel sibling work dirties the shared checkout** → Use one clean two-change planning checkpoint, an empty index, exact disjoint sibling task/apply envelopes, path-scoped checks, no staging/commit during apply, and a single serialized combined finalization after both acceptances.

## Migration Plan

1. After main-agent approval, one delegated checkpoint subagent creates one clean planning checkpoint containing only the approved `define-shared-query-wire` and `define-archive-manifest-contract` directories; the main agent verifies its fixed HEAD and clean index/worktree read-only.
2. Both implementation subagents verify that exact checkpoint, dependency acceptance, protected inputs, empty index, and disjoint sibling envelopes. Each snapshots and never writes the sibling task/apply paths.
3. This Contracts owner creates schemas/OpenAPI, then goldens/evidence/tooling in separate own-path phases while the sibling may work only in its declared archive paths. Neither agent stages or commits.
4. This agent runs strict schema/OpenAPI/vector/idempotence/queryDigest/share/codegen checks with all caches/temp under the owned golden root, cleans those generated roots, marks only its own task checkboxes, and stops as an unstaged candidate. All Git/diff/test evidence is own-path scoped.
5. The main agent performs separate read-only acceptance of both candidates. P0/P1 findings return to the relevant owner/OpenSpec; the main agent does not patch implementation.
6. After both explicit acceptances, one finalization subagent alone stages the exact combined task/product paths, archives both changes, stages only their exact archive/root-spec outputs, revalidates the combined tree, and stops for final main-agent read-only acceptance. After that acceptance it creates the exact-subject `feat(contracts): establish wave 1 shared contracts` commit. No other agent may be running or writing during this index/commit window.
7. Go and TypeScript foundations consume the committed schema/goldens in their own changes. No generated output is migrated by this change.

Rollback before commit is limited to explicit removal/correction of this change's newly created paths after reviewing the exact list. After commit, use a separate reviewed revert change if required; do not rewrite history.

## Open Questions

None. Endpoint result schemas, runtime generator integration, runtime cache composition, and any share-v2 compression are intentionally assigned to named downstream changes rather than left unresolved here.
