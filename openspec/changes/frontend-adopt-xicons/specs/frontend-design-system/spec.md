## Capability Boundary

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

## ADDED Requirements

### Requirement: Business icons SHALL use the recommended xicons family
All application-owned non-brand icons SHALL render from the pinned @vicons/ionicons5 outline components as vendor Vue SVG components. AppIcon SHALL map semantic names; InfoIcon SHALL provide the same InformationCircleOutline glyph across application/query/co-star wrappers. No hand-drawn business-icon paths, icon fonts, CDN assets or additional icon family SHALL remain. This intentionally supersedes the original exact inline information glyph while preserving the shared help trigger behavior.

BGMSS brand images/favicon and data visualization SVGs SHALL remain unchanged. Naive UI's internal controls SHALL retain their supported built-in icons. Caller sizing, currentColor, title/help behavior, keyboard focus ownership, sorting rotations and hit targets SHALL remain intact. Decorative glyphs SHALL be aria-hidden and non-focusable.

#### Scenario: Business glyphs across features
- **WHEN** Header, query controls, ranking/pagination, detail or co-star surfaces render icons
- **THEN** all application-owned glyphs SHALL use the same library family with their original meaning and requested size
- **AND** sorting direction SHALL retain a straight arrow shaft and existing rotation

#### Scenario: Brand and chart exceptions
- **WHEN** the migration is applied
- **THEN** BGMSS brand image/favicon and rating chart SVG code SHALL be unchanged

#### Scenario: Keyboard and compact controls
- **WHEN** the user traverses compact help or Header controls by keyboard in either theme
- **THEN** the icon SHALL not introduce another focus stop and the host SHALL retain its name, behavior and hit target
