## Task boundary
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

## 1. Primary — repository repair
- [x] 1.1 Inspect branch/HEAD, dirty state, current host and exact isolated reproduction; protect unrelated files.
- [x] 1.2 Review artifacts and pass strict validation before editing.
- [x] 1.3 Add only the fixed API environment entry; update runtime regression, guide and accepted spec.
- [x] 1.4 Validate rendered configuration, runtime tests and diff; exact-stage, commit, push and integrate through PR.

## 2. Primary — authorized configuration activation
- [x] 2.1 Recheck image, live preimage, health and backup; validate only the declared environment delta.
- [x] 2.2 Atomically replace Compose and recreate only API; verify process environment, health/catalog/metrics, Nginx and unrelated containers.
- [x] 2.3 Verify actual temporary work uses Archive disk and exceeds the old limit; record background update state honestly, then sync/archive lifecycle evidence.

## Verification and activation evidence — 2026-09-11

- Fix commit 85957f54afa1124390ed092541f3439f72f3711e was pushed and merged through PR #7 as b9889b4b897efd8fc9675d78667cedc591e980fa. Only Operations configuration/tests/docs and this specification changed; unrelated untracked README.md and docs/ were preserved.
- Operations runtime tests passed against the target Docker Compose. Canonical rendered old/new JSON differed only by services.api.environment.SQLITE_TMPDIR. Strict all-spec validation passed 95 items before archival; diff hygiene passed.
- The existing accepted ce4e34c production image failed the isolated 32 MiB SQLite temporary-table probe with default /tmp and passed with the single fixed environment value. No new application image was built or deployed for this repair.
- Exact server Compose SHA256 changed from 142aaecb996e155c5f60554df85fdb29e247d2cd74c357f037d267ec8a141e3f to 473ab9b7c01c257ddf94b731ac69e68f326c4a43ce6941a7c5b99c7d3be87a83. Backup: /srv/bgmss-v2/backups/sqlite-temp-20260911; admitted candidate and JSON comparisons: /srv/bgmss-v2/incoming/sqlite-temp-20260911.
- API alone was force-recreated at 2026-09-11T12:04:52Z. Running container environment contained SQLITE_TMPDIR=/var/lib/bgmss/archive. Image, frontend link, Nginx bytes, Prometheus and all non-API container IDs/images remained unchanged. livez, readyz, catalog, metrics, Prometheus scrape and journald checks passed.
- At 12:08:53Z the actual API child process held /var/lib/bgmss/archive/etilqs_2814c5e5c38a9566 (deleted), size 23,474,176 bytes, exceeding 16 MiB. Its /tmp filesystem still had all 4,096 blocks of 4,096 bytes free. The embedded update remained running beyond the original failure point; a growing candidate database was observed.
- Full official Archive rebuilding is still in progress at configuration acceptance. No completed activation or successful full update is claimed. The live pointer remains the validated schema 2 dv1-e0d052a68237aa9d145aca8edf2d86dc60c16644bedd2c467ac71f383e191778; it was never manually changed. Existing generic error logging was not changed by this configuration-only fix.