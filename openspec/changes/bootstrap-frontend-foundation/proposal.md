## Why

The formal rewrite has no frontend runtime. The prototype is an immutable
behavior/visual oracle, not a production codebase: it contains fixture boot,
multiple entries, broad shared state, direct request conventions, and mixed
component ownership. This change creates a clean single-SPA foundation and
proves the shared query wire can be generated and structurally validated under
the required TypeScript 6 toolchain.

## What Changes

- Create one Vue `3.5.40` SPA with one mount, one Pinia `4.0.2` root, one Naive
  UI `2.44.1` provider chain, and a bootstrap-only runtime store.
- Establish feature-first import/state/request ownership and one native-fetch
  client; add no business endpoint or query state.
- Replace TypeScript-5-only `openapi-typescript` with
  `@hey-api/openapi-ts@0.99.0`, using only its bundled
  `@hey-api/typescript` plugin to generate
  `src/api/generated/query-wire/types.gen.ts`; disable its index barrel and
  override vulnerable transitive `js-yaml@4.2.0` to `4.3.0`.
- Validate unknown query/error/view/share values through exact Ajv
  `8.20.0`/`ajv-formats` `3.0.1` schemas and direct shared golden cases.
- Pin Node `24.18.0`, npm `11.16.0`, TypeScript `6.0.2`, Vite `8.1.5`, and
  current compatible build/test/type dependencies.
- Add architecture, generated-drift, unit/contract, type, build, artifact,
  preview, responsive, console/network, cleanup, and Impeccable v4 gates.

Behavior classification:

- `PRESERVE_ORACLE`: the final outward behavior remains governed by PRODUCT,
  DESIGN, the route Operate surface, and oracle
  `644b7748674e553f863d0ffd61d029f86fdc0717`.
- `INTENTIONAL_DELTA`: prototype implementation structure is not retained; the
  first visible page is explicitly a neutral foundation shell, not a completed
  feature or visual redesign.
- `NEW_CAPABILITY`: single SPA, enforceable ownership boundaries, generated
  TypeScript 6 wire types, runtime structural validation, and clean quality
  gates.

## Capabilities

### New Capabilities

- `frontend-foundation`: Defines the formal SPA/toolchain, architecture and
  ownership rules, transport/wire adapter boundary, shared contract evidence,
  build/browser hygiene, and Impeccable handoff.

### Modified Capabilities

None.

## Impact

| Boundary | Declaration |
|---|---|
| Status | investigated: complete; specified: approved; implemented: no; verified: current dependency research, Node 24/TypeScript 6 codegen proof, final baseline rebind, main semantic review, targeted/all strict validation, and OpenSpec doctor passed; committed: planning status is determined by the containing Git history; pushed/released/deployed: no |
| Owner | Main owns spec, acceptance, lifecycle, and simple corrections. One frontend implementation subagent owns `frontend/**` and this change's apply task markers; a separate read-only Impeccable reviewer performs final visual review. |
| Writable paths | Planning: this five-file change. Apply: `frontend/**` and task checkboxes. Lifecycle: exact archive and `openspec/specs/frontend-foundation/spec.md`. |
| Protected inputs | `contracts/**`, root specs/archives, Node pins/spec, Impeccable skill/hook/PRODUCT/DESIGN/route surface/sidecar, backend/updater changes and outputs, `.vscode/**`, formal guides, oracle, remotes, and production. |
| Dependencies | Accepted query contract; Node `24.18.0`/npm `11.16.0`; Impeccable v4.0.2; exact dependency and override set in design. |
| Acceptance | Clean locked install and zero-vulnerability audit; deterministic 17-component types-only generation; architecture/client/adapter contract tests; typecheck/build/artifact gates; loopback browser checks at 360px/1440px with no console/request/overflow defects; Impeccable review; no transient residue. |
| Non-goals | Router/path semantics, Query Draft/Applied state, catalog/results/ranking/co-star/detail/share/theme/image/business UI, real API calls, statistics, fixtures/mocks, Playwright, sidecar regeneration, operations, or legacy deletion. |
| Stop conditions | Stop on contract/spec/tool/lock drift, overlapping writer, direct upstream/fixture/statistics code, duplicate owner/system, unexpected artifact/path mutation, or failed quality/visual gate. Preserve the bounded candidate; do not reset or broadly clean. |
