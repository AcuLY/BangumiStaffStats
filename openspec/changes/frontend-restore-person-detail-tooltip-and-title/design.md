## Context

`RatingEvidence.vue` already receives a fixed 1–10 bucket sequence from the server. Each non-empty bucket includes up to eight ordered unit references plus `hiddenCount`; the production UI currently feeds those values through `bucketLabel()` and repeats the entire accessible sentence as one visible tooltip line. The immutable oracle instead rendered the available unit names as separate ellipsized rows and ended an incomplete list with `… +N`. In the same inspector, preference work names are semantically item titles but currently consume `--text-secondary` rather than the requested primary foreground.

This is a local presentation correction. The frontend continues to consume server-authoritative counts, examples, and omission values and does not derive rating data.

## Goals / Non-Goals

**Goals:**

- Make the visible score-bar tooltip contain only ordered work/series names and, when needed, one omission row.
- Preserve score, count, listed titles, and omitted count in the focusable bar's accessible name.
- Ellipsize each overlong title without allowing a long list or title to widen the inspector or viewport.
- Give preference-evidence titles the semantic primary foreground in both themes.
- Preserve pointer and keyboard tooltip access and the current chart geometry.

**Non-Goals:**

- Changing person-detail API or statistics, the server's eight-example cap, bucket ordering, tooltip infrastructure, theme tokens, preference values, card layout, or any unrelated inspector copy.

## Change Boundary

| Field | Boundary |
|---|---|
| Status | Specified; implementation waits for strict validation and main-agent zero-P0/P1 review |
| Owner | Frontend / `frontend-person-inspector`; primary agent owns the one implementation block |
| Writable paths | `openspec/changes/frontend-restore-person-detail-tooltip-and-title/**`; `frontend/src/features/person-detail/components/RatingEvidence.vue`; `frontend/src/features/person-detail/person-detail.css`; `frontend/tests/features/person-detail/components.test.ts` |
| Read-only protected inputs | `PRODUCT.md`; `DESIGN.md`; `.impeccable/design.json`; `.impeccable/surfaces/route.md`; root specs; oracle commit; contracts/goldens; shared styles including the pre-existing dirty `frontend/src/shared/styles/base.css`; all other active changes and source files |
| Deletion complement | None |
| Mutable refs | None |
| Consumes | Server-provided bucket `score`, `count`, ordered `examples`, and `hiddenCount`; `primaryEntityName`; Naive UI public Tooltip API; `--text-primary` |
| Produces | Bounded title-list tooltip DOM, preserved accessible summary, primary preference-title foreground, focused regression evidence |
| Dependencies | `frontend-person-inspector` consumes the existing contracts and design/accessibility capabilities; dependency direction remains contracts/backend → frontend presentation |
| Deliverables | Change artifacts, two production-file corrections, one focused test-file update, strict/static/runtime evidence |
| Acceptance | Focused person-detail Vitest; frontend typecheck/build or complete frontend check; detector; desktop/compact browser interaction and console/overflow checks; strict OpenSpec validation; owned-path `git diff --check` |
| Non-goals | No API/schema/data/dependency/architecture/global-style change and no unrelated cleanup |
| Operations deferred | Commit, push, PR, merge, release, deploy, routing, and live-host writes |
| Stop/rollback conditions | Stop for authority conflict, overlapping concurrent edits, contract mismatch, failed strict validation, or necessary scope expansion. Roll back only the declared production/test hunks and this change directory. |

## Decisions

### Render the contract's examples directly as a semantic list

For a non-empty bucket, the visible Tooltip body will be an unstyled `ul`. Each `examples` entry becomes one `li` using `primaryEntityName()`. When `hiddenCount > 0`, a final muted row renders `… +N`. The tooltip body will not repeat the score, count, `示例：`, or `另有 N 个未列出` prose.

This matches the oracle's approved compact scanning model and the user's current clarification. Reusing the contract's existing cap is preferable to introducing a second frontend limit that could disagree with `hiddenCount`.

Alternative considered: keep the single `bucketLabel()` sentence and merely add line wrapping. Rejected because it retains duplicate chart metadata and does not produce one scannable title per row.

### Separate visible tooltip content from the accessible bar summary

The focusable bar keeps a dedicated accessible label containing the score, count, available titles, and omitted count. The visible Tooltip uses the title-list model only. The existing manual pointer/focus visibility state and Naive UI positioning remain unchanged.

Alternative considered: make the tooltip list the only accessible description. Rejected because the chart bar still needs a concise score/count identity independent of whether the portaled tooltip is announced.

### Bound text through line ellipsis and the existing example cap

The list receives a local class in `person-detail.css`; every row uses one line with `overflow: hidden`, `text-overflow: ellipsis`, and `white-space: nowrap`. The Tooltip keeps its existing viewport-aware maximum width and consumes the shared component-tier tooltip content class. No nested scroll region or new component is required for at most eight titles plus one omission row.

Alternative considered: cap the tooltip with a fixed height and internal scrollbar. Rejected because the contract already limits examples, while a scrollbar would make a short, noninteractive data hint heavier and harder to scan.

### Use semantic primary text instead of literal black

`.person-preference-work__copy strong` changes from `--text-secondary` to `--text-primary`. This realizes black/near-black titles in Light while preserving the correct light foreground in Dark and forced-color behavior.

Alternative considered: hard-code `#000`. Rejected because it would fail the accepted dark-theme and semantic-token contract.

## Risks / Trade-offs

- **[Risk] The API supplies no examples for a positive count** → Keep the bar accessible and render no misleading invented title; browser/test evidence covers normal populated buckets.
- **[Risk] A long localized title expands the portal or inspector** → Apply min-width zero plus single-line ellipsis to every row and keep the existing viewport-aware maximum width.
- **[Risk] Visible content and accessible content diverge accidentally** → Build both from the same ordered `examples` and `hiddenCount`, with a focused regression checking the visible list and the bar label separately.
- **[Risk] Literal black harms Dark theme** → Consume `--text-primary` and verify both themes or inspect the computed semantic token in the rendered app.

## Migration Plan

No data migration or rollout transition is required. Apply the template/style/test hunks, run focused and affected validation, then use the normal frontend release pipeline only if separately authorized. Rollback is a reversal of those exact hunks.

## Open Questions

None. The oracle, current contract, governing design tokens, and user comments determine the bounded behavior.
