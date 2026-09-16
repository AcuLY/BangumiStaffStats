## Capability Boundary

| Field | Boundary |
|---|---|
| Status | 用户已确认实施；主代理 review 与 strict validate 之后才 apply；不表示已验证或部署 |
| Owner | contracts；主代理集成审查；重叠路径按 tasks 顺序单写者 |
| Writable paths | `contracts/schemas/query/`, `contracts/schemas/{rankings,candidates,person-detail,partners,co-star}/request-v1.schema.json`, `contracts/openapi/openapi.yaml`, `contracts/goldens/query/` (source/goldens only), `contracts/goldens/query-domain/`, `contracts/goldens/catalog/index.json` (user-approved correction of three CRLF-era SHA256 metadata fields only; catalog source configs/fixtures/verifier remain read-only), `contracts/goldens/api/catalog/index.json` (only three CRLF-era SHA256 fields), `contracts/goldens/statistics/index.json` (only stale authority SHA256 fields referencing accepted decision/product/query-handoff bytes); both corpora, verifiers, source authorities and dependencies remain read-only for this user-approved metadata repair, `contracts/goldens/api/` (affected feature cases/verifiers only; the two metadata-repair verifiers stay unchanged), `contracts/artifacts/fixtures/positive/{backend,frontend}/component-statement.json`; generated `backend/internal/httpapi/wire/`, `frontend/src/api/generated/`, `frontend/src/api/` generated wire artifacts only; `backend/build/build.sh` compatibility pin；本 capability delta；根 PRODUCT.md / DESIGN.md 仅主代理同步已批准口径 |
| Read-only protected inputs | 其他 active changes、归档结构与 fixtures、部署目录、nginx、mypc、未声明源码 |
| Deletion complement | 无；生成器仅管理其既有精确输出 |
| Mutable refs | 当前隔离克隆 master 的本地精确提交；不切分支；外部集成由 deploy-unrestricted-person-entry 负责 |
| Consumes | 用户批准设计、现有 PRODUCT / DESIGN、基线 0387cbf391da61df3afa6ae0a357d6a754905fd7 与现有 contract |
| Produces | 本范围实现、测试和可追溯验收证据 |
| Dependencies | contracts → generated consumers → backend / frontend → operations |
| Deliverables | 本文要求及 design.md 验收矩阵 |
| Acceptance | tasks.md 的固定工具链、golden、组件、浏览器及 diff 检查 |
| Non-goals | 跨类型、通用分享、私密收藏、凭据、公式变更、新依赖、归档迁移或重设计 |
| Operations deferred | 本 capability 不写线上；用户授权发布在独立 deployment change 执行 |
| Stop/rollback conditions | scope/HEAD/dirty mismatch、必要审批被拒或实测失败停止；禁止 destructive reset/checkout、clean、broad delete、git add -A |

## MODIFIED Requirements

### Requirement: Personal and global queries are a closed discriminated union

`SharedQueryV1` SHALL be a closed `scope`-discriminated union for `personal` and `global`.

An ordinary shared personal query SHALL require a TrimV1-normalized, case-preserving, non-empty public `uid`, non-empty collection statuses, a subject type, and non-empty ordered PositionKeys. TrimV1 SHALL remove only maximal leading/trailing runs of the Unicode 15.1 `White_Space` property set `U+0009..U+000D`, `U+0020`, `U+0085`, `U+00A0`, `U+1680`, `U+2000..U+200A`, `U+2028`, `U+2029`, `U+202F`, `U+205F`, and `U+3000`; `U+FEFF` SHALL be preserved and runtime-native trim predicates SHALL NOT define the contract. Submitted collection-status and PositionKey arrays MAY contain repetitions so normalization can produce one canonical value; the closed Effective Query SHALL require both arrays unique. It SHALL permit personal-only filters.

An ordinary shared global query SHALL require a subject type and non-empty ordered PositionKeys and SHALL structurally forbid `uid`, `collectionStatuses`, `collectionUpdatedAt`, `personalScore`, and `scoreDifference`, including null or empty forms. Both variants SHALL accept only subject types `book`, `anime`, `music`, `game`, and `real`, SHALL default `includeNSFW` and `mergeSeries` to false, and SHALL allow `mergeSeries=true` only for `anime`.

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

A query SHALL optionally accept `positionScope: "all"` with required empty `positionKeys: []` as the exclusive unrestricted selection. The field SHALL be absent for legacy specific-position semantics; any other value, null, or non-empty keys combined with all SHALL be invalid. Existing explicitly all-position operation requests with empty keys and absent query scope SHALL remain compatible. Each query SHALL still select exactly one subject type.

#### Scenario: Unrestricted query is explicit and exclusive
- **WHEN** personal or global submits `positionScope: "all", positionKeys: []`
- **THEN** it validates without a fake PositionKey or catalog expansion in the wire
- **AND** empty keys without the field remain invalid for ordinary ranking, while all plus a concrete key is invalid

### Requirement: Collection statuses and inactive filters have canonical wire forms

Personal `collectionStatuses` SHALL use only `wish`, `completed`, `in_progress`, `on_hold`, and `dropped`. Normalization SHALL remove duplicates and emit them in that fixed order. Global queries SHALL forbid the field.

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

`QueryDigestProjectionV1` SHALL contain exactly effective `scope`, `subjectType`, ordered unique `positionKeys`, optional `positionScope: "all"` only when unrestricted, personal `collectionStatuses`, explicit `includeNSFW`/`mergeSeries`, and normalized active filters; it SHALL omit personal `uid`. The fixed prefix SHALL be 15 bytes total: the 14 ASCII bytes for `bgmss.query.v1` followed by exactly one NUL octet `0x00`, never the printable characters backslash and zero. Every successful digest golden SHALL record the projection, separator, and complete preimage as lowercase hexadecimal and unpadded base64url so Go, TypeScript, and the contract verifier compare exact bytes without source-language escape ambiguity.

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

#### Scenario: Unrestricted mode has a distinct cache identity
- **WHEN** equivalent unrestricted requests normalize in Go and TypeScript
- **THEN** effective query, canonical projection and digest SHALL match shared goldens with `positionScope: "all"`
- **AND** legacy concrete-position projections/digests SHALL remain byte-identical and distinct from unrestricted mode
