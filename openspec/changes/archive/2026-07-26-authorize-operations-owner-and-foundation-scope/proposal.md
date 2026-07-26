## Why

The development implementation is approaching deployable acceptance, and the
user has now explicitly reopened the operations work that the clean-room
baseline deferred. The repository governance still rejects every
`operations-` capability and does not distinguish isolated host validation from
live cutover, so operations work cannot begin safely under the existing rules.

## What Changes

- Add `operations-` as the fifth exclusive OpenSpec ownership prefix.
- Define operations ownership for repository deployment definitions, release
  assembly, backup/restore procedures, observability, and isolated host
  validation.
- Authorize writes to a dedicated non-live validation root on an approved host
  only when an operations change names the exact root and proves containment.
- Keep existing live Compose projects, Nginx routes, systemd units, data,
  volumes, secrets, ports, and legacy retirement protected behind a separate
  explicit cutover approval.
- Update the repository OpenSpec context and artifact rules to enforce this
  reopened but bounded scope.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `contracts-rewrite-baseline`: authorize the operations owner and define the
  boundary between isolated validation and live activation.

## Impact

| Field | Declaration |
|---|---|
| Status | Governance-only change; apply is blocked until all artifacts are strict-valid and approved by the main agent. |
| Owner | Main agent specifies, audits, and performs the bounded OpenSpec/config lifecycle update. |
| Writable paths | `openspec/config.yaml`; this change's artifacts, task markers, archive path, and synchronized `openspec/specs/contracts-rewrite-baseline/spec.md`. |
| Read-only protected inputs | All product source, tests, artifacts, active development changes, host state, deployment targets, remotes, and production state. |
| Deletion complement | No deletion outside the ordinary OpenSpec move from this active change to its dated archive. |
| Mutable refs | Current local branch through one governance commit only; no remote ref. |
| Consumes | The user's explicit operations authorization, current baseline governance, and the retained backend operations guide. |
| Produces | One exclusive `operations-` ownership prefix and a fail-closed isolated-validation/live-cutover boundary. |
| Dependencies | Existing single-root OpenSpec governance and strict OpenSpec validation. |
| Deliverables | Updated root OpenSpec context, synchronized baseline capability, dated archive, and a local governance commit. |
| Acceptance | Strict validation before and after sync/archive; exact diff, status, and whitespace checks. |
| Non-goals | Product implementation, deployment definitions, host writes, remote mutation, release, activation, cutover, or legacy retirement. |
| Operations deferred | Only live activation, route/service replacement, production data mutation, destructive rollback, and legacy retirement remain deferred pending an exact later approval. |
| Stop/rollback conditions | Stop on overlapping writes, an ambiguous host target, any product or external mutation, validation failure, or unexpected diff; preserve the worktree without reset, checkout rollback, or broad cleanup. |

This change touches no external repository or host. It does not authorize a
push, release, deployment, or production activation. Apply begins only after
proposal, spec, design, and tasks pass strict validation and main-agent review.
