## 1. Implement
- [x] 1.1 Align section titles/tag label columns and durable design guidance.
- [x] 1.2 Keep Header accessible through person drawer lifecycle, mode switch and keyboard navigation; update regressions.
## 2. Verify
- [x] 2.1 Run focused checks/build, desktop/mobile browser QA and diff check; record full gate outcome.
- [ ] 2.2 Sync specs and archive only after acceptance.

## Evidence (2026-09-08)
- Strict change validation passed. Person-detail lifecycle regression passed; integration regression passed using real transitions and 10s async surface readiness wait (CLI test timeout 30s). Typecheck + production Vite build passed. Owned git diff --check passed.
- Live 390/715/1200px: co-star titles 18px; person titles 18px at tested drawer widths; four-character tag label tracks ~48px with 8px gaps, no horizontal overflow. Pointer Header switch closes drawer; Shift+Tab reaches Header and ArrowRight switches mode, leaving focus at mode-tab-co-star and page non-inert after close.
- Full npm run check is blocked by pre-existing frontend/vite-dev.err.log and vite-dev.out.log persistent inventory entries. No logs deleted or unrelated repairs made. Specs synchronized; archive remains pending full acceptance. No commit/push/deploy/service mutation.
