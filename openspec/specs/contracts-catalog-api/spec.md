# contracts-catalog-api Specification

## Purpose
TBD - created by archiving change expose-dynamic-catalog. Update Purpose after archive.
## Requirements
### Requirement: The catalog OpenAPI operation SHALL be strict and input-free

`contracts/openapi/openapi.yaml` SHALL define exactly `GET /catalog` under the
existing `/api/v1` server, producing the runtime route
`GET /api/v1/catalog`. It SHALL accept no path, query, header, cookie, or
request-body parameter and SHALL define no client `dataVersion` handshake.
Any query parameter or non-empty body is an invalid request at runtime; a
fragment is client-local and has no server representation. The operation SHALL
declare 200, 400, 405, 500, 503, and 504 responses using the accepted error
envelope where applicable.

A 200 response SHALL be `application/json`, `Cache-Control: no-cache`, and use
one closed success envelope with exact required `data` and `meta` objects.
Every error SHALL be `application/json`, `Cache-Control: no-store`, and use the
accepted stable request-ID envelope. The operation SHALL not add `success`,
pagination, collection freshness, query ID, user identity, or operation input.

#### Scenario: An input-free request succeeds
- **WHEN** `GET /api/v1/catalog` has no query and no body while one valid Store is published
- **THEN** it SHALL return one strict 200 envelope with `no-cache`
- **AND** it SHALL contain no user, query, pagination, collection, or client-version field

#### Scenario: Catalog input is supplied
- **WHEN** the exact catalog route receives a query parameter, non-empty body, client dataVersion, or wrong method
- **THEN** it SHALL return the accepted bounded 400 or 405 error with no catalog data
- **AND** a different or malformed path SHALL retain the accepted 404 behavior without invoking catalog work, and no supplied value SHALL influence Store selection or output

### Requirement: The success wire SHALL expose one canonical catalog projection

The success envelope SHALL require:

- `meta.requestId` as the generated opaque request ID and
  `meta.dataVersion` as the exact published Archive identity, with no other
  meta fields;
- `data.subjectTypes`, ordered exactly
  `book, anime, music, game, real`, each with its stable key and product label;
- `data.positions`, containing one entity per canonical PositionKey;
- `data.groups`, containing display references only;
- `data.selectionRules`, containing exact accepted rule records; and
- `data.filterCapabilities` plus `data.sortCapabilities`, containing the
  strict scope/type/operation capability matrix derived from the accepted
  shared query wire rather than handler guesses.

Every object SHALL reject unknown properties. Every identifier, label,
localized name, array, JSON-safe integer, and collection SHALL use an explicit
bound at least as permissive as the exited catalog producer contract. The
OpenAPI and catalog goldens SHALL lock bound equivalence so this API cannot
reintroduce the legacy 168-item limit or silently narrow a valid producer
catalog.

A position SHALL require `key`, `kind`, `subjectType`, `label`,
`names {cn,en,jp}`, ordered `categories`, `displayOrder`, ordered
`capabilities`, and `status`. `kind` SHALL be exactly
`staff|cast|staffSet`; `status` SHALL be exactly `selectable|hidden`.
`staff` requires only `positionId`; `cast` requires only
`roleScope=main|all`; `staffSet` requires only sorted `memberKeys` with at
least two exact staff members. `exclusiveGroup` SHALL appear only for an
exclusive position. Conditional fields SHALL be mutually exclusive rather
than nullable catch-alls.

A group SHALL require `key`, `kind=bangumi|shortcut|custom|fallback`,
`subjectType`, `label`, `displayOrder`, and ordered unique `positionKeys`.
A selection rule SHALL require `key`, `kind=exactStaff|exactCast|staffSetUnion`,
`positionKey`, and bounded opaque `value`. Filter/sort capability records
SHALL name only fields and enum values already accepted by
`contracts-query-wire`, including their exact personal/global, subject-type,
section, and operation applicability. Consumers SHALL not infer any of these
facts from labels or PositionKey prefixes.

#### Scenario: A dynamic five-type catalog is encoded
- **WHEN** one accepted catalog contains common additions, multi-category positions, fixed shortcuts, cast main/all, and no active staff sets
- **THEN** the wire SHALL encode every entity once and every ordered display reference separately
- **AND** all capability and selection facts SHALL be explicit, bounded, and schema-valid

#### Scenario: A conditional position shape is mixed
- **WHEN** a position omits its kind-specific field, supplies another kind's field, includes an unknown property, or violates a contract bound
- **THEN** strict contract validation SHALL reject the complete response
- **AND** no consumer SHALL coerce or partially accept that entity

### Requirement: Catalog ordering and references SHALL be deterministic

Subject types SHALL use the fixed product order. Positions SHALL sort by that
subject-type order, `displayOrder`, then ASCII PositionKey. Groups SHALL sort
by subject-type order, `displayOrder`, then ASCII group key. Group members
SHALL retain accepted group-member display order with ASCII PositionKey as
the final tie-break. Categories, capabilities, staff-set members, and
selection rules SHALL use the exact deterministic order locked by the catalog
goldens. Repeated display references SHALL not duplicate position entities.

Every group/category/member/rule reference SHALL resolve to one existing
same-type position of the required kind. `main` and `all` cast positions SHALL
share the accepted same-type exclusive identity; main SHALL precede all in
the cast shortcut even where a featured shortcut intentionally uses another
product-approved order. Unknown raw staff credits SHALL never appear.

#### Scenario: One position occurs in several displays
- **WHEN** an exact position belongs to two Bangumi groups, a featured group, and search-visible category metadata
- **THEN** the response SHALL contain one position and each exact ordered display reference
- **AND** a repeated response from identical Store bytes SHALL be byte-stable apart from request ID

#### Scenario: A reference is dangling or cross-type
- **WHEN** a group, category, member, rule, or exclusive identity is unknown, duplicated where uniqueness is required, or crosses subject type
- **THEN** the complete catalog SHALL be invalid
- **AND** the contract SHALL admit no shortened group, fabricated position, or partial response

### Requirement: Dormant and unknown catalog cases SHALL fail safely

The active empty staff-set configuration SHALL produce no `staffSet` position,
custom staff-set group, member, or union rule. The golden corpus SHALL also
contain a synthetic valid staff set proving that the same OpenAPI wire admits
it without adding a kind, field, endpoint branch, or static key enum.

Unknown position/group/rule kinds, unknown capability names, hidden positions
referenced by selectable groups, malformed localized names, duplicate
entities, contradictory `status`/capability facts, unexpected cast keys,
book/music/real cast, and unresolved raw credits projected as positions SHALL
be closed invalid cases. Contract or runtime corruption SHALL map to sanitized
500 `INTERNAL_ERROR`; an absent published Store SHALL map to 503 `NOT_READY`;
a deadline before commit SHALL retain the accepted 504
`UPSTREAM_TIMEOUT`. These failures SHALL carry no partial data or dataVersion.

#### Scenario: Current dormant staff sets are exposed
- **WHEN** the accepted snapshot has the required empty active staff-set configuration
- **THEN** no staff-set entity/reference/rule SHALL appear
- **AND** all exact staff and cast output SHALL remain unchanged

#### Scenario: A future valid staff set is encoded
- **WHEN** a synthetic accepted snapshot adds one valid same-type staff set
- **THEN** the existing wire SHALL encode its position, sorted members, custom-group reference, conservative capabilities, and union rule
- **AND** no OpenAPI or handler enum change SHALL be required

#### Scenario: Store data is unavailable or corrupt
- **WHEN** no Store is published, work exceeds its deadline, or an unknown/contradictory catalog row is read
- **THEN** the exact 503, 504, or 500 envelope SHALL be returned with no catalog data or dataVersion
- **AND** unknown data SHALL never be treated as an empty catalog

### Requirement: Catalog API goldens SHALL be closed and cross-language

`contracts/goldens/api/catalog/**` SHALL contain a strict index that names
every other regular non-symlink file exactly once with path, SHA-256, case ID,
kind, and expected outcome. The owned verifier SHALL fatal-UTF-8 decode,
strictly validate OpenAPI 3.1 and every indexed case, recompute inventory and
semantic expectations, and reject missing, extra, duplicate, symlinked,
non-regular, hash-drifted, or contradictory evidence.

Positive goldens SHALL cover all five subject types, no-credit selectable
positions, multi-parent/category/fallback/featured/cast groups, exact 101–106
staff, main/all exclusivity, filter/sort matrices, empty staff sets, and one
synthetic staff set. Negative goldens SHALL cover every invalid reference,
unknown enum/domain value, conditional-shape error, ordering drift, duplicate,
not-ready/internal/deadline/method/input envelope, unknown property, and
boundary value. Generation evidence SHALL lock the exact OpenAPI tool version,
command, path/component inventory, generated Go byte digest, declaration
inventory, deterministic replay, and compile test.

Only disposable tool/cache/temp/install roots explicitly contained below the
owned golden directory may be created during verification; clean acceptance
SHALL leave them physically and index absent.

#### Scenario: The closed corpus passes
- **WHEN** OpenAPI, every indexed case, generation replay, compile test, and physical inventory agree
- **THEN** Contracts MAY hand exact hashes to the Backend owner
- **AND** no backend code or external state SHALL have been changed

#### Scenario: One undeclared or regenerated byte appears
- **WHEN** a case is unindexed, multiply indexed, hash-drifted, symlinked, semantically inconsistent, or generation differs
- **THEN** Contracts handoff SHALL fail closed
- **AND** tooling SHALL not rewrite expected bytes merely to bless the drift
