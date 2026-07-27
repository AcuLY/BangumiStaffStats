## Context

Each API golden is already an independent npm package with exact
`ajv@8.20.0` and `ajv-formats@3.0.1` development dependencies. Catalog imports
those package-local dependencies normally. The other five verifiers instead
derive a configurable tool root, default it to `frontend`, and dynamically
import files below that sibling's `node_modules`.

Normal developer and CI order installed Frontend first, masking this
undeclared edge. Formal acceptance installs one Contracts package at a time
inside an isolated clone and therefore correctly failed Rankings with
`ERR_MODULE_NOT_FOUND` for `frontend/node_modules/ajv/dist/2020.js`.

## Goals / Non-Goals

Goals:

- Make every API-golden verifier executable from only its own exact locked
  install plus tracked repository contracts.
- Remove the environment injection point and sibling dependency.
- Preserve every contract/golden/business assertion byte outside the import
  prologue.
- Add a fast source-policy regression test and prove the real package commands
  independently.

Non-goals:

- Changing dependency versions, package metadata, contracts, cases, OpenAPI,
  generated models, Backend/Frontend consumers, or acceptance behavior.
- Treating a shared root install, npm workspace, `NODE_PATH`, symlink, or
  Frontend install as an acceptable dependency provider.

## Change Boundary

| Field | Declaration |
|---|---|
| Owner | One Contracts apply subagent; main agent reviews specs/diff/tests and owns Git/OpenSpec lifecycle. |
| Writable implementation | Exact five affected `verify.mjs` files plus `contracts/artifacts/test/ci-policy.test.mjs`. |
| Protected | All other repository and external state, including the six package/lock pairs, Catalog verifier, golden/schema/OpenAPI bytes, product code, acceptance harness, workflows, refs, artifacts, hosts, and secrets. |
| Deletion complement | None. Apply may remove only obsolete import-prologue lines inside the five owned verifiers. |
| Mutable refs | None. |
| Output | Package-local imports and one structural regression test; no generated or runtime artifact is committed. |
| Stop conditions | Any required package/lock change, business assertion drift, unexpected path change, inability to verify independently, network-dependent production behavior, or dirty protected input. |

## Decisions

### Use native package resolution

The five verifiers will match Catalog:

```js
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
```

Node resolves these imports from the verifier package's own `node_modules`.
The unused `pathToFileURL`, `toolRoot`, and capability-specific `*_TOOL_ROOT`
environment behavior are removed. No fallback is allowed.

### Keep package and semantic authorities byte-identical

All six package manifests and locks already declare the exact dependencies.
They remain unchanged. The edit is limited to import ownership; existing
schema loading, assertions, case inventories, hashes, output, and cleanup
behavior remain byte-identical.

### Guard the boundary twice

The existing CI policy test will statically enumerate the exact six API
packages and require:

- package-local exact dependency declarations;
- bare imports in every verifier;
- no `node_modules` path, Frontend reference, `pathToFileURL`, or
  capability-specific tool-root environment lookup.

Apply also executes every package's real `npm ci` and `npm run verify` from an
independent install while `frontend/node_modules` is absent. The structural
test prevents the masked edge from returning; the real commands prove the
verifiers still perform their business checks.

### Re-seal source-bound artifacts afterward

The runtime artifact bytes are not assumed to change, but every component
statement binds a clean source revision/tree. After this change is archived,
the main agent creates a new acceptance-free Product candidate and rebuilds
the accepted component statements and compatibility manifest before the next
formal acceptance run.
