## Context

The root governance currently has four exclusive owners and globally defers
operations. The user has authorized completing the deferred operations work,
including validation on `myserver`, while that host continues to serve the old
project. The governance must therefore reopen operations without treating
validation as permission to mutate the live stack.

## Change Boundary

| Field | Declaration |
|---|---|
| Status | Governance-only and local until separately committed and pushed. |
| Owner | Main agent. |
| Writable paths | `openspec/config.yaml`; this change; synchronized baseline spec and dated archive. |
| Read-only protected inputs | Product code, active implementation changes, Git remotes, `myserver`, and all live state. |
| Deletion complement | Only the OpenSpec active-to-archive move. |
| Mutable refs | Current local branch through one later reviewed commit. |
| Consumes | User authorization, baseline rules, operations guide, and read-only host inventory. |
| Produces | Operations ownership and external-state containment rules. |
| Dependencies | Root OpenSpec CLI and current baseline capability. |
| Deliverables | Strict-valid governance artifacts and synchronized root context/spec. |
| Acceptance | Strict validation, exact lifecycle diff, `git diff --check`, and no external write. |
| Non-goals | Any production code, operations file, host change, live activation, or push. |
| Operations deferred | Cutover, live routing/service/data mutation, destructive rollback, and legacy deletion. |
| Stop/rollback conditions | Stop on validation failure, unexpected file, overlapping owner, or any command capable of mutating external state. |

## Decisions

### Add one exclusive operations owner

`operations-` is a peer ownership prefix, not a full-stack escape hatch.
Operations may consume immutable product artifacts and contracts but may not
change their semantics. Product prerequisites discovered by deployment remain
owned by `backend-`, `frontend-`, `updater-`, or `contracts-` changes.

### Separate repository definitions, isolated validation, and activation

An approved operations change may:

1. add repository-owned deployment and recovery definitions;
2. build a closed release input from immutable accepted artifacts; and
3. write only to an exact dedicated validation root on an explicitly approved
   host, with a unique Compose project, loopback-only non-conflicting ports,
   and no edits to existing Nginx/systemd/live project paths.

Activation is a distinct state transition. Changing an existing route, service,
volume, secret, production data path, public port, or legacy project requires a
later exact approval and pre-change recovery evidence.

### Keep external writes fail-closed

Every operations change must enumerate host paths, services, projects, ports,
volumes, and mutable refs. Read-only discovery does not imply write authority.
Any collision or inability to prove ownership stops before the first host
mutation.

## Dependency Direction

```text
accepted product artifacts and contracts
                ↓
repository operations definitions
                ↓
dedicated isolated host validation
                ↓
separately approved live activation
```

## Risks / Trade-offs

- A separate activation approval adds a deliberate gate, but prevents an
  isolated test from silently becoming a production cutover.
- A fifth owner adds governance surface; exclusive prefixes and exact writable
  paths prevent it from absorbing product implementation.

## Migration Plan

1. Update root context and artifact rules.
2. Sync and archive this governance delta.
3. Propose product deployment prerequisites under their product owners.
4. Propose repository operations definitions under `operations-`.
5. Validate on a dedicated host root; leave the old stack untouched.
