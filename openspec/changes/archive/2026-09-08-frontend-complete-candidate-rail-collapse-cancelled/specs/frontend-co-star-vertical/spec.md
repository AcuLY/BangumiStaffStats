## Capability Boundary
| Field | Boundary |
|---|---|
| Status | Specified; apply requires complete artifacts, strict validation and primary review |
| Owner | Frontend primary |
| Writable paths | This change; frontend/src/features/co-star/components/CoStarWorkspace.vue; frontend/src/features/co-star/co-star.css; frontend/tests/features/co-star/components.test.ts; openspec/specs/frontend-co-star-vertical/spec.md |
| Read-only protected inputs | PRODUCT, DESIGN, API/contracts/statistics, recent NTag/xicons/scroll/layout changes, other active changes |
| Deletion complement | Candidate/search/sort/page/tray/selection state, existing mobile accordion and breakpoint focus rules |
| Mutable refs | None; current master worktree |
| Consumes | Current compact breakpoint, selected identities and candidate component |
| Produces | Local desktop rail disclosure retaining 56px |
| Dependencies | Existing Vue/Naive UI/xicons only |
| Deliverables | Specification, component/CSS, keyboard/state regression and browser evidence |
| Acceptance | Toggle keeps state and makes hidden content unfocusable, 56px collapsed width, correct 779/780 focus transfer, affected frontend checks/build |
| Non-goals | New API/state persistence, mobile redesign, candidate computation or other audit changes |
| Operations deferred | Git integration, release, production/host mutation |
| Stop/rollback conditions | Concurrent conflicting edit, lost focus/selection, overflow or failed acceptance; no destructive cleanup |

## ADDED Requirements
### Requirement: Desktop candidate rail SHALL support a state-preserving disclosure
At widths of at least 780px the candidate rail SHALL expose a named keyboard-operable collapse/expand action. Collapsed width SHALL be 56px. Collapse SHALL preserve selection, candidate search/sort/page and tray state without issuing a request. Hidden picker content SHALL be absent from Tab order and accessibility exposure. The action SHALL retain a 44px target and current xicons/Naive appearance.

#### Scenario: Collapse and reopen an edited picker view
- **WHEN** a user collapses then reopens a desktop picker after changing search or selection
- **THEN** the same state SHALL be restored and the action SHALL remain keyboard accessible
- **AND** the grid SHALL allocate 56px only while collapsed

#### Scenario: Reveal or breakpoint transfer needs the picker
- **WHEN** an explicit reveal or a focused mobile picker/summary crosses to desktop
- **THEN** the rail SHALL expand before existing search focus is restored
- **AND** crossing a focused desktop rail to compact SHALL preserve the existing mobile-entry focus behavior without opening the mobile accordion

#### Scenario: Unrelated query or selection state updates
- **WHEN** data updates while the desktop rail is collapsed
- **THEN** existing latest-response admission and selected identities SHALL remain unchanged
