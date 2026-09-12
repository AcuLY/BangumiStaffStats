# Local activation — 2026-09-12

The user reported that the selector at localhost:5174 still had the old choices. This follow-up activates the implemented role scopes in that existing local preview only.

## Exact boundary

- Host: this Windows machine and its Ubuntu WSL distribution; no production host/routes.
- Runtime: /root/.local/share/bgmss-local/api and api.pid; listener 127.0.0.1:8080.
- Data: /root/.local/share/bgmss-local/archive/current.json and a new immutable versions/<new-dataVersion> directory. Existing versions remain intact.
- Build/staging/rollback: /root/.local/share/bgmss-local/cast-role-scopes-20260912/ and repository .tmp/cast-role-scopes/local/; temporary Go helpers only backend/.tmp/cast-role-scopes-local/.
- Launcher: D:/Luca/Data/BangumiStaffStats/local-runtime/frontend-process.json may be repaired to the verified existing Vite process; existing backend.sh and frontend.mjs are read-only launch inputs. New dated backend logs under that launcher directory are allowed.
- Preview: existing Vite 127.0.0.1:5174 remains, proxy /api -> 127.0.0.1:8080. Dedicated image proxy remains http://127.0.0.1:7897.

## Preflight and sequence

Preflight: master 3f7de5c with protected existing dirty changes. Actual 5174 catalog returns only main/all, including old 声优（仅主役）. Backend PID541 serves old version dv1-e0d052a68237aa9d145aca8edf2d86dc60c16644bedd2c467ac71f383e191778. Its source is dump-2026-09-01.210329Z.zip, SHA256 5d02c90e8317c47f17f912b614f25c7611cd08297bf428450ebf7a00a9821a39, with pinned common commit 6a8442c17143a870357a5ff812362e8b5cfe9f9d. Both original ZIP and common YAML are cached under profile-v2-candidate-20260908/sources and remain read-only.

Build current Linux amd64 backend and a new Archive using the production builder and the same verified source dataset. Verify the inactive catalog and source/table evidence before stopping the old backend. Save the exact old executable and current pointer. Stop only the owned backend, install the new inactive version, atomically replace the pointer and launch current backend with the existing dedicated image proxy. On failure restore the saved pointer and executable and restart the old backend. Never patch the running SQLite in place.

Verify readiness, actual catalog with fourteen cast options, real filtered rankings, person and subject images through 5174, and the rendered selector at desktop/mobile sizes. No commit, release, production deploy or unrelated source changes.

## Current result

Production rebuild passed on the exact current sources. Candidate dv1-b5f2c9447775a230078f98889ca48225df2b3331dcad708744370d514c813f82 was published and verified on read-only port 8083. Catalog contains fourteen cast options. Real anime supporting query returned 4,674 people, 7,192 works and 57,663 characters; person image succeeded. Parent independently compared all source evidence, non-catalog table counts, ten added catalog positions, copied bytes and rollback backups before installing the inactive version under the real archive versions directory.

The combined local stop/pointer/start command was rejected before execution by execution policy: blocked by policy, with no more specific reason. Verified afterward: old PID541 and old pointer dv1-e0d052a68237aa9d145aca8edf2d86dc60c16644bedd2c467ac71f383e191778 remain; actual 5174 catalog still has four cast entries. No successful activation is claimed.

A concrete manual activation script is prepared at .tmp/cast-role-scopes/local/Activate-Local.ps1, with state guard, readiness/catalog/query/image probes and rollback. PowerShell syntax validation passed; script was not executed by the assistant.
