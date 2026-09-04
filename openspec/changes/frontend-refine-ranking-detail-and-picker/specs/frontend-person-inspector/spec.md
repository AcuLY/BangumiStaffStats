## Capability Boundary

- **Status:** local intentional presentation correction.
- **Owner:** Frontend person inspector.
- **Writable paths:** person detail surface/item browser/CSS, focused person/App tests, this change, root spec later.
- **Read-only protected inputs:** person payloads, views, evidence, Backend/contracts/external state.
- **Deletion complement:** preserve dialog, accessible name, close/focus/scroll behavior, all person content, facts, items, pagination, and tests.
- **Mutable refs:** current dirty worktree only.
- **Consumes:** existing dialog and person-work markup.
- **Produces:** close-only compact chrome and edge-complete fact grids.
- **Dependencies:** existing Vue/CSS only.
- **Deliverables:** source/tests/browser/build evidence.
- **Acceptance:** no visible drawer title; accessible dialog name remains; facts/dividers reach card edges.
- **Non-goals:** person data, view behavior, profile redesign.
- **Operations deferred:** full gate/lifecycle/Git/deploy.
- **Stop/rollback conditions:** dialog loses name/close/focus, fact content clips, card overflow, request drift.

## ADDED Requirements

### Requirement: Compact person detail SHALL use close-only chrome and complete fact geometry

The compact person-detail dialog SHALL retain its accessible name, close
control, focus isolation, scroll ownership, and complete PersonProfile, but SHALL
NOT render a visible generic “人物详情” title. The close action SHALL remain at the
inline end of its 52px bar. Every detailed person-work fact grid SHALL stretch
across the complete card facts area; its top and internal dividers SHALL meet
the corresponding card/fact edges without leaving a blank right strip.

#### Scenario: Compact detail opens
- **WHEN** a ranking person is opened below 780px
- **THEN** the dialog SHALL expose accessible name “人物详情”, no visible generic
  title, and one close action at the inline end

#### Scenario: A work has contribution roles
- **WHEN** global score, personal score, and one or more participation roles render
- **THEN** the facts grid and final role cell SHALL use the complete available
  width and the top divider SHALL be visually closed

#### Scenario: Facts wrap at narrower content width
- **WHEN** a long participation role wraps or the responsive role row spans all columns
- **THEN** the text SHALL wrap inside the stretched cell without horizontal overflow
