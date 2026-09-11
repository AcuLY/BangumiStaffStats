# Local candidate boundary

Read-only existing runtime: Ubuntu PID 236569, `/root/.local/share/bgmss-local/api`, listening on `127.0.0.1:8080`, Archive `/root/.local/share/bgmss-local/archive`, current dataVersion `dv1-010b6ac8e419e72a443f8975781a7c441a759b5be64a41c9fedfb1e542c7a18a`. Its previous binary, SQLite, manifest and current pointer are protected. Windows frontend at 5174 remains unchanged by candidate preparation.

Exact source replay: `dump-2026-09-01.210329Z.zip`, 435891841 bytes, `sha256:5d02c90e8317c47f17f912b614f25c7611cd08297bf428450ebf7a00a9821a39`; common commit `6a8442c17143a870357a5ff812362e8b5cfe9f9d`, 37723 bytes, `sha256:0d5ac602157e33114029df611ea9dd46df32997e57c3a361b9e6f92250304394`. The seven extracted sources must match the existing manifest's exact size/digest values. No input refresh is included.

Disposable Windows source/helper files: `backend/.tmp/person-profile-v2/sources/{dump-2026-09-01.210329Z.zip,subject_staffs.yml,original-manifest.json}`, `backend/.tmp/person-profile-v2/{rebuild,serve}/main.go`, and compiled `rebuild-linux` / `serve-linux` binaries. These are local verification helpers using the production `archivebuild.RunOnce`, `VerifyAndExtract` and application server assembly, not new production commands.

Fresh Linux candidate root (verified absent before first use): `/root/.local/share/bgmss-local/profile-v2-candidate-20260908`. Permitted descendants: `sources/` with the three fixed source files, `archive/` for the builder's inactive version and isolated current pointer, `rebuild-linux`, `serve-linux`, copied helper sources/evidence and their logs/PID files. The candidate root has over 900 GB available. Its isolated API listens only on `127.0.0.1:8081` (verified free); no ArchiveUpdater is registered in this temporary validation process. A temporary frontend proxy may listen on `127.0.0.1:5181` (verified free), using the existing production Vite configuration and this isolated API.

The helper verifies original ZIP/common digests, delegates ZIP extraction to the production bounded extractor, verifies every source against the original manifest, then calls the production builder. It never edits existing published snapshots. Once successful, the isolated root may receive a pointer to the builder-published candidate for read-through testing. Existing active-pointer/binary activation is a separate final target/rollback review.

Verification-only exports and tooling are confined to `contract-check/export` and `contract-check/tooling` under the fresh Linux candidate root. They normalize text line endings in the copied inputs only and use a disposable Git fixture for artifact tests; they are not source branches/worktrees. No source or user Git refs are changed.

Rollback preparation may copy the existing API to `rollback/api` and its entire immutable Archive to `rollback/archive` under the same fresh candidate root. A short validation process may bind only unused `127.0.0.1:8082` with this copied binary/root. Its owned PID and logs remain below `rollback/`. This only proves recovery and does not alter or stop the active 8080 process.

## Authorized local activation

The user explicitly approved the presented local 8080 Backend/Archive switch with “好”. Activation writes are limited to `/root/.local/share/bgmss-local/api`, `api.pid`, a new immutable `archive/versions/dv1-e0d052a68237aa9d145aca8edf2d86dc60c16644bedd2c467ac71f383e191778/`, `archive/current.json`, and a same-directory temporary pointer used for atomic replacement. The existing `local-runtime/backend.sh` launcher is reused without changing it; new launch logs may be written inside the candidate root. The official `cmd/api` Linux/amd64 binary is rebuilt from the current shared source so the latest wire contracts remain aligned.

Final preflight: 8080 was no longer listening and its saved old PID was absent; 5174 frontend PID 34080 remained listening. The old active pointer still selected the original v1 snapshot. The candidate, private rollback copy, and isolated 8081 server remained available. The previous API backup SHA-256 remains `08c768009550f764f81cef3c160132f53192f072d679447cc9643de7a9a02a26`.

Rollback is to stop only the verified local API PID, restore `rollback/archive/current.json`, and launch the preserved `rollback/api` through the same local launcher. The old v1 version and the independent full rollback Archive remain retained. Only the local development runtime is activated; no production, Git integration or release action is authorized.

No recursive deletion or directory move is authorized by this document. Verification processes may be stopped only by their recorded owned PID. The 5174 frontend is reused without interruption.

Activation outcome: the new immutable version was staged, but automatic tool approval rejected both supported launch attempts before execution (`blocked by policy`, no more specific reason). The active pointer was restored atomically to the original v1 pointer, and the active/backup binary hashes match. 8080 was already stopped on entry and remains stopped; no unrelated process was killed. The approved activation is not complete and is blocked on launching the local Backend through an allowed/manual path.
