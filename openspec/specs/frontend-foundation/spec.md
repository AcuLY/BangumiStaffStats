# frontend-foundation Specification

## Purpose
Define the clean-room Vue SPA, feature-first ownership boundaries, strict
transport and generated query wire, and rendered quality gates without claiming
that the empty foundation already has final feature or oracle fidelity.
## Requirements
### Requirement: The frontend SHALL be one clean-room single SPA

The foundation SHALL contain one `index.html`, one Vue mount, one Pinia root,
one Naive provider chain, one bootstrap-only store, and one semantic foundation
surface. It SHALL not copy prototype code, boot fixtures, add a second entry,
or claim final feature/oracle fidelity.

#### Scenario: Clean build mounts

- **WHEN** the built app loads at `/`, `/ranking`, or `/co-star`
- **THEN** the same foundation document SHALL mount one app root with title, main landmark, and ready state

#### Scenario: Prototype or duplicate shell appears

- **WHEN** another entry/mount/provider/state system or workbench/fixture path is introduced
- **THEN** architecture or artifact acceptance SHALL fail

### Requirement: Feature-first ownership SHALL be executable

Shared code SHALL not import app/api/features; API code SHALL not import app or
features; only the query wire adapter may import generated types; only the
client may call fetch; components SHALL not call fetch/import generated DTOs;
leaf components SHALL not import stores. Pinia and Naive UI SHALL be the only
application state and component systems.

#### Scenario: Initial ownership is narrow

- **WHEN** the architecture check inspects the foundation
- **THEN** every import, store, fetch call, generated-type use, and provider SHALL have one approved owner

#### Scenario: A leaf bypasses its owner

- **WHEN** a component/store/shared module calls fetch, imports wire types, creates a second state system, or reverses the graph
- **THEN** the architecture check SHALL fail with the offending path

### Requirement: Native fetch SHALL have one endpoint-free transport owner

The sole client SHALL accept injected fetch and only safe relative same-origin
`/api/` references, keep response bodies `unknown`, and require a decoder. It
SHALL reject absolute, scheme-relative, credential-bearing, escaped, ambiguous,
or non-API references before fetch and SHALL define no real endpoint/retry/auth
or host.

#### Scenario: Relative API request is accepted

- **WHEN** a valid `/api/` reference and injected fetch are supplied
- **THEN** the client SHALL send the requested method/body/headers/signal and return decoder output

#### Scenario: Unsafe reference is supplied

- **WHEN** the reference is absolute, upstream, path-escaping, ambiguous, or outside `/api/`
- **THEN** the client SHALL fail before invoking fetch

### Requirement: Query wire generation SHALL be deterministic and types-only

Exact `@hey-api/openapi-ts@0.99.0` with only bundled
`@hey-api/typescript` SHALL generate exactly
`src/api/generated/query-wire/types.gen.ts` from the shared OpenAPI authority.
The output SHALL cover all 17 named components and include no SDK, client,
runtime, schema copy, index barrel, store, or business logic. Configuration
SHALL set `entryFile: false`, `clean: true`, `source: false`, the `.gen`
filename suffix, `enums: false`, and `topType: 'unknown'`.

#### Scenario: Generated types are current

- **WHEN** check mode regenerates from the unchanged contract
- **THEN** the result SHALL contain the exact component inventory and byte-match the committed file

#### Scenario: Generation drifts or expands

- **WHEN** a component is missing, bytes differ, or another generated artifact/runtime appears
- **THEN** acceptance SHALL fail

### Requirement: The wire adapter SHALL reject incompatible unknown values

The sole adapter SHALL compile the authoritative JSON Schemas with strict Ajv
2020-12/formats, accept `unknown`, return generated-type-derived validated wire
aliases only after structural success, and map failure to bounded decode errors.
It SHALL not normalize, digest, interpret catalog membership, compute
statistics, or expose wire values directly to UI/store code.

#### Scenario: Shared positive values are consumed

- **WHEN** the declared query/error/view/share positive cases run
- **THEN** each SHALL validate and return the corresponding typed wire value

#### Scenario: Structural negative runs

- **WHEN** an unknown/forbidden field, unsafe integer/page, unsupported/malformed share, invalid UTF-8/JSON, or trailing-data case runs
- **THEN** the matching decoder SHALL reject it without mutating the input

### Requirement: Dependencies SHALL be exact and compatible with TypeScript 6

The lock SHALL contain the exact runtime/development dependency set declared in
design, Node `24.18.0`, npm `11.16.0`, and TypeScript `6.0.2`.
`package.json` SHALL override transitive `js-yaml` to exact `4.3.0`, and a clean
audit SHALL report zero known vulnerabilities.
`openapi-typescript`, Axios, router, auto-import/component plugins, vfonts, SVG
loader, Playwright, and undeclared packages SHALL be absent.

#### Scenario: Clean locked install succeeds

- **WHEN** `npm ci` runs with Node/npm 24.18.0/11.16.0 and frontend-local cache/temp
- **THEN** exact dependencies SHALL install, audit cleanly, and package scripts SHALL resolve the accepted Node

#### Scenario: Toolchain or dependency drifts

- **WHEN** a version/source/lock/engine/peer range is incompatible or an undeclared package appears
- **THEN** acceptance SHALL fail rather than silently updating

### Requirement: Production artifacts SHALL remain fixture-free and bounded

The build SHALL emit one HTML entry, no source map or test/fixture/user snapshot,
no prototype/workbench/fixed-user marker, no direct upstream URL/Axios, and no
frontend statistical formula. The reachable initial JavaScript gzip SHALL be
below 300 KiB.

#### Scenario: Production artifact passes

- **WHEN** artifact and bundle checks inspect a clean build
- **THEN** one HTML entry and the bounded fixture-free chunk graph SHALL pass

#### Scenario: Forbidden content is bundled

- **WHEN** another HTML, fixture, prototype marker, upstream URL, source map, or statistical implementation is reachable
- **THEN** acceptance SHALL fail

### Requirement: Browser and Impeccable acceptance SHALL be proportional

Loopback preview at `/`, `/ranking`, and `/co-star` SHALL be checked at 360px
and 1440px for mount/title/main/ready state, overflow, duplicate IDs, console
errors, unhandled rejections, failed resources, and business/API/upstream
requests. The owner SHALL use the route Operate surface and v4 new-work/operate/
craft-floor guidance; a separate finish reviewer SHALL inspect rendered
evidence. The sidecar SHALL remain unchanged and stale until later hardening.

#### Scenario: Foundation preview is clean

- **WHEN** all paths/viewports are loaded from the production preview
- **THEN** foundation assertions SHALL pass with no console/network/overflow/accessibility defect

#### Scenario: Smoke is reported as final fidelity

- **WHEN** the empty foundation is presented as completed feature/oracle behavior or regenerates the sidecar
- **THEN** acceptance SHALL reject that claim

### Requirement: Tool state SHALL be local, clean, and path-disjoint

Frontend apply SHALL modify only `frontend/**` and its own task markers while
backend/updater owners may run in parallel. `node_modules`, `dist`, `coverage`,
`.cache`, and `.tmp` SHALL be the only disposable roots and SHALL be absent at
handoff. No operations or sibling/protected mutation is allowed.

#### Scenario: Three owners run in parallel

- **WHEN** each owner writes only its declared runtime root
- **THEN** the candidates MAY be implemented concurrently and accepted independently

#### Scenario: Tool state or another owner path is targeted

- **WHEN** frontend work writes elsewhere, retains disposable state, or attempts operations
- **THEN** apply SHALL stop without broadly cleaning unrelated paths
