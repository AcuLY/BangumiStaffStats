## Capability Boundary

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

## MODIFIED Requirements

### Requirement: Production updater SQLite temporary storage SHALL use the Archive disk

The production API, which owns the embedded Go Archive updater, SHALL set exactly SQLITE_TMPDIR=/var/lib/bgmss/archive. SQLite file-backed temporary tables and indices SHALL use the existing writable disk-backed Archive bind instead of the 16 MiB /tmp tmpfs. Prometheus SHALL receive no SQLITE_TMPDIR or Archive mount. The API root filesystem, /tmp size, resource/security controls, network and Backend publication transaction SHALL remain unchanged.

#### Scenario: Embedded updater projection
- **WHEN** production or validation Compose is rendered
- **THEN** API SHALL receive the fixed Archive-disk SQLITE_TMPDIR and Prometheus SHALL not receive it
- **AND** both services SHALL retain their existing image, resource, mount and network boundaries

#### Scenario: Temporary work exceeds the tmpfs budget
- **WHEN** SQLite writes file-backed temporary work larger than 16 MiB
- **THEN** it SHALL use the Archive disk without exhausting the bounded /tmp mount

#### Scenario: Configuration repair is activated
- **WHEN** the authorized host receives the verified configuration
- **THEN** only API SHALL be recreated using its current accepted image, health SHALL recover, and Nginx, frontend, unrelated services and manually selected Archive data SHALL remain unchanged

#### Scenario: Configuration or acceptance fails
- **WHEN** the live preimage drifts, rendered changes exceed the single environment entry, or health fails
- **THEN** activation SHALL stop or restore the exact Compose preimage and API; it SHALL not change Archive data to force success
