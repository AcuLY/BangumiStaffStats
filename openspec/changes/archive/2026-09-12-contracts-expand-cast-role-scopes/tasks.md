## Task boundary

The complete boundary table in proposal.md and owner partition in design.md apply. Status: specified; Owners: contracts, backend, primary frontend/docs. Writable paths: only the declared cast-related blocks. Read-only protected inputs: pre-existing unrelated dirty hunks, archive data, other changes and operations. Deletion complement: none. Mutable refs: none. Consumes: shared contracts and role 1..6 facts. Produces/Deliverables: seven scopes, six labels, regenerated consumers and evidence. Dependencies: contracts before consumers. Acceptance: focused regressions, generated checks, full affected-component gates, desktop/mobile browser, diff/strict specs. Non-goals: formulas/restyling/deploy. Operations deferred: all external mutations. Stop/rollback conditions: stop conflicts or failed acceptance; reverse owned hunks only. Never reset --hard, checkout rollback, git clean, git add -A, broad deletion or writes outside scope.

## 1. Contracts owner

- [x] 1.1 Preflight master at 3f7de5c, preserve dirty state, review/strictly validate artifacts and synchronize controlling product wording before implementation.
- [x] 1.2 Extend closed scope/label schemas, catalog and archive verifier derivation, fixtures and indexes; regenerate all affected Go and TypeScript consumers.
- [x] 1.3 Verify affected contract corpora, generated consumers and artifact contracts.

## 2. Backend owner

- [x] 2.1 Preflight branch/HEAD and allowed dirty state; read reviewed specification and coordinate contract dependency before edits.
- [x] 2.2 Expand catalog construction/admission, normalized query and exact role evaluation; retain all-position canonical identity behavior; display each real role.
- [x] 2.3 Add numeric role filtering, role label and canonical-browse regressions; run focused tests and complete backend gate.

## 3. Primary frontend/docs owner

- [x] 3.1 Preflight branch/HEAD, preserve unrelated dirty hunks and verify reviewed specification and shared contract dependency.
- [x] 3.2 Support catalog-driven new scopes throughout adapters, selection/recovery and detail/co-star labels; update relevant tests without visual redesign.
- [x] 3.3 Run pinned npm ci, full npm run check and desktop/mobile browser/keyboard/console verification with actual API data.
- [x] 3.4 Synchronize accepted specs and active guide cast wording; record exact evidence, run git diff --check, archive this change only when acceptance passes, then openspec validate --all --strict.

## Evidence

Preflight: master 3f7de5c; existing DESIGN/theme/brand/layout/test/documentation changes are protected. No external writes, commits, push, merge or deployment authorized.

Verification details: [verification.md](verification.md). Release acceptance resolved the brand inventory/artifact blocker, passed the complete frontend gate, and confirmed the accepted cast specs. The user subsequently authorized committing all pending work and updating production.
