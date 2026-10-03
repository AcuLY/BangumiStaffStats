## 1. Contract and review
- [x] 1.1 Inspect existing query, cache, transport, UI and workflow boundaries and agree optional POST SSE protocol.
- [x] 1.2 Review proposal/design/specs/tasks and pass strict validation before implementation.
## 2. Implementation
- [x] 2.1 contracts: declare event schemas and framing while preserving default JSON.
- [x] 2.2 backend: instrument collection pages and analysis, cache hits, bounded shared-worker reporting and streaming cancellation/error lifecycle.
- [x] 2.3 frontend: parse SSE in client, show Chinese phase-local progress and isolate request lifecycle.
## 3. Acceptance
- [x] 3.1 Run focused transport, cache, cancellation and frontend lifecycle regressions.
- [x] 3.2 Run complete affected component checks, contract tests and built browser QA; record limitations.
- [x] 3.3 Sync capability specs and archive after implementation validation; inspect diff hygiene.

## Delivery boundary (after implementation archive)

Commit exact owned paths, push topic, verify exact-commit repository CI before any master merge; report bundle and deployment separately. External delivery is recorded in the final handoff and PR, not asserted complete by local implementation tasks.

## Verification evidence

2026-10-03: backend complete scripts/check.sh PASS (ordinary mode, real pinned Go1.26.5 copied into disposable module cache; temporary npm lock tarball mirrors replaced with official registry while preserving version/integrity; no tracked tooling changes). Includes generated-wire drift, complete test/race/vet/build/CGO0/module verification/inventory cleanup. Final focused race regression PASS for subscriber sequence admission and cache-hit progress.
Frontend npm run check PASS (56 files, 946 tests, production build and 8 artifact tests); final focused 38 tests plus build/artifact PASS. Contract artifact tests 51 PASS. OpenSpec strict pre-apply and all 101 active spec/change items PASS. Chromium actual component/client and built App SSE fixtures cover unknown/measured totals, cancellation, EOF, retry, completion and mobile/desktop light/dark; no page errors. Visual menu stress fixture (16 cases) and character long-image/empty/compact cases pass. Current live Bangumi CSS fetch is blocked (proxy403), and real iPhone/WebKit and deployment are not verified. Reproducible evidence is outside source at /workspace/bugfix-evidence; PR/final handoff tracks CI and merge separately.
