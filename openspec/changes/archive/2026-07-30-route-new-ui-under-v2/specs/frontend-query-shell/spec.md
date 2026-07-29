## Capability Boundary

| Field | Declaration |
|---|---|
| Status | Implemented, Actions-verified, deployed, and public-path accepted. |
| Owner | Main agent, direct sequential implementation. |
| Writable paths | `frontend/src/shared/navigation/basePath.ts`, exact path-aware hunks in `frontend/src/app/routes.ts`, `frontend/src/features/query/share.ts`, `frontend/src/features/query/components/AppHeader.vue`, exact related tests, and their persistent inventory entries in `frontend/scripts/check-architecture.mjs`. |
| Read-only protected inputs | UI/CSS/assets/copy/state semantics, query/share wire schemas, dependencies, backend/updater/contracts code, and all unrelated frontend paths. |
| Deletion complement | Only the newly added base-path utility/test may be removed during narrow rollback; existing files are hunk-restored. |
| Mutable refs | This change and branch lifecycle only. |
| Consumes | Existing logical `/ranking` and `/co-star` route/share behavior plus Vite `BASE_URL`. |
| Produces | Public `/v2/ranking` and `/v2/co-star` navigation/share behavior without state or UI drift. |
| Dependencies | Accepted query shell and production build base. |
| Deliverables | Base-aware route owner, share/header mapping, and tests. |
| Acceptance | Existing frontend checks plus direct `/v2/` route/navigation/share/popstate cases. |
| Non-goals | UI/state/wire/API semantic or dependency changes. |
| Operations deferred | Host mutation is owned only by the operations delta. |
| Stop/rollback conditions | Stop on visible/interaction/state/wire drift or edits outside the declared paths. |

## MODIFIED Requirements

### Requirement: One query shell SHALL own routes and shared query state

The formal SPA SHALL expose logical `/ranking` and `/co-star` shell modes at
the configured production base, currently public `/v2/ranking` and
`/v2/co-star`, with one `QueryDraft`, one immutable last-successful
`AppliedQuery`, one ordered `positionKeys` array, and one monotonic
`queryRevision`. Operation/logical-path/deployment-base SHALL not enter the
shared query signature. Editing Draft or switching modes SHALL not apply,
reset, or fork shared state; only a successful semantically new application
SHALL advance revision.

Rankings and candidates SHALL retain separate normalized view and resource
slots tagged with their revision. A slot for the current revision MAY be
restored on mode return; an absent slot MAY be loaded through the registered
operation port without resubmitting Draft.

The configured base root and its `index.html` SHALL replace to the public
ranking path while preserving safe query parameters; root-domain paths outside
the configured base SHALL not be claimed by this shell. `?user=` SHALL prefill
only personal Draft. On first document load, the shell SHALL consume at most
one valid v1 share fragment through the same ordinary application service and
then remove the fragment by history replacement. Invalid share SHALL remove
the fragment, show a structured local error, and start no request or automatic
`?user=` fallback.

Successful personal application SHALL replace `?user=` with the effective
trimmed UID; successful global application SHALL remove `?user=`. These URL
updates SHALL remain inside the configured base and SHALL not start another
request. The Header SHALL retain one share action immediately beside the mode
switch at every viewport. It SHALL remain visibly disabled when no Applied
Query exists and otherwise serialize only the current mode's last-successful
Applied Query plus accepted operation input/view into the existing versioned
fragment wire. The generated share URL SHALL use the public base-aware path
while the envelope retains its existing logical route identity. Dirty Draft,
pending attempts, responses, request IDs, revision, dataVersion, digests,
refresh flags, theme, and transient UI state SHALL not enter the link.

The share action SHALL use the Clipboard API when available, temporarily show
the DESIGN check feedback for approximately 1500ms, and announce success
through a polite live region. Clipboard absence or failure SHALL expose the
same generated read-only selectable link in a lightweight adjacent popover;
it SHALL not discard the link or show a success modal.

#### Scenario: Draft changes and mode changes
- **WHEN** the user edits Draft and switches between ranking and co-star below `/v2/`
- **THEN** the browser path SHALL switch only between `/v2/ranking` and `/v2/co-star`
- **AND** Applied Query, queryRevision, ordered PositionKeys, current-revision resources, and edited Draft SHALL remain unchanged

#### Scenario: A new query succeeds
- **WHEN** final validation passes and the active operation returns the latest successful response for a semantically new Draft
- **THEN** the operation resource, Applied Query, and next queryRevision SHALL commit atomically
- **AND** no later feature may create a second Applied Query owner

#### Scenario: A shared query is present on first load
- **WHEN** one valid v1 share and `?user=other` are both present below `/v2/`
- **THEN** the share SHALL be applied at most once through ordinary query application
- **AND** the fragment SHALL be removed, `?user=` SHALL not trigger another request, and history SHALL remain below `/v2/`

#### Scenario: The visible result is shared while Draft is dirty
- **WHEN** an Applied Query exists and the user edits Draft or starts a newer pending attempt
- **THEN** the share action SHALL encode the current visible result's last-successful Applied Query and accepted operation state at the matching `/v2/` public route
- **AND** it SHALL exclude the dirty Draft and pending attempt from the generated link

#### Scenario: Clipboard copying is unavailable
- **WHEN** a valid share link is generated but Clipboard API copying is unavailable or fails
- **THEN** the same `/v2/`-based read-only selectable link SHALL remain available in the adjacent fallback popover
- **AND** the shell SHALL not report a successful copy or lose the generated link

#### Scenario: A path outside the deployment base is loaded
- **WHEN** the legacy root or another path outside `/v2/**` is requested
- **THEN** the new query shell SHALL not claim, redirect, or rewrite that path
