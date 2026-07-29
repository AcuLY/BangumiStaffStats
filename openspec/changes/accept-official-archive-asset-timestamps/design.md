## Context

Production updater run `1f1ef640-6ece-4c53-8cf1-2df480746891`
successfully fetched official `aux/latest.json` through the explicit proxy and
then failed in `parse_latest` with `ARCHIVE_IDENTITY_INVALID`. The current
official asset is named `dump-2026-07-28.210449Z.zip` while GitHub reports
`created_at=2026-07-28T21:04:50Z`. Existing code requires those seconds to be
equal.

Read-only inspection of the latest 12 upstream Git objects found offsets of
0–2 seconds in most releases. The upstream README instructs consumers to parse
`aux/latest.json` after upload and does not define an equality between the
dump-name timestamp and GitHub's asset creation timestamp. All authoritative
bindings—official URLs, asset ID/API URL, content type, size, digest, and
canonical independent timestamps—remain available.

| Field | Declaration |
|---|---|
| Status | Design complete and approved for focused apply after strict validation and zero-P0/P1 review. |
| Owner | Main agent owns direct implementation, review, Actions/artifact acceptance, and Git under the user's latest delegation rule. |
| Writable paths | Exact proposal paths, including main-spec sync and the four existing activation artifacts, plus this change's artifact/task state and archive destination. |
| Read-only protected inputs | Upstream repository/metadata; every other repository path; all other acquisition/TLS/proxy/content/data behavior; `myserver` and external state. |
| Deletion complement | No persistent object or dependency; existing exact test temporaries only. |
| Mutable refs | Change task state, implementation commit A, artifact-pin commit B, and branch push only. |
| Consumes | Existing `parse_latest`, focused tests, current official metadata/history, failed production evidence, artifact-pin workflow. |
| Produces | One corrected cross-field rule and one replacement artifact. |
| Dependencies | Reviewed change → focused source/tests → A → pin-only B → exact-head Actions/artifact → activation amendment. |
| Deliverables | Proposal deliverables only. |
| Acceptance | Current official metadata succeeds; all independent identity gates and negative cases remain; full Actions/artifact pass. |
| Non-goals | Proposal non-goals only. |
| Operations deferred | Proposal deferred items only. |
| Stop/rollback conditions | Proposal stop/rollback conditions only. |

Dependency direction is official latest bytes → strict independent field and
cross-reference validation → exact asset download/digest/ZIP gates. No host
state or product behavior feeds back into the rule.

## Goals / Non-Goals

**Goals:**

- Accept official assets when the dump-name timestamp and GitHub
  `created_at` are each canonical but not equal.
- Preserve every authoritative URL, ID, digest, size, content, time-format,
  and ordering check.
- Add a regression fixture representing the exact current official metadata.

**Non-Goals:**

- Inferring upload delay, adding a tolerance window, selecting another asset,
  weakening origin/content identity, or changing retries/proxy/deployment.

## Decisions

### 1. Validate the two timestamp domains independently

`name` continues to require exact
`dump-YYYY-MM-DD.HHMMSSZ.zip` grammar and continues to bind the exact official
download URL. `created_at` and `updated_at` continue to require calendar-valid
canonical GitHub UTC seconds, with `updated_at >= created_at`. The parser
removes only `name == dump(created_at)`.

This is safer than a skew window: upstream does not promise a maximum delay,
so any chosen limit would be another invented contract. It also does not
weaken asset identity because the canonical name is cross-bound to the
download URL while ID is cross-bound to the API URL and the content remains
bound by exact size and SHA-256.

Alternative rejected: accept arbitrary filenames, because the dump namespace
is still authoritative. Alternative rejected: ignore GitHub timestamps,
because malformed or reversed official metadata should still fail.

### 2. Use the exact current upstream object as the positive regression

The focused test uses the 2026-07-28 name, timestamps, asset ID, size, digest,
node ID, and URLs from upstream blob
`cd26d1c414a2cb333759066085a4c2504b91939d`. It asserts successful parsing and
then mutates retained fields individually to prove origin/API/ID/content
type/size/digest/name/time/order checks still fail.

The existing synthetic archive fixture remains for download/extraction tests;
the 426 MiB upstream asset is never downloaded by tests.

### 3. Keep production retry authority outside this product correction

Implementation and Actions do not touch `myserver`. Commit A contains only the
parser/test change; commit B changes only the reviewed accepted-product pin.
After a new artifact is admitted, `activate-single-host-production` must record
the failed run, exact replacement identity, B2 private baseline, and exactly
one newly authorized updater invocation before any host action.

## Risks / Trade-offs

- **A malicious document can choose an unrelated canonical name time** →
  official host/final URL, exact field set, download/API cross-bindings, asset
  ID, size, digest, and ZIP/content gates remain mandatory; the time equality
  never supplied content authenticity.
- **Upstream changes another field later** → exact field/type/bounds continue
  to fail closed and require a separately reviewed change.
- **A focused fix accidentally widens acquisition** → narrow writable paths,
  mutation tests for every retained gate, diff audit, and full Actions.

## Migration Plan

1. Strict-validate and approve this change with zero P0/P1 findings.
2. Remove only the unsupported equality and add the exact official regression
   plus retained-gate negative tests.
3. Audit the diff, create implementation commit A, pin only A in commit B,
   push, and require exact-head green Development Actions plus one admitted
   `linux/amd64` artifact.
4. Sync/archive this change and amend the production activation change.
5. If any source/test/Actions/artifact gate fails, keep B2 private and old
   public traffic unchanged.

## Open Questions

None.
