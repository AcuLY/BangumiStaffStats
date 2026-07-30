# frontend-impeccable-tooling Specification

## Purpose

Define the repository-owned Impeccable v4 version, product/surface context,
Codex hook and runtime hygiene, and design-quality gates for formal frontend
work.
## Requirements
### Requirement: Repository tooling SHALL use official Impeccable Skill v4.0.2

The repository SHALL retain the project skill at
`.agents/skills/impeccable/**`, declare `version: 4.0.2`, and match official
tag `skill-v4.0.2` at peeled commit
`fc2e694afca1ac0cc384b4fe56bab3335fea7912`. The accepted runtime SHALL be Node
`24.18.0`; npm CLI `3.3.1` and Skill `4.0.2` versions SHALL NOT be conflated.

#### Scenario: Existing official-updater candidate is accepted

- **WHEN** the implementation owner compares the existing candidate with the pinned official distribution
- **THEN** the installed skill and Impeccable Codex hook match the pinned v4.0.2 distribution
- **AND** runtime acceptance executes under Node 24 without another updater run

#### Scenario: Latest Skill changes

- **WHEN** the candidate declares a Skill version other than v4.0.2 or differs from the pinned tag
- **THEN** apply SHALL stop without accepting or committing the candidate

### Requirement: Project context SHALL use one explicit formal SPA surface

`PRODUCT.md` SHALL contain one `<!-- impeccable:product-schema 1 -->` marker,
SHALL NOT contain the deprecated global Register section, and SHALL otherwise
preserve its product contract. `.impeccable/surfaces/route.md` SHALL define one
`Operate` surface for `/`, `/ranking`, `/co-star`, `frontend`,
`frontend/index.html`, and `frontend/src/app/App.vue`, inheriting
`DESIGN.md` and the prototype oracle without creating a new visual identity.

#### Scenario: A formal frontend target loads context

- **WHEN** v4 context or surface routing resolves any declared route/source target
- **THEN** it SHALL load the same route brief together with root PRODUCT and DESIGN context
- **AND** the brief SHALL preserve backend/shared-contract statistical authority

#### Scenario: Sidecar is stale before frontend implementation

- **WHEN** doctor inspects the retained oracle-derived design sidecar
- **THEN** only the documented stale-sidecar finding MAY remain
- **AND** apply SHALL NOT regenerate the sidecar from an empty frontend

### Requirement: Hook and runtime state SHALL remain bounded

The project Codex hook SHALL use the official v4 Impeccable hook entries while
preserving unrelated hooks. Root ignore rules SHALL cover only documented
Impeccable runtime outputs; design, surface, editor, source, and OpenSpec files
SHALL remain visible and trackable.

#### Scenario: Tooling validation runs

- **WHEN** the installed JavaScript, context, surface, doctor, and hook checks execute under Node 24
- **THEN** they SHALL pass without unexpected warnings/errors or repository writes outside the declared runtime paths

#### Scenario: Apply completes

- **WHEN** the candidate is handed to main for acceptance
- **THEN** no updater archive, download, hook cache, live session, evidence, link, special file, or unrelated ignored residue SHALL remain

### Requirement: Future visible frontend work SHALL use the v4 quality lifecycle

Every later change that implements visible frontend UI SHALL resolve the
applicable surface, load its owning v4 playbook and craft floor, preserve the
approved outward visual world unless its own OpenSpec declares a delta, verify
rendered responsive/accessibility behavior, and receive a separate read-only
Impeccable finish review.

#### Scenario: Formal frontend foundation begins

- **WHEN** the first formal SPA implementation starts
- **THEN** its owner SHALL use v4 new-work to preserve and expand the incumbent world and SHALL load Operate guidance

#### Scenario: Backend-only work begins

- **WHEN** a change has no user-visible frontend output
- **THEN** the UI-specific playbook, screenshot, and finish-review gates SHALL NOT block that work
