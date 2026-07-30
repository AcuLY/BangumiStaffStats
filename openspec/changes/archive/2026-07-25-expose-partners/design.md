## Computation

The service normalizes the query and validates partners capability for every
selected query position. Source position keys are ordered, unique, belong to
the effective query, and each must actually match the source person. The source
identities are unioned at raw Subject level. Candidate positions are ORed; an
optional candidatePositionKey filters to exactly one query position.

A partnership requires a real common raw Subject. Participation in different
members of one series is not cooperation. Only after source/candidate
intersections are known may mergeSeries aggregate units. Staffset identity is
preserved while exact member provenance remains internal to the authority.

The expensive core key contains operation, dataVersion, queryDigest, canonical
input digest, and personal collectionDigest. Search/sort/order/page/pageSize do
not enter that key; candidatePositionKey does because it changes the complete
partner population and leaders.

## Projection

The response returns source identity/metrics, workUnit, complete partnerCount,
fixed leaders, and a page of PartnerCore rows. Position keys on a partner are
only query identities that contributed a real common work. Leaders are ordered
count, average, overall, then personal-only preference and remain present with
`item:null` when no candidate has usable evidence. Search/page do not alter
summary or leaders. Rank is assigned before search/page.

Global responses omit preference and collection. Missing averages/overall and
missing preference use null; exact preference zero is retained. The operation
never returns common-work items.

## Wire and verification

Generation selects only `/partners` and its transitive component graph, uses
capability-owned metadata, and proves unrelated OpenAPI paths/shared description
changes do not alter its projection. Acceptance covers personal/global,
staff/staffset/cast, source/candidate validation, raw-subject intersection,
series non-cooperation, filter/leader invariance, missing-last total ordering,
pagination, cache ownership, handler limits/cancellation/errors, race, drift,
and full backend checks.
