## Task Boundary

| Field | Declaration |
|---|---|
| Status | Governance-only; no operations apply is authorized by these tasks. |
| Owner | Main agent. |
| Writable paths | `openspec/config.yaml`; this change; synchronized baseline spec and dated archive. |
| Read-only protected inputs | Product/acceptance/CI changes, remotes, hosts, and production state. |
| Deletion complement | Only the OpenSpec active-to-archive move. |
| Mutable refs | Current local branch through a later governance commit. |
| Consumes | Approved proposal, design, delta spec, current root config/spec, and user authorization. |
| Produces | Strict-valid root governance with bounded operations ownership. |
| Dependencies | No overlapping write to the listed OpenSpec paths. |
| Deliverables | Updated context/rules, synchronized root spec, archive, and verification record. |
| Acceptance | Strict validation, exact diff/status inventory, and whitespace check. |
| Non-goals | Product or operations implementation, host mutation, deployment, release, activation, push, or legacy retirement. |
| Operations deferred | All live activation and destructive operations remain separately gated. |
| Stop/rollback conditions | Stop on unexpected dirty overlap, validation failure, ambiguous scope, or external mutation requirement. |

## 1. Governance update

- [x] 1.1 Preflight the branch and exact allowed dirty set; confirm this change
  overlaps no active implementation owner.
- [x] 1.2 Add `operations-` ownership and the isolated-validation/live-activation
  boundary to `openspec/config.yaml`.
- [x] 1.3 Strict-validate this change and all active changes; inspect the exact
  config/spec diff.

## 2. Lifecycle and acceptance

- [x] 2.1 Sync and archive the change, then strict-validate the synchronized
  baseline capability and all remaining active changes.
- [x] 2.2 Run `git diff --check`, verify no external state changed, and prepare
  only the governance lifecycle paths for an exact later commit.
