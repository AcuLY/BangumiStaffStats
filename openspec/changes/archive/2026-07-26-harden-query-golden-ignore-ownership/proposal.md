## Why

Formal integrated acceptance admitted all immutable inputs, then the
`owner.contracts` gate failed because the Query golden verifier still pins the
entire root `.gitignore` to its initial 402-byte form. Later accepted owners
legitimately added exact editor, API-golden, Archive-tooling, and Impeccable
runtime rules. Query owns only its six transient paths and must not reject or
re-authorize another capability's approved rules.

## What Changes

- Replace the Query verifier's whole-file `.gitignore` equality with a
  UTF-8/LF/final-LF check plus exact-once verification of the six Query-owned
  rules.
- Replace the manifest's stale whole-file byte/hash evidence with a closed
  descriptor of the Query-owned rule set and its digest.
- Add fail-closed regression checks for a missing, duplicate, reordered, or
  broadened Query rule while accepting unrelated approved owner rules.
- Rebind only the verifier's self identity in the Query manifest.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `contracts-query-wire`: make root-ignore evidence ownership-aware without
  broadening any Query generated-state path.

## Impact

| Boundary | Declaration |
|---|---|
| Status | investigated: complete; specified: ready for review; implemented: no; verified: no; committed/pushed/released/deployed: no |
| Owner | Main agent specifies and audits; one delegated Contracts owner implements the bounded product correction; main agent accepts and performs lifecycle. |
| Writable paths | `contracts/goldens/query/verify.mjs`, exactly `acceptanceEvidence.gitignore` and `acceptanceEvidence.projectionTool.verifier` in `contracts/goldens/query/manifest.json`, this change's task markers, and this change's OpenSpec lifecycle paths. |
| Read-only protected inputs | Root `.gitignore`, every other Query golden/schema/OpenAPI/package/lock path, Backend/Updater/Frontend, acceptance harness, other changes/specs, artifacts/caches, refs/remotes, hosts/services, and production. |
| Deletion complement | None. Generated Query state may be removed only by its already accepted exact cleanup command. |
| Consumes | Current accepted root `.gitignore`, accepted owner-specific ignore additions, `contracts-query-wire`, and the formal acceptance failure evidence. |
| Produces | Ownership-aware Query ignore validation, closed manifest evidence, and deterministic negative coverage. |
| Acceptance | Strict OpenSpec validation; locked Query npm install/verify/codegen/cleanup sequence; current root ignore passes; missing/duplicate/reordered/broadened Query rules fail; exact diff/inventory/residue checks. |
| Non-goals | Editing `.gitignore`, accepting a broad Query pattern, changing wire/schema/vector/codegen behavior, changing dependencies, or touching Backend/Updater/Frontend/operations. |
| Stop/rollback conditions | Stop on any required non-Query product edit, ambiguous rule ownership, unrelated manifest drift, network access, protected mutation, or failed deterministic cleanup. |
