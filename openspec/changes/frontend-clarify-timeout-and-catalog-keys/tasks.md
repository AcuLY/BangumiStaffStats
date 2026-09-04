## Task Boundary

| Field | Boundary |
|---|---|
| Status | Local investigated/specified/implemented/focused-verified states only |
| Owner | Frontend; primary agent owns planning and final acceptance |
| Writable paths | Exact proposal paths except the transferred positions-list inline-start padding/alignment-test slice; affected root specs at later sync/archive |
| Read-only protected inputs | PRODUCT/DESIGN/sidecar, QueryEditor/query state, generated DTOs, Backend/contracts/updater/Archive, original worktree, remotes/hosts/production |
| Deletion complement | Preserve all Catalog entries/groups/shortcuts/values/tags, API behavior, generated files, tests, and unrelated work |
| Mutable refs | Current local topic worktree only; no remote ref |
| Consumes | Catalog groups/positions, PositionKey, compact media contract, Naive UI public APIs, stable error codes |
| Produces | Unique occurrences, hierarchical responsive browser, canonical flat search, factual timeout copy |
| Dependencies | Accepted frontend capabilities and native local Backend; no new package |
| Deliverables | Focused tests/build/layout/browser evidence and strict OpenSpec |
| Acceptance | Groups only disclose; canonical copies/search/tags/exclusivity sync; desktop portal; compact inline 44px/overflow-safe; timeout copy distinct |
| Non-goals | Catalog/wire/Backend/timeout/query/result/theme/dependency changes or group cascade |
| Operations deferred | Full accumulated gate, root sync/archive, commit/push/PR/release/deploy/host mutation |
| Stop/rollback conditions | Stop on overlap, state/key/tag drift, selectable groups, inaccessible interaction, overflow/clipping, hover-only behavior, or failed focused checks; restore exact Frontend files only |

Forbidden: reset/checkout rollback, git clean, `git add -A`, broad deletion,
external writes, generated DTO edits, or production operations.

## 1. Planning and preflight — owner: primary agent

- [x] 1.1 Verify branch/HEAD, preserve pre-existing Backend/frontend work, and
  keep the original worktree plus external runtimes read-only.
- [x] 1.2 Review the original identity/timeout artifacts against PRODUCT,
  DESIGN, Naive UI 2.44.1, and root specs before its first apply.
- [x] 1.3 Reconcile the user-authorized hierarchy/compact delta into all four
  artifacts, inspect the independent-PositionSelector implementation boundary,
  and require strict validation plus zero unresolved P0/P1 before new code.

## 2. Frontend implementation — owner: Frontend

- [x] 2.1 Give flat selector occurrences unique group-scoped internal values,
  canonical add/remove mapping, synchronized copies, one tag, and unchanged
  exclusivity/order.
- [x] 2.2 Extend registered selector tests for unique occurrences, repeated
  copies, synchronized select/remove, one tag, and exclusivity.
- [x] 2.3 Split `UPSTREAM_TIMEOUT` from unavailable/protocol branches in all
  five adapters and update exact API tests.
- [x] 2.4 Replace the flat Select with project-owned PositionSelector trigger
  and PositionCatalogBrowser using one responsive public Popover presentation;
  implement category disclosure, occurrence state, bounded list,
  Escape/focus, keyboard/touch targets, and no hover-triggered behavior.
- [x] 2.5 Replace Select-specific tests with focused hierarchy/search tests that
  retain every identity/canonical/tag/exclusivity assertion and add desktop/
  compact shell plus accessibility behavior.
- [x] 2.6 Use NPopover clickoutside for responsive outside-pointer dismissal;
  preserve focus/selection for inside versus outside activation.

## 3. Automated and rendered acceptance — owner: primary agent

- [x] 3.1 Run the original focused selector/API suite, Vue typecheck, Vite
  build, wire/Unicode drift checks, and diff check; stop the known Windows full
  gate false positives per the user's batching preference.

  Evidence: original focused Vitest passed 66/66, `vue-tsc` and production
  build passed, generated wire/Unicode drift checks passed, and diff check was
  clean. The full gate was not treated as green because of the known Windows
  architecture-path false positive and unrelated `app.mount` timeout.
- [x] 3.2 Browser-check the original complete Catalog identity correction and
  confirm one canonical tag plus no duplicate-key warning.
- [x] 3.3 Verify all five timeout/unavailable messages through focused adapter
  tests without changing status/code validation.
- [x] 3.4 Run the revised selector-focused Vitest, typecheck/build, Impeccable
  layout detector, strict validation, and diff check; browser-check browse,
  search, duplicate synchronization, Escape/focus, 44px targets, scroll/width,
  and console state at 1440, 781, 780, 779, 390, and 320px without expanding
  to the complete accumulated Frontend gate.

  Evidence: revised hierarchy Vitest passed 10/10; Vue typecheck and Vite
  production build passed; Impeccable layout detection returned `[]`; strict
  OpenSpec validation and `git diff --check` passed. Browser checks showed the
  anchored body portal at 1440/781/780 and responsive panels at 779/390/320 content
  widths. At 390px trigger/search/category/position targets measured 44px,
  panel and trigger widths matched, the panel preceded the Query footer, and
  neither panel nor document overflowed horizontally. One hovered duplicate
  stayed occurrence-local, two director copies synchronized to one canonical
  Tag, “总导演” returned one result with both parent groups, Escape restored the
  trigger without closing Query Editor, and a fresh tab logged no warn/error.
  The IAB's classic 10px scrollbar plus the pre-existing `min-width: 320px`
  shell requires a 330px outer viewport to expose an exact 320px content width;
  at that accepted content width document and panel overflow were both zero.
- [x] 3.5 Extend the focused selector test and fresh-browser evidence for inside
  interaction staying open, outside interaction closing without focus theft,
  and zero warn/error at desktop and compact widths.

  Evidence: 11/11 focused hierarchy tests cover compact document pointer and
  desktop NPopover clickoutside. At 585px a real inside selection kept the
  browser open, outside “作品范围” activation reduced panel count 1 -> 0 without
  selection loss, and the subsequent query completed with no console warning/
  error.

## 4. Lifecycle closeout — owner: primary agent

- [ ] 4.1 In the later accumulated batch, audit exact scope, run the complete
  applicable gate, sync three root specs, archive this change before the query-
  panel layout change, validate all strictly, and report commit/push/release/
  deploy as not done unless separately authorized.
