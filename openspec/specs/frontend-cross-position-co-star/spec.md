# frontend-cross-position-co-star Specification

## Purpose
Define independent co-star operation positions while preserving original Query and exact person identities.

## Requirements


### Requirement: Explicit All position choice
The co-star query position control SHALL expose an exclusive 全部 option backed by operation positionScope all. Ranking detail 查看共演 SHALL select All and the exact target identities while preserving all other query and draft parameters. Draft/accepted scope SHALL support apply, undo, failure rollback and same-tab recovery without origin state. A first All query SHALL work with no concrete Query positions and select the first complete eligible all-position candidate when no explicit source exists.

#### Scenario: Ranking detail handoff
- **WHEN** the user follows a ranked person's detail into co-star
- **THEN** the position editor and summary show All, the target is selected with its existing identities, and all other Applied Query and unapplied Draft values remain unchanged

#### Scenario: First query and mode transition
- **WHEN** All is applied without concrete positions, refreshed, and then switched to ranking
- **THEN** co-star requests and recovery retain all scope, and ranking asks for concrete positions without submitting an invalid request

#### Scenario: Scope-only editing
- **WHEN** the user changes only All versus concrete positions, cancels, fails, or restores edits
- **THEN** scope participates in dirty/application semantics and only accepted scope drives results and recovery

### Requirement: One original-position default source
An ordinary successful concrete-position co-star Query without retained/explicit selection SHALL select only the first complete eligible person from original Query-position candidates, then offer all-position candidate browsing. Existing exact restores, view changes, explicit ranking links and unsubmitted Draft SHALL NOT be replaced by defaults.

#### Scenario: Query director
- **WHEN** a new director Query succeeds with candidates A and B
- **THEN** only A's returned director identities are selected, single-person cooperation is shown, and a small hint explains that more people can be selected

#### Scenario: Selection limits and user action
- **WHEN** a candidate exceeds 20 identities, or the user chooses a second person
- **THEN** an over-limit candidate is skipped whole during initialization; explicit selection limits remain unchanged; the hint disappears once at least two people are selected

### Requirement: Cross-position exploration retains source Query
Candidate/partner filters SHALL expose available positions independently of ranking Query positions. Source and chosen partner identities SHALL propagate exactly through cooperation, pair/group analysis, detail and same-tab recovery. Ranking navigation SHALL retain original Query semantics and report unavailable rank without silently changing positions.

#### Scenario: Broad partner selection and return
- **WHEN** director A's script partner B is selected and the user returns to ranking
- **THEN** analysis uses A director and B script, while ranking still uses its original director query and preserves unapplied Draft

#### Scenario: Scope replay and stale requests
- **WHEN** an all-scope analysis is restored or a delayed response finishes after Query/selection changes
- **THEN** valid scope and exact identities are restored through normal requests, and superseded responses cannot overwrite current state
