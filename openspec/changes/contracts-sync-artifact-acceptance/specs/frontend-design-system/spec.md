## MODIFIED Requirements

### Requirement: Production artifact is the acceptance target

The frontend SHALL pass the pinned Node/npm fresh-install workflow, full
`npm run check`, and browser QA against the built `frontend/dist`. The artifact
SHALL keep one SPA HTML entry, only approved assets, no source maps, forbidden
fixture/prototype/test content, frontend statistical formulas, direct Bangumi
API upstream, or undeclared request/state layer, and SHALL keep initial
JavaScript gzip below the existing 350 KiB ceiling.

#### Scenario: Clean candidate is built

- **WHEN** dependencies are freshly installed with the pinned toolchain and `npm run check` runs
- **THEN** type, architecture, wire drift, unit, build, artifact, and size gates all pass without changing package manifests or the lockfile

#### Scenario: Production-only defect exists

- **WHEN** the development server passes but the built artifact or production preview violates a gate
- **THEN** the candidate remains unaccepted until the production failure is fixed and regressed
