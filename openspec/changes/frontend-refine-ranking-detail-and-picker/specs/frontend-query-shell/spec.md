## Capability Boundary

- **Status:** local intentional summary correction.
- **Owner:** Frontend query shell/shared compact summary presentation.
- **Writable paths:** query/co-star summary CSS and MobileCandidateEntry, focused query/co-star tests, this change, root spec later.
- **Read-only protected inputs:** query values/order/state, candidate selections, API/Backend/external state.
- **Deletion complement:** preserve every summary value, edit action, wrapping, accessible name, target size, and test.
- **Mutable refs:** current dirty worktree only.
- **Consumes:** current summary DOM and 44px target/type tokens.
- **Produces:** matched compact task summaries and normal-weight separators.
- **Dependencies:** existing CSS/native button only.
- **Deliverables:** source/tests/browser/build evidence.
- **Acceptance:** one-line summaries share height/type; long content wraps; separators are 400 while values remain 600.
- **Non-goals:** query wording/value semantics or fixed-height truncation.
- **Operations deferred:** full gate/lifecycle/Git/deploy.
- **Stop/rollback conditions:** value/order drift, truncation, target shrink, inaccessible disclosure.

## ADDED Requirements

### Requirement: Compact task summaries SHALL share geometry and typographic hierarchy

Below 780px, Query Summary and selected-person disclosure SHALL use the same
border-box one-line minimum height, 12px primary/secondary type scale, 28px
visible edit/disclosure action inside at least a 44px target, and equivalent
padding. Query values and selected names SHALL remain semibold; role labels and
the separators joining query values SHALL render at normal weight. Long query,
name, identity, or multi-selection content SHALL wrap and grow rather than clip
or force a fixed height.

#### Scenario: Both compact summaries fit on one line
- **WHEN** Query Summary and a two-person selection summary render at 568px
- **THEN** their outer heights and primary font sizes SHALL match within one CSS pixel

#### Scenario: Query values are joined
- **WHEN** multiple applied-query values render in the summary
- **THEN** values SHALL remain semibold and every joining separator SHALL be
  visibly normal weight and ignored by assistive technology

#### Scenario: Summary content is long
- **WHEN** a long UID, name, identity list, or translated value cannot fit one line
- **THEN** the relevant summary SHALL wrap, preserve complete accessible content,
  and retain its 44px action target without horizontal overflow
