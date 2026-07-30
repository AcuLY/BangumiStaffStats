## Capability Boundary

| Field | Contract |
|---|---|
| Status | Governance-only change; no operations implementation or host mutation is authorized by this delta. |
| Owner | Main agent specifies, audits, and performs the bounded OpenSpec/config lifecycle. |
| Writable paths | `openspec/config.yaml`; this change; synchronized `openspec/specs/contracts-rewrite-baseline/spec.md`; dated archive. |
| Read-only protected inputs | Product code, tests, artifacts, active development changes, remotes, hosts, and production state. |
| Deletion complement | Only the active-to-archive move for this change. |
| Mutable refs | Current local branch through one later governance commit; no remote ref. |
| Consumes | Explicit user authorization, current baseline governance, and retained operations guidance. |
| Produces | Exclusive operations ownership and a fail-closed validation/activation boundary. |
| Dependencies | Single-root OpenSpec and strict validation. |
| Deliverables | Updated root context, synchronized baseline capability, and dated archive. |
| Acceptance | Strict validation before and after lifecycle, exact diff/status review, and whitespace check. |
| Non-goals | Product implementation, operations definitions, external writes, deployment, release, activation, or legacy retirement. |
| Operations deferred | Live activation, production route/service/data mutation, destructive rollback, and legacy retirement remain separately gated. |
| Stop/rollback conditions | Stop on overlap, unexpected diff, validation failure, ambiguous target, or any unapproved external mutation. |

## MODIFIED Requirements

### Requirement: Spec-first single-root governance
The repository SHALL use exactly one OpenSpec root at `openspec/`. Every
implementation change MUST use a capability id beginning with exactly one of
`contracts-`, `backend-`, `updater-`, `frontend-`, or `operations-`, and no
apply work may begin until its proposal, capability specs, design, and tasks
are complete, strictly valid, reviewed, and explicitly approved by the main
agent. The main agent owns decisions, coordination, specification audit, and
final acceptance. Subagents own substantive implementation when parallelism or
context isolation provides greater benefit than delegation cost; the main
agent MAY directly perform small bounded corrections and repository lifecycle
work under the same spec-first and acceptance gates.

#### Scenario: Baseline artifacts are ready for review
- **WHEN** `establish-formal-rewrite-baseline` is presented to the main agent
- **THEN** its proposal, `contracts-rewrite-baseline` spec, design, and tasks all exist and pass OpenSpec strict validation
- **AND** no apply or cleanup is represented as approved or complete

#### Scenario: Nested control plane is proposed
- **WHEN** a change or task proposes an `openspec/` root or generated OpenSpec skill set below `frontend/`, `backend/`, `updater/`, `contracts/`, `operations/`, `apps/`, or `packages/`
- **THEN** validation or review SHALL reject the change before apply

#### Scenario: Ownership prefix is ambiguous
- **WHEN** a capability id has no approved prefix or combines multiple owner prefixes
- **THEN** validation or review SHALL reject it before apply

## ADDED Requirements

### Requirement: Operations scope is reopened with external-state containment
The `operations-` owner SHALL own repository deployment definitions, immutable
release assembly, secret interfaces, observability configuration,
backup/restore procedures, and isolated deployment validation. It MUST consume
accepted product artifacts and contracts without changing their product
semantics. Each change MUST enumerate exact repository and external writable
paths, host identities, Compose projects, services, ports, volumes, and mutable
refs before apply.

An operations change MAY mutate an explicitly approved host only inside a
dedicated non-live validation root using uniquely named resources and
loopback-only non-conflicting ports. It MUST prove containment and absence of
collisions before the first write. Existing live project directories, Compose
projects, Nginx routes, systemd units, public ports, secrets, volumes, data, and
legacy processes SHALL remain read-only unless a later change receives explicit
activation or retirement approval naming those exact targets.

#### Scenario: Repository operations definitions are proposed
- **WHEN** a strict-valid `operations-` change declares exact deployment, recovery, monitoring, or release files within the repository
- **THEN** apply MAY create those files after main-agent approval
- **AND** product prerequisites remain assigned to their product owner

#### Scenario: Isolated host validation is approved
- **WHEN** an operations change names an approved host, a dedicated non-live root, a unique project identity, and loopback-only non-conflicting ports
- **THEN** apply MAY write only those declared validation resources after a read-only collision preflight succeeds
- **AND** it SHALL capture cleanup and non-interference evidence

#### Scenario: A live target would change
- **WHEN** a command would change an existing route, service, project, secret, volume, production data path, public port, or legacy process
- **THEN** apply SHALL stop before that mutation
- **AND** require a later explicit activation or retirement approval naming the exact target and recovery gate

#### Scenario: Ownership or collision cannot be proven
- **WHEN** an external path/resource is ambiguous, already owned, or conflicts with live state
- **THEN** validation SHALL stop without mutating the host
- **AND** preserve the discovered evidence for review
