# Frontend development artifact

This directory packages the already accepted Vite `dist/` tree without
changing product source, assets, markup, API behavior, or interaction design.
It emits a normalized static tar, canonical `SHA256SUMS`, deterministic SPDX
2.3 JSON, and a Contracts-validated Frontend component statement.

Generated dependencies, caches, builds, extracted smoke roots, and
content-addressed output stay below ignored `build/.tmp/`.

Use the exact toolchain declared by `package.json`:

```sh
npm run artifact:test
npm run artifact:check
npm run artifact:smoke -- build/.tmp/published/sha256-<component-tree-digest>
```

`artifact:check` performs two isolated `npm ci` plus Vite builds and compares
every emitted artifact/evidence byte before publishing a local content address.
It first derives `HEAD` and `HEAD^{tree}` from the canonical repository root,
requires a clean index/tracked worktree/untracked-non-ignored set, and copies
only regular files tracked by that exact revision. Optional
`--source-revision` and `--source-tree` arguments are assertions and must both
exactly restate the derived identity; they cannot override it. Attestation
failure occurs before candidate copying or generated-output creation.
`artifact:smoke` accepts exactly one already-published component root and does
not rebuild it. Neither command uploads, releases, deploys, or chooses a
production static host.
