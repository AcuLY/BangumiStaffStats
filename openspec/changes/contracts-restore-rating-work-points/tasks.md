## 1. Contract and backend
- [x] 1.1 Extend quarter work evidence schema, fixtures and generated consumer; verify contracts.
- [x] 1.2 Produce stable per-work points and preserve deep clone/cache accounting; verify backend.
## 2. Presentation
- [x] 2.1 Restore individual scatter points, work tooltip and Chinese seasons; reconcile design and backend guide.
- [ ] 2.2 Run focused regressions, affected gates and desktop/mobile keyboard/browser QA.
## 3. Completion
- [ ] 3.1 Review owned diff, sync specs and archive; accurately record implementation and validation status without commit/deploy claims.

## Verification and runtime handoff (2026-09-08)

- Implemented contract/producer/consumer. Contracts: 13 goldens + 11 invalid variants pass; generated person-detail drift check passes. Backend persondetail/statistics tests pass on Go 1.26.5. Frontend person-detail components: 23 pass; typecheck + Vite production build pass on Node 24.18.0. Linux API candidate builds successfully at `.tmp/rating-work-points/api-linux`.
- Full frontend check fails on existing `vite-dev.err.log`/`vite-dev.out.log` inventory. Full frontend tests: 472 pass, 3 fail (app.mount timeout, co-star integration timeout, existing ranking compact CSS expectation). Backend full check fails at missing `shasum` in Git Bash. No unrelated repairs performed.
- Local runtime: original WSL API binary backed up and byte-compared at `/root/.local/share/bgmss-local/api.before-rating-work-points-20260908`. Previous PID236569 stopped gracefully. Automatic tool approval rejected both candidate startup and old-binary rollback startup with `blocked by policy`, without a specific reason. API is left stopped pending user action. Archive/profile-v2 rebuild untouched; frontend remains running.
- User can start the candidate with `wsl -e bash /mnt/d/Luca/Data/BangumiStaffStats/local-runtime/backend.sh start /mnt/d/Luca/Code/MyProject/BangumiStaffStats/.tmp/rating-work-points/api-linux http://127.0.0.1:7897`. After startup, complete live per-work desktop/mobile tooltip/keyboard verification. Sync/archive remains pending; not committed, pushed, merged or deployed.
