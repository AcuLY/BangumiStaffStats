> Supersession (2026-09-08): `contracts-remove-query-sharing` retires the query-sharing feature and overrides the sharing-specific requirements, preservation clauses, and acceptance assumptions below. URL fragments are cleared without parsing or replay. Header now has an always available same-tab “回到旧版” link to `https://search.bgmss.fun/old/` immediately left of theme. Exact accepted workspace recovery remains frontend-local through validated v2 JSON session storage; v1 fragment-based storage is discarded. Completed evidence below remains historical, and unrelated requirements are unchanged.

## Capability Boundary

- **Status/Owner:** Modified; Contracts owns shared query, digest goldens, and share schema.
- **Writable paths:** Shared query accepted spec plus affected query schemas, manifest, goldens, and verifiers.
- **Read-only protected inputs:** Effective-query fields, digest algorithm/domain, share topology/limits, and archived changes.
- **Deletion complement:** Preserve normalization, digest bytes, privacy exclusions, sharing behavior, and strict layer separation.
- **Mutable refs:** Local topic branch only.
- **Consumes/Produces:** Consumes catalog/query components; produces authoritative query goldens for Go and TypeScript.
- **Dependencies/Deliverables:** Locked canonicalizer and existing generators; remove only the deleted request-layer name from vocabulary/vectors.
- **Acceptance:** Query golden/verifier, generated wire drift checks, and all consumers.
- **Non-goals/Operations deferred:** No digest or share format version change; no remote/live mutation.
- **Stop/rollback conditions:** Stop if canonical bytes change outside removed vectors; roll back the isolated branch.

## MODIFIED Requirements

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

`uid`, `dataVersion`, operation, operation input, view, share path/workspace,
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
- **WHEN** only personal UID, dataVersion, operation, input, view, share state, search, sort, order, page, pageSize, section, query revision, input digest, or collection digest changes outside the digest projection
- **THEN** the queryDigest remains unchanged
- **AND** a later cache key may still differ when its owning capability composes those dimensions

#### Scenario: Canonicalization adversarial vector runs
- **WHEN** the verifier processes the official RFC 8785 number, escaped-string, Unicode-key-order, negative-zero, and precision edge vectors plus project Effective Query vectors
- **THEN** `canonicalize@3.0.0` emits the declared exact UTF-8 bytes
- **AND** any non-finite or non-JSON numeric input fails before canonicalization

#### Scenario: Mode or digest field is submitted
- **WHEN** `mode`, `operation`, `queryDigest`, `inputDigest`, `dataVersion`, or `queryRevision` appears inside the shared query
- **THEN** strict validation rejects it as the wrong layer or an unknown field

### Requirement: Share fragment v1 is self-contained, canonical, and bounded

The exact v1 share form SHALL be `/ranking#q=v1.<payload>` or `/co-star#q=v1.<payload>`, where `<payload>` is unpadded base64url of uncompressed RFC 8785 canonical UTF-8 JSON.

The strict payload SHALL contain only a normalized successful Effective Query and one closed workspace:

- ranking is `{kind:"ranking", rankingsView, detail?}`; `rankingsView` references normalized `RankingsViewV1`, and optional `detail` contains exactly `PersonDetailInputV1` plus normalized `PersonDetailViewV1`;
- `/co-star` uses `kind:"co-star"` and a closed `state` union:
  - `empty` contains exactly normalized `candidates {input: CandidatesInputV1, view: CandidatesViewV1}` and represents zero selected people;
  - `partners` contains that candidates object plus normalized `partners {input: PartnersInputV1, view: PartnersViewV1}` and represents exactly one selected person through `partners.input.source`;
  - `analysis` contains that candidates object plus normalized `coStar {input: CoStarInputV1, view: CoStarViewV1}` and represents exactly 2–10 selected people through `coStar.input.participants`.

The share schema SHALL reuse those exact named components by `$ref`, not open JSON or copied alternatives. It SHALL contain no parallel loose people/identity array: the applicable operation input is the selected-state authority, and its ordered people/PositionKeys SHALL agree exactly with the visible selected state. Every identity PositionKey SHALL belong to the Effective Query; people SHALL be unique and co-star identities SHALL not exceed twenty. Payload/workspace/path, co-star state, selected-person count, and applicable operation input SHALL agree, while inapplicable operation objects SHALL be forbidden. The payload SHALL exclude Draft, responses, requestId, queryRevision, dataVersion, query/input digests, theme, Drawer, scroll, Skeleton, cache outcome, and server session identifiers.

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
