## Context
Four local icon components own all business-icon SVGs. Two other SVG-bearing files render data charts; brand is an image asset. Naive UI README recommends xicons and its examples use @vicons/ionicons5. User requested a complete business glyph migration with BGMSS preserved.

## Change boundary
| Boundary | Declaration |
|---|---|
| Status | Apply waits for complete strictly valid artifacts and primary review; user explicitly authorized the icon migration. Existing dirty work is preserved under prior authorization. |
| Owner | Primary frontend owner; this bounded migration does not benefit from delegation. |
| Writable paths | `frontend/package.json`, `frontend/package-lock.json`, `frontend/scripts/check-architecture.mjs`, `frontend/src/shared/components/{AppIcon,InfoIcon}.vue`, `frontend/src/features/query/components/QueryIcon.vue`, `frontend/src/features/co-star/components/CoStarIcon.vue`, `frontend/tests/shared/info-trigger.test.ts`, `frontend/tests/shared/SafeImage.test.ts` (decorative icon assertion only), `frontend/tests/features/query/components.test.ts` (icon accessibility assertion only), `frontend/ARCHITECTURE.md`, `DESIGN.md`, relevant icon-only rule in `.impeccable/design.json`, this change, `openspec/specs/{frontend-design-system,frontend-foundation}/spec.md`, and one supersession note in active `openspec/changes/frontend-unify-info-triggers/` if necessary. Existing ignored node_modules/dist/.tmp validation outputs. |
| Read-only protected inputs | BGMSS assets and favicon; chart SVGs; all other frontend changes, query/contract/backend/operations implementation and historical archives. |
| Deletion complement | Remove inline business-icon drawings only. No asset deletion, chart changes, dependency upgrades or unrelated cleanup. |
| Mutable refs | Current master working tree only; no commit, push or ref movement. |
| Consumes | Naive UI's installed README recommends xicons; npm metadata for 0.13.0 is MIT and sideEffects=false. Vue 3 integration fits existing Vue 3.5.40 and Naive UI controls. |
| Produces | Vendor glyphs, explicit semantic mapping and focused regression coverage. |
| Dependencies | Add exactly @vicons/ionicons5 0.13.0; retain all existing locked versions. Frontend owns updates/licenses. Native SVG alone cannot satisfy the requested library adoption. Use explicit imports for tree shaking; no second UI or state library. |
| Deliverables | Four migrated wrappers, exact dependency/architecture inventory, design rule and tests. |
| Acceptance | Focused icon tests; pinned frontend typecheck/build and affected gate; desktop/mobile, both themes, Header/controls/help/empty glyph rendering and keyboard; source residue and owned diff hygiene; strict specs. Report existing full-gate blockers separately. |
| Non-goals | Brand redesign, chart replacement, replacing Naive UI internal icons, changing control semantics or theme behavior. |
| Operations deferred | No services, routes, deployment, root cutover, release, push or merge. |
| Stop/rollback conditions | Stop on exact concurrent overlap or unexpected dependency/visual expansion; restore only owned changes, preserving unrelated dirt. |

## Goals / Non-Goals
Use one coherent outline family for all business glyphs without changing their meaning, layout, accessibility or interactions. Preserve brand/chart/internal library rendering and all pre-existing work.

## Decisions
- Pin @vicons/ionicons5 0.13.0 (MIT, sideEffects=false, Vue 3) instead of installing multiple xicons families. Explicit static imports select only used icons.
- AppIcon owns the semantic business-name mapping; InfoIcon remains the single information-glyph owner, imported by AppIcon. QueryIcon and CoStarIcon delegate to AppIcon, mapping query chevron to chevron-down. Wrappers retain the existing SVG root, size and currentColor attributes; the vendor owns SVG path/stroke data.
- Map straight sorting arrow to ArrowDownOutline, disclosure/page arrows to Chevron*Outline, external navigation to OpenOutline, edit to CreateOutline, info to InformationCircleOutline, theme to SunnyOutline/MoonOutline, plus/check/close/search/refresh/image/person/people/warning to matching outline components.
- Keep all caller class attributes, accessible button names, rotations and sizes. Decorative icons remain aria-hidden and do not become independent focus stops. No copied vendor path data or icon font/CDN.
- Existing exact hand-drawn info-glyph assumptions are intentionally superseded; the same library info icon remains shared across all contexts. Data-chart SVG is explicitly outside the icon inventory.

## Risks / Trade-offs
Library outlines differ optically from hand-drawn 24px icons; inspect rendered 16/18/28px use cases, size/centering, both themes and mobile. Direct SVG components preserve host classes, rotation and accessibility and avoid an extra NIcon wrapper/runtime cost. Do not override vendor stroke data to imitate old paths. A new runtime dependency has an owner and exact lock; verify build tree-shaking and license. Known complete-gate baseline issues must remain honestly reported.

## Migration Plan
Review and strict-validate artifacts, update icon authority, install exact package preserving lock versions, migrate wrappers, run focused tests/build/browser and affected gates, synchronize specs and archive only if accepted. No commit or deployment. Rollback removes only new package and owned wrapper/docs edits.

## Open Questions
None. Primary planning review accepted with no identified P0/P1 issues; strict validation still required before apply.
