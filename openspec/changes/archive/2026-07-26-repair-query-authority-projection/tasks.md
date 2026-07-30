## Task Boundary

| Field | Declaration |
|---|---|
| Owner | One delegated Contracts owner implements; main agent reviews, marks, syncs, archives, commits, and runs formal acceptance. |
| Writable paths | `contracts/goldens/query/verify.mjs`; only affected authority/projection/self evidence in `contracts/goldens/query/manifest.json`; this change's task markers. |
| Protected paths | Shared OpenAPI/schema authority, Query cases/locks, backend/frontend generators and generated files, other changes/specs, refs/remotes, hosts, and production. |

## 1. Query authority projection

- [x] 1.1 Construct and validate the exact Query-only OpenAPI projection with
  zero paths, 17 owned schemas, nine shared error responses, and the accepted
  fixed description.
- [x] 1.2 Use the projection in authority audit and both disposable codegen
  trees; reject missing owned members without reading endpoint schema roots.
- [x] 1.3 Add deterministic evidence that unrelated paths/components leave the
  canonical projection unchanged and an owned component mutation changes it.
- [x] 1.4 Update only affected manifest projection objects and verifier
  bytes/SHA-256.

## 2. Verification and lifecycle

- [x] 2.1 Run the locked full Query verifier/codegen/cleanup sequence twice,
  backend and frontend Query-wire checks, strict OpenSpec, exact diff/inventory,
  and physical residue checks; hand off unstaged.
- [x] 2.2 Main agent audits the complete diff, marks tasks, syncs, archives, and
  prepares the exact correction before rebuilding all three development artifacts.
