## Contract

`POST /api/v1/person-detail` accepts
`{query,input:{personId},view?}` and never accepts `refreshCollection`.
The person must exist and satisfy the complete multi-position ranking query;
an existing person outside that set returns `PERSON_NOT_IN_QUERY_RESULT`.

The default view is works, empty search, page 1, pageSize 10. Works default to
`globalScore/desc` and additionally allow personalScore,
collectionUpdatedAt, and seriesSize where applicable. Characters default to
`role/desc` and allow role, workCount, and name; that section requires cast
capability.

The success core contains the person, complete summary and metrics, bounded
tags, rating buckets/examples/timeline, and personal-only comparison and
preference evidence. Only the selected section's searched, sorted, paginated
items vary. Works use a closed subject/series union and exact staff/cast
contribution union; character appearances always reference raw Subjects.

## Computation and cache

The service normalizes the shared query, verifies `personDetail` capability,
evaluates the complete ranking set, and rejects a person not in that set.
It builds detail evidence from the same immutable fact/statistics sources used
by rankings. Subject contributions preserve requested identity plus exact
member/character provenance; series aggregation happens only after exact
participation is known.

The cache key contains operation, dataVersion, queryDigest, canonical person
input digest, and personal collectionDigest only. Section/search/sort/order/
page/pageSize never enter the core key. Published values and all projections
are ownership-safe.

## Integration

Generation selects only `/person-detail` and its transitive component graph.
The handler reuses result no-store headers, request identity, bounded JSON,
cancellation, readiness, and stable error families. Global execution never
uses collection data; detail never performs an explicit refresh.
