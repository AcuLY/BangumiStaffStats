## Task boundary
| Field | Scope |
|---|---|
| Status | Explicitly authorized configuration repair |
| Owner | Primary, Operations |
| Writable paths | operations/compose.yaml; operations/test/runtime.sh; operations/README.md; this change; openspec/specs/operations-single-host-deployment/spec.md; myserver:/srv/bgmss-v2/compose/compose.yaml and named sibling temporary; /srv/bgmss-v2/backups/sqlite-temp-20260911; /srv/bgmss-v2/incoming/sqlite-temp-20260911; API container recreation only |
| Read-only protected inputs | Backend, Frontend, contracts, current image/release env, Nginx, Archive pointer and existing data; unrelated untracked README.md and docs/ |
| Deletion complement | No product deletion; replace only retired updater-only temp-directory wording; retain /tmp limits and all services |
| Mutable refs | Current master worktree, remote codex topic and PR integration |
| Consumes | Accepted ce4e34c API image, existing writable Archive mount, isolated disk-full reproduction and single-variable passing probe |
| Produces | Fixed Compose projection, regression and verified running configuration |
| Dependencies | Backend embedded builder and SQLite -> Operations mount/environment; no schema or statistical changes |
| Deliverables | Code/config, specification, tests, backup and deployment evidence |
| Acceptance | Strict specs; operations runtime tests; rendered Compose changes only API.SQLITE_TMPDIR; image-backed 32 MiB temp probe; running env/temp-file location; health, catalog, metrics and unchanged Nginx/other services |
| Non-goals | Logging-code redesign, memory/tmpfs expansion, new images, Nginx changes, manually activating or rolling back Archive data |
| Operations deferred | Full official Archive rebuilding continues in the existing background scheduler; configuration acceptance must not be mislabeled a completed full update |
| Stop/rollback conditions | Active config drift, unexpected rendered changes or failed health: restore exact Compose backup and recreate only API; preserve data. No reset --hard, checkout rollback, git clean, git add -A or broad cleanup |

## 1. Primary — repository repair
- [x] 1.1 Inspect branch/HEAD, dirty state, current host and exact isolated reproduction; protect unrelated files.
- [x] 1.2 Review artifacts and pass strict validation before editing.
- [x] 1.3 Add only the fixed API environment entry; update runtime regression, guide and accepted spec.
- [ ] 1.4 Validate rendered configuration, runtime tests and diff; exact-stage, commit, push and integrate through PR.

## 2. Primary — authorized configuration activation
- [ ] 2.1 Recheck image, live preimage, health and backup; validate only the declared environment delta.
- [ ] 2.2 Atomically replace Compose and recreate only API; verify process environment, health/catalog/metrics, Nginx and unrelated containers.
- [ ] 2.3 Verify actual temporary work uses Archive disk and exceeds the old limit; record background update state honestly, then sync/archive lifecycle evidence.
