## Capability Boundary

Status: user-approved interaction, reviewed for implementation. Owner: primary. Writable paths: primary Owned files enumerated in ../../design.md. Read-only protected inputs: other files and dirty hunks. Deletion complement: none. Mutable refs: none. Consumes: typed backend detail/location, shared Applied Query, existing UI tokens. Produces: navigation and scoped detail presentation. Dependencies: contracts before consumers. Deliverables: controls, state owner, regression tests. Acceptance: frontend gate, rendered desktop/mobile and keyboard checks, diff hygiene. Non-goals: client statistics, new pages or third column. Operations deferred: all. Stop/rollback conditions: authority/writer conflicts; undo only task-owned hunks.

## ADDED Requirements

### Requirement: Responsive co-star person inspection
Co-star source and selected participant entries SHALL expose a separate 查看详情 action. Partner list rows SHALL show primary name, original name and cooperation positions, retaining only the existing row activation into co-star analysis. Under 960px it SHALL open the existing drawer; at or above 960px it SHALL replace the right analysis content with the existing detail card and 返回共演分析. The selection rail SHALL retain its existing 780px behavior. The profile SHALL retain identity information; its action bar SHALL NOT repeat person/position or rank/metric/direction summaries.

#### Scenario: Return and resize
- **WHEN** the user opens detail, crosses the 960px boundary and returns
- **THEN** the same person stays open across resize, no duplicate panel IDs or hidden focus targets appear, and returning restores original analysis state, scroll and usable trigger focus

#### Scenario: Selection or query changes during detail loading
- **WHEN** selection changes, a new Query is applied, or mode changes before detail/lookup completes
- **THEN** preview closes, stale responses cannot navigate or overwrite current results, and current analysis updates normally

### Requirement: Follow a ranked person into cooperation
Ranking detail SHALL offer 查看共演 at the right of the profile identity block, with name and career on the left and without a separate top action bar, using the same Applied Query and that person's complete selected query identities. It SHALL select the exclusive All co-star range, replace the current selection with only that person, and show existing single-person partners, preserving the other Applied Query and Draft fields. Header SHALL use ordinary mode navigation without origin flags, previous-analysis snapshots, ranking-view rollback or extra 返回人物排行 / 返回原分析 controls.

#### Scenario: Dirty Draft and existing group
- **WHEN** the user follows a ranked person with unsaved Draft and a previous group
- **THEN** Draft stays unapplied, the person becomes the explicit source without default candidate replacement, and subsequent Header navigation retains the current selection and views without restoring the previous group

### Requirement: Inspect and locate current ranking
Co-star detail SHALL provide 在排行中查看 beside 返回共演分析 on desktop, without displaying the numerical rank summary. Location SHALL use person ID and the existing ranking sort/direction, clear search, load the returned page and select the exact person. It SHALL never use candidate rank as ranking rank. If an all-only Query has no concrete ranking positions, the preview SHALL explain that ranking positions must be selected and SHALL NOT send an invalid ranking lookup.

#### Scenario: Participant is not ranked
- **WHEN** the participant does not satisfy all current Query positions
- **THEN** detail remains available, ranking shows 未进入当前榜单 with a scope explanation, and no automatic Query modification occurs

#### Scenario: Lookup failure
- **WHEN** rank lookup fails while detail succeeds
- **THEN** detail remains visible with local ranking retry and the existing analysis is retained
