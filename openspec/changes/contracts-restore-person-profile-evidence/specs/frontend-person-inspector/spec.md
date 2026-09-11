## Capability Boundary

| Field | Boundary |
|---|---|
| Status | Planned |
| Owner | Frontend |
| Writable paths | Frontend inventory in this change's design.md |
| Read-only protected inputs | Public contracts, backend/statistical logic, existing geometry repairs and unrelated work |
| Deletion complement | Remove obsolete slash-summary formatter only; preserve cast identities/counts and role navigation |
| Mutable refs | None |
| Consumes | Existing exact cast contributions, person.summary, adaptive row packer |
| Produces | Two-row role evidence and real biography rendering |
| Dependencies | Strict-reviewed plan; summary data arrives through unchanged wire |
| Deliverables | Component, focused tests and rendered desktop/mobile evidence |
| Acceptance | Multiple equal-role characters, staff-only omission, Unicode names, overflow tooltip, keyboard/touch, full Frontend gate |
| Non-goals | New statistics, role-count aggregation, network enrichment or redesign |
| Operations deferred | Production/deployment |
| Stop/rollback conditions | Unintended visual/semantic drift or overlapping edit |

## ADDED Requirements

### Requirement: Ranking work cards SHALL show compact exact cast evidence
Ranking subject and series cards SHALL label their cast evidence `配音角色`, using a normal-weight character name plus a compact role tag in at most two measured rows. This preserves oracle 644b7748674e553f863d0ffd61d029f86fdc0717. Cards SHALL NOT repeat ordinary staff positions or leave an empty role cell for staff-only contributions. Every exact cast entry SHALL retain its character identity and server role; the frontend SHALL NOT aggregate overlapping counts or collapse distinct characters sharing a role.

#### Scenario: Six different characters share a supporting role
- **WHEN** six exact cast contributions all have roleLabel 配角
- **THEN** the card SHALL retain six characters and lay out only the entries that fit its two-row limit
- **AND** `… +N` SHALL occupy the final visible row and disclose every exact entry in a full tooltip

#### Scenario: The user opens hidden evidence
- **WHEN** overflow is hovered, keyboard-focused or clicked/tapped
- **THEN** the complete name/tag list SHALL be available within the viewport
- **AND** Escape, blur and pointer leave SHALL close it as appropriate without moving keyboard focus

#### Scenario: Series counts and fallback names are displayed
- **WHEN** a series contribution supplies workCount or a character lacks a Chinese name
- **THEN** the role tag SHALL display the server workCount and the name SHALL use the existing original-name fallback
- **AND** a subject contribution SHALL not gain a fabricated count

### Requirement: The profile SHALL present available real summary text
The profile SHALL render a supplied person.summary as escaped plain text, with the existing long-summary collapse/expand behavior. It SHALL NOT use prototype hardcoded biographies. Its approved statistical fallback SHALL be limited to actually absent/blank summary values.

#### Scenario: The Archive contains a real biography
- **WHEN** person.summary is nonblank
- **THEN** the profile SHALL display that text instead of the statistical fallback
- **AND** long text SHALL retain the accepted expansion control and keyboard semantics
