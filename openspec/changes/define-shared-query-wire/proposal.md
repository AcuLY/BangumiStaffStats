## Why

The clean-room frontend and Go backend need one versioned, language-neutral query contract before either runtime can be bootstrapped. Without it, personal/global isolation, stable position identities, tag semantics, view operations, error handling, and share replay would be redefined independently by each consumer.

## What Changes

- Add the `contracts-query-wire` capability as the machine-readable authority for the v1 shared query, query-adjacent view values, error envelope, and self-contained share fragment.
- Define a strict `scope=personal|global` discriminated union. Personal requests explicitly carry the public UID, collection statuses, and personal-only filters; global requests reject every personal-only field.
- Define opaque, stable `PositionKey` values for exact staff, cast main/all, and the dormant future staff-set namespace. Cross-type keys, non-selectable keys, and same-type cast main/all conflicts are explicit failures; repeated keys normalize by retaining the first occurrence so semantic order remains stable.
- Replace the oracle's UI-only enabled/range/tag representation with normalized wire values: omitted inactive ranges, explicit tag AST, ordered positions, canonical unordered sets, stable defaults, and no `/` or `+` syntax on the wire.
- Define shared search/order/page/page-size primitives and a closed per-operation component matrix with exact fields, scope/section rules, and defaults that both share v1 and future endpoint contracts must reuse, without defining endpoint responses or statistical results.
- Define the cycle-free Effective Query normalization and digest-projection pipeline plus versioned SHA-256 `queryDigest` preimage/algorithm. The digest projection excludes personal UID as well as dataVersion, operation, input, view, refreshCollection, share state, search, sort, and pagination; the later personal result-cache key adds the independently owned collection digest.
- Define a stable error envelope whose code and field-error codes, rather than localized message text, are the client logic boundary.
- Add the v1 `/ranking#q=v1.<payload>` and `/co-star#q=v1.<payload>` share format, including a closed `0 people = empty`, `1 = partners`, `2–10 = co-star analysis` topology whose selected identities are exactly the applicable operation input, plus canonical serialization, size/version checks, one-time replay rules, and strict negative vectors.
- Add language-neutral positive, negative, and normalization goldens plus locked, development-only schema/OpenAPI validation tooling and generation-feasibility checks for Go and TypeScript.
- **BREAKING** relative to prototype evidence: raw numeric/string positions, `isGlobal`, `enabled` range/tag wrappers, substring tag matching, and the prototype `?mode=` / `?result=series` URL state are not accepted by the formal wire. These are `INTENTIONAL_DELTA` corrections required by PRODUCT.md and the accepted data decisions.

Externally visible behavior is classified as follows:

- `PRESERVE_ORACLE`: ordered multi-position selection, ranking multi-position AND semantics, co-star per-position candidate grouping, collection statuses 2/3/4/5, NSFW/series options, range concepts, positive group-AND/group-OR tags, negative group-OR/group-AND tags, search/sort/page controls, and retaining the last successful Applied Query while Draft changes remain unapplied. Evidence: oracle `644b7748674e553f863d0ffd61d029f86fdc0717`.
- `INTENTIONAL_DELTA`: string subject types, `staff:*` / `cast:*` PositionKey namespaces, complete personal/global structural isolation, exact normalized tags, omitted inactive filters, 5/10/20 page sizes, canonical paths, and rejection of prototype-only fields/syntax. Authorities: PRODUCT.md “Query Application Contract”, `DR-DATA-TAG-001`, `DR-DATA-GLOBAL-001`, `DR-DATA-POSITION-001`, `DR-DATA-SUBJECT-TYPE-001`, `DR-DATA-SORT-001`, and the formal development master plan.
- `NEW_CAPABILITY`: formal error envelope, versioned self-contained share fragment v1, language-neutral contract vectors, and Go/TypeScript generation-feasibility evidence. Authorities: PRODUCT.md “Share query contract” and “Operation result boundaries”, plus the backend development guide sections 7, 8, and 11.

## Capabilities

### New Capabilities

- `contracts-query-wire`: Versioned strict schemas, OpenAPI components, normalized goldens, error envelope, share fragment v1, and cross-language generation inputs for shared query transport.

### Modified Capabilities

- None.

## Impact

| Field | Declaration |
|---|---|
| Status | investigated: complete; specified: initial checkpoint approved, toolchain correction pending approval; implemented: partial candidate retained; verified: preflight and paused-state seals only; committed: initial planning checkpoint only, correction and product not committed; pushed: no; released: no; deployed: no |
| Owner | Contracts owner / capability `contracts-query-wire`; planning artifacts are authored by a spec subagent, apply/test/commit/archive by implementation or finalization subagents, and the main agent only reviews/amends OpenSpec and performs read-only acceptance |
| Writable paths | Planning: only `openspec/changes/define-shared-query-wire/**`. Future apply: only `contracts/openapi/**`, `contracts/schemas/query/**`, and `contracts/goldens/query/**` |
| Read-only protected inputs | `PRODUCT.md`; `DESIGN.md`; `openspec/config.yaml`; `openspec/specs/contracts-rewrite-baseline/spec.md`; `tmp-formal-development/formal-development-master-plan.md`; `tmp-formal-development/data-logic-implementation-guide.md`; `tmp-formal-development/backend-development-implementation-guide.md`; `tmp-formal-development/decisions/prototype-data-logic-audit.md`; `.impeccable/**`; oracle commit `644b7748674e553f863d0ffd61d029f86fdc0717`, especially `frontend/src/workbench/types.ts`, `frontend/src/workbench/components/QueryWorkspace.vue`, `frontend/src/workbench/composables/useWorkbench.ts`, and the two `frontend/public/workbench-data/*.json` fixtures |
| Deletion complement | Empty. No tracked path outside the future apply roots may be deleted, moved, or rewritten; no pre-existing file inside those roots may be removed unless it is explicitly enumerated in an approved task amendment |
| Mutable refs | Initial checkpoint: one delegated subagent advanced `refs/heads/codex/formal-rewrite` from `e5d67d7d74614b7a95da4a7887caa8e1f25bc307` to `c7f868e2861e8fea250f033c27538ecf793bacad` with subject `docs(openspec): approve wave 1 shared contracts`. One observed mid-apply exception is authorized only after both apply agents stop at the sealed toolchain-discovery state: a delegated correction subagent may advance the branch once from `c7f868e2861e8fea250f033c27538ecf793bacad` with exact subject `docs(openspec): approve wave 1 archive toolchain correction` and a delta containing exactly proposal/design/spec/tasks for both Wave 1A changes, while every product/cache byte remains unstaged and sealed. Apply then resumes from that accepted replacement checkpoint with refs/index immutable. After both paired candidates are accepted, one finalization subagent alone may advance the branch with the approved combined phase commit; no apply agent may stage or commit |
| Consumes | Completed `establish-formal-rewrite-baseline`; the authority and oracle inputs listed above; read-only npm registry and Go module proxy metadata/artifacts only for locked development tooling |
| Produces | `contracts/openapi/openapi.yaml`; v1 JSON Schemas under `contracts/schemas/query/**`; positive, negative, normalized/digest, limit-evidence, and code-generation-feasibility records under `contracts/goldens/query/**`; exactly three committed Node tooling files under the golden root: `package.json`, `package-lock.json`, and `verify.mjs` |
| Dependencies | `establish-formal-rewrite-baseline` only |
| Deliverables | Personal/global query union; PositionKey; collection/status/range/tag normalization; cycle-free canonical queryDigest; named shared operation input/view components; error envelope; share fragment v1; versioning rules; strict unknown-field and failure cases; language-neutral goldens; Go and TypeScript generation-feasibility evidence |
| Acceptance | OpenSpec strict validation; JSON/YAML parse; JSON Schema draft 2020-12 strict compilation; OpenAPI 3.1 lint; every positive/negative/normalization/digest vector produces the declared outcome; repeated normalization, digest, and share encoding are byte-stable; `openapi-typescript@7.13.0` and `oapi-codegen/v2@v2.8.0` generate from the same OpenAPI without schema-level error or committed generated output; caches/temp/generated output stay under `contracts/goldens/query/**` and are absent from the candidate; paired-worktree path/index gates pass |
| Non-goals | No endpoint path/handler, catalog implementation, store/cache implementation, runtime cache lookup, collection access, statistics, result DTO, UI/store/request adapter, share service/short code/server session, runtime Go/TS consumer test, or Archive contract |
| Operations deferred | No nginx, systemd, production Compose, timers, deployment/release workflows, secrets, host changes, production activation, registry push, monitoring rollout, or migration |
| Stop/rollback conditions | Stop before mutation on branch/HEAD/common-planning-checkpoint mismatch, non-empty index, dirty paths outside the exact paired envelope, missing main-agent approval, dependency not accepted, protected-input drift, schema/tool disagreement, network/tool lock drift, any write outside this change's apply roots/own task-checkbox markers, or any P0/P1 review finding. Preserve evidence and correct only this change's exact paths with explicit review; never use reset-hard, checkout rollback, git clean, recursive broad deletion, or history rewriting |

This change does not write another repository or mutate external services, hosts, production state, releases, tags, pull requests, or deployments. Dependency downloads are read-only external inputs and their exact versions/integrity are locked in-repository. Any external push, pull request, tag, release, deployment, host mutation, or production activation requires a separate later authorization.

Apply is blocked until proposal, specs, design, and tasks are complete, `openspec validate --all --strict` passes, and the main agent explicitly records approval.

Wave 1A apply is paired with `define-archive-manifest-contract` from one clean planning checkpoint that contains both approved change directories and an empty index. The two implementation agents may work concurrently only in their disjoint declared paths, must snapshot and never write the sibling's task/apply paths, must keep all checks path-scoped, and must stop as unstaged candidates. After both candidates pass main-agent acceptance, one finalization subagent alone stages the exact combined paths, archives both changes, validates the combined result, and stops for final main-agent read-only acceptance; only then may it create the single commit with exact subject `feat(contracts): establish wave 1 shared contracts`.
