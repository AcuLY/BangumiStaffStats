## Capability Boundary

| Field | Boundary |
| --- | --- |
| Status | Modified existing frontend capability for one bounded mobile interaction correction. |
| Owner | Frontend Query Workspace presentation owner. |
| Writable paths | `frontend/src/features/query/components/QueryWorkspace.vue`; `frontend/src/shared/styles/base.css`; `frontend/tests/features/query/components.test.ts`; `frontend/tests/shared/scrollbar-system.test.ts`; this change's four planning artifacts. |
| Read-only protected inputs | `PRODUCT.md`; `DESIGN.md`; `.impeccable/design.json`; `frontend/ARCHITECTURE.md`; `frontend/src/features/query/components/QueryEditor.vue`; `frontend/src/features/query/composables/useCompactLayout.ts`; Person Detail Drawer source/tests/styles; accepted `openspec/specs/**`; oracle commit; contracts, backend, updater, operations, ignored runtime files, dependencies, and generated output. |
| Deletion complement | No existing requirement, scenario, query behavior, copy, state, control, or file is removed. |
| Mutable refs | Compact/open lifecycle and the prior inline overflow value of the actual root viewport scroll owner only; body inline overflow remains unchanged. |
| Consumes | Existing Query Workspace disclosure state, compact breakpoint, Query Editor scroll region, and accepted frontend responsive behavior. |
| Produces | Observable compact scroll isolation with exact cleanup. |
| Dependencies | Existing Vue and CSS only; frontend remains a presentation consumer and creates no statistical authority. |
| Deliverables | Focused test and minimal component/style correction. |
| Acceptance | Focused RED/GREEN test, CSS/architecture checks, full frontend gate, strict OpenSpec validation, diff check, and responsive behavior verification. |
| Non-goals | Query semantics/API/store changes, desktop changes, modalization, visual redesign, shared overlay infrastructure, dependencies, operations, or external state. |
| Operations deferred | Commit, push, merge, release, deployment, host, service, route, and production activation remain out of scope. |
| Stop/rollback conditions | Stop on authority conflict, overlap, desktop lock, unusable mobile scrolling, incorrect restoration, visual drift, or required scope expansion; revert only exact owned changes. |

## MODIFIED Requirements

### Requirement: Query Workspace SHALL preserve the approved outward behavior

The production components SHALL preserve the final oracle/DESIGN Header and Query Workspace, not their component or store structure. With no Applied Query the editor SHALL start expanded. Success SHALL collapse to the applied summary; validation failure, request failure, and cancellation SHALL keep it expanded with Draft. On desktop the expanded editor SHALL overlay below the fixed header without pushing content and SHALL retain its own translucent chrome background and backdrop; below 780px it SHALL participate in document flow and its query content region SHALL own vertical touch scrolling while expanded. The below-780px in-header overlay SHALL not paint a second chrome background and SHALL instead remain transparent over the Header's existing translucent background/backdrop so each pixel receives one chrome layer. While that compact editor is expanded, the actual root viewport scroll owner (`document.scrollingElement`, the document element in standards mode) SHALL be locked so the underlying viewport cannot move or receive chained vertical scrolling. Closing the editor, crossing to 780px or wider, or unmounting the Query Workspace SHALL restore the exact prior inline overflow value on that same root owner and SHALL preserve body inline overflow unchanged. Controls SHALL meet DESIGN focus, keyboard, target-size, contrast, status-announcement, and reduced-motion requirements.

The Header SHALL contain brand, the two-mode control, share action, and one theme action in the DESIGN order. One app-level owner SHALL expose only `light|dark`, persist only versioned localStorage key `bgmss-theme-v1`, and drive the Naive provider and semantic CSS tokens through public APIs. Invalid or unavailable storage SHALL fall back to Light without failure. Theme SHALL not enter query Draft/Applied state, URL parameters, share payload, resource state, or Skeleton behavior; the prototype `bgmss-workbench-theme` key SHALL not be read or written.

The brand SHALL reuse the project's exact 64×64 RGBA mark from `frontend/public/bgmss.png` at oracle `644b7748674e553f863d0ffd61d029f86fdc0717`, SHA-256 `d3d1ca5d14d560f3415dfbcc84b58ece72741a51cf860362d09284ed21aa394a`, as the production-owned `src/assets/brand/bgmss.png`. No screenshot, fixture, prototype path, external request, or replacement visual identity SHALL enter the production artifact.

#### Scenario: Desktop and mobile disclosure behavior

- **WHEN** the same editor is opened at a supported desktop viewport and below 780px
- **THEN** desktop SHALL use the anchored overlay and retain ordinary page scrolling
- **AND** mobile SHALL remain in document flow, keep all query controls vertically reachable through its own scroll region at 360px and 390px widths and short heights, and prevent vertical scroll chaining into the underlying page
- **AND** the mobile in-header overlay SHALL be transparent over the Header's single translucent chrome layer while the desktop teleported overlay SHALL retain its own chrome background and backdrop
- **AND** close/apply/cancel SHALL preserve the specified focus, Draft, and prior page scroll behavior without overflow

#### Scenario: Compact editor lifecycle ends

- **WHEN** an expanded below-780px Query Editor closes, the viewport transitions to 780px or wider, or Query Workspace unmounts
- **THEN** the same root viewport scroll owner SHALL regain the exact inline overflow value that existed before compact editing began
- **AND** body inline overflow SHALL remain unchanged throughout the lifecycle
- **AND** no permanent global scroll lock or desktop scroll lock SHALL remain

#### Scenario: Query attempt does not succeed

- **WHEN** validation, request failure, or cancellation keeps the compact Query Editor expanded
- **THEN** Draft and the previous Applied Query/result SHALL remain intact
- **AND** the Query Editor SHALL continue owning vertical scrolling without moving the underlying page
