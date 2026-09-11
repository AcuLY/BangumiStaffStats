## Context

Preflight master is 14c21ac with unrelated untracked README.md and docs/. Production API uses accepted image ce4e34c; Nginx root promotion is already live. Existing Compose SHA256 is 142aaecb996e155c5f60554df85fdb29e247d2cd74c357f037d267ec8a141e3f.

## Goals / Non-Goals
Restore disk-backed SQLite temporary work with one fixed environment value. Keep all security/resource/mount/network boundaries. Do not expand the tmpfs or change the database pointer manually.

## Boundary
| Field | Scope |
|---|---|
| Status | Implemented and activated; actual disk temporary work verified |
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

## Decisions
1. Set API.SQLITE_TMPDIR to its existing /var/lib/bgmss/archive writable bind, not an operator-supplied parameter. Prometheus receives no SQLite environment or Archive mount.
2. Keep /tmp at 16 MiB and the API root read-only. SQLite creates transient files on the data disk; immutable Archive content and normal activation remain Backend-owned.
3. Assert rendered API environment and Prometheus exclusion in the existing runtime gate. Verify the rendered old/new documents differ only by this environment entry before activation.
4. Save an exact change-specific Compose backup, verify its hash, atomically install the candidate, and use compose up --no-deps --force-recreate api. Keep the current image and frontend release; verify readiness/catalog/metrics and other container identities.
5. Observe SQLite temporary descriptors in the Archive mount and progress past the old 16 MiB failure. The full new Archive build may continue naturally; record its state honestly without adding a separate scheduler or manual pointer action.

## Risks / Trade-offs
Temporary work now uses free data-disk space, as intended. On regression restore the Compose preimage and recreate API; do not revert data. Existing generic error-code logging is not repaired in this configuration-only change.
