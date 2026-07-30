## Task Boundary

Apply only after the active co-star Group 1 owner releases shared frontend
paths. Preserve its accepted API/coordinator/feature work and stop on overlap.
Node commands use `/Users/luca/.nvm/versions/node/v24.18.0/bin`.

## 1. Restore existing surfaces

- [x] 1.1 Record branch/HEAD/dirty state and the audit matrix; confirm oracle
  `644b7748674e553f863d0ffd61d029f86fdc0717`, reviewed strict-valid artifacts,
  and explicit ownership handoff.
- [x] 1.2 Restore header and query-editor presentation and interaction while
  preserving production catalog, request, sharing, and resource semantics.
- [x] 1.3 Restore ranking and person-inspector presentation and interaction,
  including responsive Drawer, focus, Escape, inert, and invisible hit areas.
- [x] 1.4 Add focused regression tests and run targeted tests, typecheck,
  build, `git diff --check`, and strict change validation.
- [x] 1.5 Resolve acceptance-audit regressions: Drawer close preserves the
  selected person, profile positions remain stable across work views, timeline
  points expose 44px hits, character-appearance overflow is fully reachable,
  narrow ranking layout remains two-line, and Drawer has one scroll owner.
- [x] 1.6 Keep deferred person-detail loading/error presentation invisible
  until a person is actually selected and, on compact layouts, the Drawer is
  open; hidden preloading may continue and must not alter ranking geometry.

## 2. Accept compatibility

- [x] 2.1 Run the full Node 24 frontend check.
- [x] 2.2 Serve the production artifact and compare Light/Dark at 360, 390,
  779, 780, 1024, and 1440px for query, ranking, and person-detail states;
  verify keyboard/focus/Escape/inert, overflow, duplicate IDs, console,
  failed resources, and direct-upstream requests.
- [x] 2.3 Map every remaining visual/interaction difference to an explicit
  approved requirement, then hand the unstaged candidate to the main agent for
  acceptance, commit, and archive.
