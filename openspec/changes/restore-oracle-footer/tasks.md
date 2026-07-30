| Boundary | Declaration |
|---|---|
| Status | Implemented and statically audited; automated and built-browser acceptance remain pending. |
| Owner | Main agent under the approved small-change exception for source/style/test, review, acceptance, and lifecycle markers. |
| Writable paths | `frontend/src/app/App.vue`; footer-only declarations in `frontend/src/shared/styles/base.css`; one focused test below `frontend/tests/app/`; this file's task markers. |
| Read-only protected inputs | Product/design authorities, immutable oracle, every non-footer source/test, manifests, lockfiles, generated files, `.impeccable/design.json`, and unrelated worktree content. |
| Deletion complement | Only the exact unapproved sentence and superseded footer-only declarations. |
| Mutable refs | This file's task markers; Git lifecycle belongs to the main agent. |
| Consumes | Reviewed proposal, design, delta spec, oracle footer evidence, current SPA. |
| Produces | Owned footer candidate and exact automated/browser evidence. |
| Dependencies | Strict-valid reviewed OpenSpec; the small footer repair has one implementation owner. |
| Deliverables | Restored footer, focused test, full frontend check, built browser QA. |
| Acceptance | Commands and rendered checks in group 2; repository strict validation and diff audit by main agent. |
| Non-goals | New copy, new destinations, redesign, dependencies, APIs, data behavior, Impeccable regeneration, operations. |
| Operations deferred | No build release, deployment, route, or live-host mutation. |
| Stop/rollback conditions | Stop on branch/HEAD mismatch, undeclared dirty overlap, authority conflict, unexpected drift, or failed acceptance. Never use reset-hard, checkout rollback, Git clean, broad deletion, or `git add -A`. |

## 1. Frontend implementation

- [x] 1.1 Preflight on branch `codex/production-egress-and-footer`: record
  HEAD; confirm the only allowed dirty state is the main-agent-owned OpenSpec
  changes; confirm this change is strict-valid and reviewed; inspect the exact
  `App.vue`, footer CSS, oracle footer source/style, and candidate test file;
  stop on any mismatch.
- [x] 1.2 In `frontend/src/app/App.vue`, replace only the unapproved footer
  sentence with the oracle site-information nav, exact copy/destinations,
  separator, and safe external-tab attributes.
- [x] 1.3 In `frontend/src/shared/styles/base.css`, change only footer-owned
  rules necessary for centered wrapping, inherited semantic color, minimum hit
  targets, hover/focus visibility, and desktop/mobile oracle-compatible
  geometry.
- [x] 1.4 Add one focused test below `frontend/tests/app/` asserting the
  semantic nav, exact copy/destinations/external attributes, and absence of the
  unapproved sentence without coupling to private framework DOM.

## 2. Frontend acceptance and handoff

- [ ] 2.1 Run the focused footer test with a frontend-relative path, then run
  `cd frontend && npm run check`; record exact results and any existing
  non-blocking warning separately.
- [ ] 2.2 Serve the built `frontend/dist` and verify the footer in Light and
  Dark at representative desktop and 360px mobile widths: exact links/order,
  wrapping, focus, hover where observable, no horizontal overflow, no console
  errors, and no failed resources.
- [x] 2.3 Run `git diff --check` and inspect only the three owned implementation
  paths. Hand the unstaged candidate to the main agent with investigated,
  implemented, verified, committed, pushed, released, and deployed states
  stated separately.

## 3. Main-agent acceptance

- [x] 3.1 Audit the actual candidate against the oracle and reviewed
  artifacts, rerun proportional checks where needed, and confirm zero P0/P1
  findings.
- [x] 3.2 Run strict validation for this change and the repository, then mark
  implementation/verification status without claiming commit, merge, release,
  or deployment before those actions actually occur.
