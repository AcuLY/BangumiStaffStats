## Context

The clean branch has no `frontend/`. The prototype oracle demonstrates the
approved final outward result but also contains implementation patterns that
must not become the formal architecture. The accepted OpenAPI/JSON Schema query
bundle is the sole wire authority. Node `24.18.0` and Impeccable v4.0.2 are the
accepted frontend tooling baseline. The shared Wave 1B planning checkpoint is
based on `acb722cc25b344f85feb3c0f5fb081d3e3702e89`.

| Boundary | Declaration |
|---|---|
| Status | investigated: complete; specified: approved; implemented: no; verified: current dependency research, Node 24/TypeScript 6 codegen proof, final baseline rebind, main semantic review, targeted/all strict validation, and OpenSpec doctor passed; committed: planning status is determined by the containing Git history; pushed/released/deployed: no |
| Owner | One frontend subagent writes `frontend/**`; main owns planning/acceptance; a separate reviewer owns read-only Impeccable finish review. |
| Scope | Production-shaped empty SPA, enforceable source boundaries, TypeScript wire generation/validation, and build/browser quality gates. |

## Goals / Non-Goals

Goals:

- one installable/buildable/directly previewable Vue SPA;
- one state, component-provider, and request ownership model;
- deterministic TypeScript 6-compatible shared-wire types;
- structural runtime decoding and direct shared-golden tests;
- clean artifact and proportional rendered evidence.

Non-goals:

- production feature routes or redirects, query state/catalog/results/sharing,
  theme persistence, images, statistics, real API calls, fixture/dev mock
  infrastructure, full oracle recreation, Playwright, sidecar regeneration, CI,
  container, deployment, or migration.

## Decisions

### Use one entry, mount, provider chain, and bootstrap store

The entry is:

```text
frontend/index.html -> src/app/main.ts -> App.vue -> AppProviders.vue
```

`main.ts` creates one Pinia root and mounts once. `AppProviders.vue` owns the
Naive provider chain. `src/app/store/runtime.ts` owns only stable bootstrap
ready/failure state, not query, catalog, ranking, selection, result, route, or
theme data.

The foundation surface is semantic and neutral, with document title, one
`main`, one app root, and an app-ready marker. Vite fallback may serve it at
`/`, `/ranking`, and `/co-star`; real route semantics belong to the query-shell
change.

### Enforce feature-first dependencies

Initial source roots are `app`, `api`, and `shared`; feature roots appear only
with actual features. The enforced direction is:

```text
app/future features -> API operation mapper -> query wire adapter -> generated types
                                          \-> one native-fetch client
shared -> no app/api/feature imports
```

Only `src/api/client.ts` may call native fetch. Only
`src/api/adapters/queryWire.ts` may import generated wire types. Vue components
never call fetch or import generated DTOs; leaf components do not import stores.
Pinia is the only app state system; Naive UI is the only component system.

Architecture checks reject Axios, direct Bangumi URLs, prototype/workbench
paths, fixture boot, `useWorkbench`, a second HTML/mount/provider/request/state
system, nested OpenSpec, and production statistical formulas.

### Keep transport policy centralized and endpoint-free

`src/api/client.ts` accepts injected fetch, relative same-origin `/api/` URLs,
method/body/headers/signal, and a caller decoder. It rejects absolute,
scheme-relative, credential-bearing, escaped, ambiguous-separator, or
non-`/api/` inputs before fetch. Response bodies remain `unknown` until decoded.
`errors.ts` owns bounded transport/decode categories.

The foundation has no hard-coded endpoint, retry, auth, cache, host, or actual
network request. Unit tests use an injected fake fetch only.

### Use Hey API for TypeScript 6-compatible types-only generation

`openapi-typescript@7.13.0` is not admitted because its peer range is TypeScript
5-only. Exact `@hey-api/openapi-ts@0.99.0` consumes
`contracts/openapi/openapi.yaml` with only the bundled
`@hey-api/typescript` plugin enabled. It writes exactly:

```text
frontend/src/api/generated/query-wire/types.gen.ts
```

No SDK, client, runtime, transformer, normalizer, schema copy, or index barrel
is generated. `@hey-api/typescript` is a plugin identifier bundled with the
generator, not a separately installed package.

`openapi-ts.config.mjs` sets `entryFile: false`, `clean: true`,
`source: false`, the `.gen` filename suffix, `enums: false`, and
`topType: 'unknown'`. The CLI runs from `frontend/` with
`openapi-ts --file ./openapi-ts.config.mjs --no-log-file`; flag-only generation
is forbidden because it adds an `index.ts` barrel.

The generation script checks the 17 authoritative component names from the
query manifest. Check mode writes below `frontend/.tmp/` and byte-compares the
committed file.

### Validate unknown values at the adapter boundary

`queryWire.ts` imports the generated named types and the authoritative JSON
Schemas, compiles them with strict Ajv 2020-12 plus formats, and exposes only
the structural decoders required for shared/effective queries, operation
input/view, error envelope, and share envelope/payload. Validated aliases remain
wire values and cannot enter components/stores directly.

Tests read the shared query manifest and golden files in place. They execute the
positive payloads and structural negatives for unknown/forbidden fields,
invalid safe integers/page sizes, unsupported share version/encoding/topology,
malformed JSON/UTF-8, and trailing data. Catalog, Unicode normalization,
queryDigest, identity-set, path replay, and statistics remain later semantic
work.

### Pin a current compatible dependency set

Runtime:

```text
vue@3.5.40
pinia@4.0.2
naive-ui@2.44.1
ajv@8.20.0
ajv-formats@3.0.1
```

Development:

```text
@types/node@24.13.3
@vitejs/plugin-vue@6.0.8
@vue/test-utils@2.4.11
jsdom@29.1.1
@hey-api/openapi-ts@0.99.0
typescript@6.0.2
vite@8.1.5
vitest@4.1.10
vue-tsc@3.3.8
```

`package.json` SHALL override the generator's transitive `js-yaml` to `4.3.0`;
the unoverridden `4.2.0` is not admitted. The override does not change generated
bytes and a clean audit must report zero known vulnerabilities.

`package-lock.json` is lockfile v3. No router, Axios, auto-import/component
plugin, vfonts, SVG loader, Playwright, second state/component/request system,
or undeclared package is admitted.

All package commands run with Node `24.18.0` first in PATH, npm `11.16.0`,
frontend-local npm cache/temp, official registry, and audit/fund/update notifier
disabled. Global/version-manager state is not mutated.

### Keep a small explicit persistent inventory

```text
frontend/.gitignore
frontend/README.md
frontend/ARCHITECTURE.md
frontend/package.json
frontend/package-lock.json
frontend/index.html
frontend/tsconfig.json
frontend/tsconfig.app.json
frontend/tsconfig.node.json
frontend/vite.config.ts
frontend/openapi-ts.config.mjs
frontend/src/vite-env.d.ts
frontend/src/app/main.ts
frontend/src/app/App.vue
frontend/src/app/AppProviders.vue
frontend/src/app/store/runtime.ts
frontend/src/api/client.ts
frontend/src/api/errors.ts
frontend/src/api/adapters/queryWire.ts
frontend/src/api/generated/query-wire/types.gen.ts
frontend/src/shared/styles/base.css
frontend/tests/setup.ts
frontend/tests/app/app.mount.test.ts
frontend/tests/api/client.test.ts
frontend/tests/api/query-wire.contract.test.ts
frontend/scripts/generate-query-wire.mjs
frontend/scripts/check-query-wire-generated.mjs
frontend/scripts/check-architecture.mjs
frontend/scripts/check-production-artifact.mjs
frontend/scripts/cleanup-generated.mjs
```

Disposable roots are `node_modules`, `dist`, `coverage`, `.cache`, and `.tmp`.
They are locally ignored, canonically contained, and absent at handoff.

### Make build, browser, and Impeccable evidence proportional

The production build emits one `dist/index.html`, no source maps, fixture/user
snapshots, prototype markers, direct upstream URLs, Axios, or statistical code.
The empty foundation's reachable initial JS gzip remains below 300 KiB.

Loopback preview loads `/`, `/ranking`, and `/co-star` at 360px and 1440px.
Each has one app root, title, main, ready marker, no horizontal overflow,
console error, unhandled rejection, failed resource, business/API/upstream
request, or duplicate ID.

Before UI edits the owner uses Impeccable v4 `new-work` to preserve and expand
the incumbent PRODUCT/DESIGN/oracle world, then reads `operate.md` and
`craft-floor.md`. A separate finish reviewer inspects rendered evidence. This
foundation does not regenerate `.impeccable/design.json` or claim feature-level
oracle fidelity.

## Verification

- Clean `npm ci` from the committed lock under Node/npm 24.18.0/11.16.0.
- Clean `npm audit` with the approved `js-yaml@4.3.0` override.
- Generated type drift and exact 17-component inventory.
- Architecture, client, adapter/golden, mount, and import-ownership tests.
- `vue-tsc --build`, Vitest, Vite production build, artifact denylist, bundle
  budget, and direct preview smoke.
- Impeccable context/surface/craft-floor use and separate rendered review.
- Strict targeted/all OpenSpec, OpenSpec doctor, Git diff/path/dependency
  checks, protected inputs, and no disposable residue.

## Risks / Trade-offs

- The foundation includes Ajv runtime cost before business screens exist; its
  value is immediate strict wire validation.
- The initial page is intentionally incomplete and must not be mistaken for
  final fidelity.
- Browser automation remains tool-driven until a feature justifies a locked
  E2E package.

## Migration Plan

1. Rebind and approve all three Wave 1B changes in one planning checkpoint.
2. Run frontend, backend, and updater owners in parallel on disjoint roots.
3. Main accepts each candidate; a separate Impeccable reviewer checks frontend.
4. Archive/sync accepted changes and commit the bounded foundation phase.

## Open Questions

None.
