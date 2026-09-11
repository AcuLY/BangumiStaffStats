## Context

DESIGN.md:416 requires the same translucent current-sort progress for rankings and cooperation rows, with preference centered at zero. PRODUCT.md:52–54 defines complete partner leaders and separates view changes from the candidate-position-filtered population; PRODUCT.md:74 keeps ranking scales stable across search/page. The Backend guide, section 5.1 (lines 395–408), makes Go the statistical authority and forbids reconstruction of complete statistics from the current browser page. Its view rules already describe metricScale as complete-core evidence.

Rankings already emits `MetricScale{Metric, Kind:"linear", Max}`. `backend/internal/ranking/view.go:289–363` scans the complete rows, ignoring absent metrics and comparing exact absolute preference rationals. `partners.Project` already constructs complete `statistics.PersonSortEntry` values before filtering/pagination but exposes only positive-order leaders and the current page. The latter cannot recover a hidden negative absolute maximum. The inspected active changes do not own this missing scale; B2 owns unrelated series representative tags and concurrent generated checks.

## Goals / Non-Goals

Add exactly one selected-metric scale to the partners response; reuse rankings arithmetic and display conversion; preserve leaders, ranks, counts, personal/global separation, immutable cache ownership and all recent UI corrections. Do not add all-metric maps, another request, population logic in Vue, new dependencies, persistent state, Archive changes or unrelated design work.

## Change Boundary

| Field | Boundary |
|---|---|
| Status | Implemented after strict validation and primary review; tasks.md records remaining runtime and component-gate acceptance |
| Owner | Contracts owns schema/goldens/generation; Backend owns the shared maximum scan and projection; primary owns Frontend integration, docs, sequencing and final acceptance |
| Writable paths | During planning only this change; future apply limited to the exact inventory below |
| Read-only protected inputs | Current accepted product/design/data decisions except named doc paragraphs at final sync; Archive, request/error contracts, ranking success schema/goldens, query/statistical formulas, unrelated dirty work and all other files |
| Deletion complement | Only move the existing private ranking scale/absolute helper into the shared statistics implementation after proving equivalent output; no data or capability removal |
| Mutable refs | None; no staging/commit/branch/remote operations |
| Consumes | Complete partner/ranking entries, existing rankings scale definitions and Rational, existing ranking progress formatter/tokens |
| Produces | Required selected scale, single Backend maximum implementation, generated partners consumers, proportional test/render evidence |
| Dependencies | Contracts → Backend/Frontend consumers; B2 generator/gate and primary UI edits must hand off before overlapping generated/script/component writes |
| Deliverables | Reviewed plan, coherent implementation, deterministic generated artifacts and recorded acceptance |
| Acceptance | Tasks.md commands; exact scale/omission/zero/off-page/filter/cancellation/ownership cases; ranking equivalence; Light/Dark desktop/mobile comparison |
| Non-goals | New packages beyond files in existing owners, new network/cache/API endpoints, full UI rewrite, dependency upgrades, source-wide hygiene or changes to unrelated operations |
| Operations deferred | No service/pointer/config/host/public routing writes, deployment, release or production activation; read-only local browser verification is permitted after implementation |
| Stop/rollback conditions | Stop on authority/ownership conflict, generated writes outside inventory or failed acceptance; preserve current dirty hunks, never use destructive Git/cleanup, undo only owned delta |

### Exact future implementation inventory

These paths are a plan, not permission for this proposal task to edit source.

- **Contracts:** `contracts/schemas/partners/success-envelope-v1.schema.json`; `contracts/goldens/api/partners/verify.mjs`; existing `contracts/goldens/api/partners/cases/{global.json,personal.json,many-identities.json}` only. Existing case IDs retain their meaning; add bounded scale scenarios within those files. Request/error corpus and all other API goldens remain read-only.
- **Generated partners outputs — one Contracts-controlled regeneration owner:** `backend/internal/httpapi/wire/partners.gen.go`; `frontend/src/api/generated/partners/{types.gen.ts,schemas.gen.ts}`. Use existing generators. OpenAPI already points to the partners schema and needs no source edit. Ranking schemas, request-only query wire, and other operation outputs must remain byte-identical. Stop and amend this inventory if a generator proves another derivative necessary; never hand-edit generated outputs.
- **Backend:** new `backend/internal/statistics/{metric_scale.go,metric_scale_test.go}`; `backend/internal/ranking/{model.go,view.go,service_test.go}`; `backend/internal/partners/{types.go,view.go,view_test.go,projection.go,service_test.go}`; `backend/internal/httpapi/{partners_handler_test.go,wire/partners_contract_test.go}`. `backend/scripts/check.sh` only for the two new statistics-file inventory entries, after the B2/gate owner releases that file. No edits to `statistics/rating.go`, producer/cache/query code or Backend services.
- **Frontend — primary owner after its current C1/C2/typography handoff:** `frontend/src/api/adapters/partners.ts`; `frontend/src/api/partners.ts`; `frontend/src/features/ranking/format.ts` only for widening the formatter's structural metric input type without changing arithmetic; `frontend/src/features/co-star/components/PartnersSurface.vue`; `frontend/src/features/co-star/partners.css` only for progress-layer/signed-center styles; `frontend/tests/api/partners.test.ts`; `frontend/tests/features/co-star/partners-components.test.ts`; `frontend/tests/features/ranking/model.test.ts`; `frontend/tests/app/co-star.integration.test.ts` only for scale fixture/request matching and retained-scale assertions.
- **Primary documentation/lifecycle:** PRODUCT.md partners result/view paragraphs only; `tmp-formal-development/backend-development-implementation-guide.md` partners response paragraph only; this change and `openspec/specs/{contracts-partners-api,backend-partners-api,frontend-co-star-vertical}/spec.md` during final sync. DESIGN.md is read-only because its current progress rule already specifies the requested outcome.
- **Disposable verification outputs:** existing generator-owned `backend/.tmp/partners-wire/` and `frontend/.tmp/partners-wire/`, plus the normal existing component gate roots. Never run a cleanup-capable full gate in the shared working tree while another owner uses those roots; primary coordinates a clean disposable export/CI target before such execution. This plan adds no external writable root or new server.

The primary's current NTag, xicons, AppViewport, labels, toolbar, font/spacing, card/tooltip/divider and partners C1/C2 changes are protected preimages, not superseded implementations.

## Decisions

### 1. Add one required response field with the existing rankings shape

Both `GlobalDataV1` and `PersonalDataV1` gain required `metricScale`. The partners schema references the existing ranking `$defs/GlobalRankingsMetricScaleV1` and `$defs/RankingsMetricScaleV1` respectively; it does not copy those definitions. The partners Ajv adapter/verifier must register that existing schema and its current transitive dependencies. Existing partners projection tooling already copies query, rankings and partners schema roots.

The selected metric is the normalized requested sort (`count` by default), regardless of direction. `kind` remains `linear` for all metrics, including preference, to match rankings exactly; the signed visualization is derived from the metric discriminator.

| Metric | max representation | Population rule |
|---|---|---|
| count | JSON-safe nonnegative integer or null | Maximum workCount over the complete filtered partner set; empty set → null |
| average / overall | Existing integer hundredths or null | Maximum non-null value; no usable values → null |
| preference, personal only | Existing nonnegative exact Rational or null | Maximum absolute score by exact rational comparison, skipping null score; all absent → null; valid all-zero scores → `{numerator:"0",denominator:"1"}` |

No consumer converts null into a statistical zero. An absent value or a scale maximum equal to zero produces no visible fill; a legitimate zero remains visibly `0.00`. Rational denominators retain the existing strictly positive contract. Negative row values retain their signs; only the scale maximum is an absolute magnitude.

Alternatives rejected: leaders alone lack the negative bound; page maximum changes on pagination; a fixed ±10 scale does not preserve ranking semantics; extra opposite-sort requests add latency and synchronization; returning every metric's scale is unnecessary because sort changes already request a new projection.

### 2. Keep the cached population and reuse one existing algorithm

Move the ranking scan into `statistics.PersonMetricScale(ctx, metric, entries)` in the existing statistics package, with `statistics.MetricScale` carrying the same fields. Its only inputs are the already constructed `PersonSortEntry` slice and selected metric; there is no store/network/cache dependency. Reuse the existing exact absolute-Rational behavior, preserve integer/scalar representations, and check cancellation during the bounded O(n) scan. Ranking exposes its existing type through an alias and supplies its already built sortEntries; old ranking goldens and edge cases must remain unchanged.

Partners calls the same helper on the complete core's entries before search/page and stores the result on Page, not Summary or cached Core. `candidatePositionKey` already changes the input/core identity and therefore the population; existing core cache keys and cost accounting need no new member. No ranking↔partners import is added: both depend only on statistics.

Search, page, pageSize and order preserve the same selected maximum. Sort selects another maximum from the same core. Candidate-position filtering, source identities, applied query, dataVersion or collection identity may change the underlying population/values and therefore the scale. Projected integer/Rational values must be ownership-safe; callers cannot mutate retained core evidence or another response through the scale.

### 3. Consume the scale as presentation evidence

The adapter returns a frozen metricScale with the existing rational representation. The driver rejects a scale metric that does not match the normalized request sort; it does not estimate a replacement. Old responses missing the required field are rejected by the existing strict decode path.

Use the existing `rankingProgress` arithmetic for cooperation rows. Narrowly generalize its input type to the structural fields actually consumed (`workCount`, nullable average/overall, optional nullable preference.score), retaining all existing ranking callers/output. Map PartnerMetrics into those fields; do not fabricate ranking preference evidence or recompute statistics. The required bar is decorative/aria-hidden because each existing row already exposes the actual numbers and their meaning.

Nonnegative metrics fill from the start. Preference uses the same zero center, left/right direction, color, sign and neutral/absent behavior as current rankings. Use current shared tokens, not historical hardcoded colors. The C1/C2 column geometry, current font sizes, selected source, leaders, position/filter controls, focus and request-reveal rules do not change. Pending view rows continue to use the existing skeleton; success commits rows and scale together, and failure/cancellation retains their last accepted pair.

### 4. Preserve strict generation and scope omission

Regenerate partners only, verify its transitive projection hash and real typed round-trip, and prove unrelated ranking/request/co-star/person-detail generated bytes did not change. Global schema and driver must reject preference scales as well as other personal-only fields. Do not add loose extra-properties acceptance or an old-wire fallback.

## Risks / Trade-offs

- Required field plus closed objects breaks mixed old/new clients → build and verify Backend/Frontend together; coordinate any later activation separately. No dual-wire runtime is added.
- Shared helper extraction could drift rankings → literal maximum behavior moves intact; existing ranking goldens and focused null/zero/fractional cases remain acceptance inputs.
- Large rational numerators could overflow floating point → comparisons stay exact in Go and existing BigInt rendering is reused in Frontend.
- Concurrent B2 codegen/full gates and primary partners.css edits → no simultaneous generator writes or cleaning of another owner's disposable roots; primary records the handoff before apply.

## Migration Plan

Review and strict-validate this plan, obtain primary apply authorization, update schema/goldens and regenerate, implement Backend helper/projection, then integrate the current Frontend. Run focused evidence and the complete affected gates on a coordinated target. Synchronize the three accepted deltas and archive only when complete. No current process or published data is changed by this plan; any later activation must retain the matching prior Backend/Frontend pair for rollback.

## Open Questions

No unresolved product decision is required for planning. Primary review must confirm the exact ownership handoff and shared-helper implementation boundary before authorizing apply.
