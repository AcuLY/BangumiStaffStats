> Supersession (2026-09-08): `contracts-remove-query-sharing` retires the query-sharing feature and overrides the sharing-specific requirements, preservation clauses, and acceptance assumptions below. URL fragments are cleared without parsing or replay. Header now has an always available same-tab “回到旧版” link to `https://search.bgmss.fun/old/` immediately left of theme. Exact accepted workspace recovery remains frontend-local through validated v2 JSON session storage; v1 fragment-based storage is discarded. Completed evidence below remains historical, and unrelated requirements are unchanged.

## Context

The existing query coordinator commits the accepted ranking payload and starts exactly one first-person detail request. App currently shows the companion `PersonDetailSkeleton` only while the primary ranking resource is `pending`. When ranking becomes `ready`, that branch disappears immediately; if the selected detail is still pending or its lazy surface is not ready, the right column changes owner before actual detail can render. Focused tests call `flushPromises()` after ranking resolution and therefore skip this visible bridge.

Separately, `html` and `body` both declare `min-width: 320px` while `html` permanently reserves a 10px viewport scrollbar. In a nominal 320px Windows viewport the content client width is 310px, so the root minimum itself creates a 10px horizontal scroll range.

### Change boundary

| Field | Boundary |
|---|---|
| Status | Apply-ready only after strict validation, ownership transfer, and zero-P0/P1 main-agent review |
| Owner | Frontend App/root presentation |
| Writable paths | Exact paths declared in `proposal.md` |
| Read-only protected inputs | Product/design authorities, coordinator/query/API contracts, detail components, unrelated dirty paths, external state |
| Deletion complement | Preserve every existing resource state, request, selection/share/drawer rule, skeleton section, scrollbar owner, and unrelated test |
| Mutable refs | Current local dirty `codex/remove-archive-admission` worktree only |
| Consumes | Existing ranking/person-detail phases, selected ID, detail skeleton, root scrollbar tokens |
| Produces | Stable detail bridge and 320px-safe root sizing |
| Dependencies | `coordinator resources -> App projection -> existing detail components`; `viewport -> html/body sizing -> shell`; no new dependency |
| Deliverables | OpenSpec, App/CSS/tests, focused/build/browser evidence |
| Acceptance | Timing-sensitive skeleton test, exact request count, 320–330 reflow, focused gates, clean console/diff |
| Non-goals | Data/query/API changes, animation, artificial delay, redesign, Figma, broad cleanup, deployment |
| Operations deferred | Full accumulated gate, sync/archive, Git integration, release/deploy/host mutation |
| Stop/rollback conditions | Request/share/drawer/zero-result drift, false pending state, scrollbar-owner change, unrelated overlap, failed acceptance |

## Goals / Non-Goals

**Goals:**

- Preserve the right desktop column and the person-detail-shaped skeleton from primary pending through selected-detail pending.
- Replace the right skeleton only when the existing person-detail resource can render its real ready/error surface.
- Remove horizontal root scrolling at the supported 320px extreme without hiding overflow or changing the vertical scrollbar.

**Non-Goals:**

- No new state machine, request, transition timer, layout redesign, or change to compact Drawer/share behavior.
- No fix outside the two reported layout defects.

## Decisions

1. **Project existing detail pending state into the companion skeleton branch.** App will derive one computed presentation flag from current public state: desktop plus either the existing primary-pending condition or an automatically/manual selected person whose coordinated detail resource is pending. Keeping App's existing `PersonDetailSkeleton` as the first template branch means the right side stays the same shape until pending ends, after which the already-existing detail component/error branch takes over. Adding a timeout or another request state was rejected because resource phases already express the truth.
2. **Keep selection/request semantics untouched.** `activateFirstRankingPerson`, coordinator ordering, exact share suppression, zero-result single-column behavior, compact Drawer rules, and request cancellation remain unchanged. The regression asserts exactly one detail request and that `ranking-workspace--single` never appears during the ready-ranking/pending-detail bridge.
3. **Make the root minimum relative to available width.** Change both root minimums to `min(320px, 100%)`. This preserves the intended 320px design floor when space exists but allows the reserved scrollbar-reduced client box to be narrower without forcing horizontal overflow. Removing the vertical scrollbar reservation, hiding `overflow-x`, or lowering the product floor globally was rejected.
4. **Use current rendered evidence, not old screenshots.** Browser acceptance repeats the actual primary query at desktop and measures state changes, then verifies 320/328/329/330 widths. Oracle preservation compares unchanged content/interaction structure; only loading ownership and root reflow are intentional deltas.

## Risks / Trade-offs

- **[Risk] App skeleton masks a retained accepted detail during refresh.** → Reuse the existing primary-pending guard for refresh; the new detail-pending clause applies only after the selected detail itself enters pending.
- **[Risk] Detail error or lazy-module failure leaves a skeleton forever.** → The derived flag ends when person detail leaves `pending`, allowing existing ready/error/deferred states to render.
- **[Risk] Percentage root minimum behaves differently across engines.** → Keep standards-based `min()` and verify computed scroll geometry in Chromium plus focused source coverage; no overflow hiding fallback.
- **[Risk] Dirty worktree ownership is ambiguous.** → Transfer only the four exact implementation/test paths from the two prior changes and stop on any additional overlap.

## Migration Plan

Add focused regressions first, apply the two bounded presentation edits, run focused tests/typecheck/build/detector/strict/diff, and repeat the current localhost query/viewport checks. Rollback removes only these exact hunks. No data or production migration exists.

## Open Questions

None.
