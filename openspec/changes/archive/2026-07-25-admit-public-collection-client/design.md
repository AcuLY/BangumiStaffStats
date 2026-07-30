## Boundary Record

| Field | Declaration |
|---|---|
| Owner | Backend public-collection implementation agent. |
| Writable paths | `backend/internal/publiccollection/**`, `backend/internal/app/{run.go,run_test.go}`, `backend/{go.mod,go.sum}`, one exact backend inventory/check hunk if required, and task markers. |
| Protected inputs | External client repository/tag, endpoint services and caches except assembly arguments, contracts/frontend/updater, remote refs, and operations state. |
| Consumes | Public client `v0.1.0`, internal snapshot/failure types, and existing provider interfaces. |
| Produces | An internal-only adapter and process-wide provider. |
| Dependencies | Published fixed `v0.1.0`, accepted query/cache services, and co-star app-wiring handoff. |
| Deliverables | Mapping, sanitized classifications, assembly, unit/contract/integration tests, module pin. |
| Acceptance | Focused mapping/transport tests and full backend gates with no `replace`, token, Cookie, external-type leakage, or personal nil provider. |
| Non-goals | External client logic, alternate HTTP/cache layers, OAuth, handler/API changes, operations, or remote mutation. |

## Adapter Shape

`publiccollection.Source` owns a narrow client interface matching `Fetch`.
Production constructs one `collection.Client` with a fixed valid User-Agent;
tests inject a fake client or loopback transport. The source implements every
existing service `CollectionProvider` structurally.

| Internal value | External value |
|---|---|
| `book`, `anime`, `music`, `game`, `real` | subject type `1`, `2`, `3`, `4`, `6` |
| `completed`, `in_progress`, `on_hold`, `dropped` | collection type `2`, `3`, `4`, `5` |
| `SubjectID`, subject type, status, rate, comment, tags, updated time, volume/episode progress, private | exact corresponding `collection.Subject` fields |

Input order is canonicalized only as needed by the external client. Unknown
subject/status values fail before transport. Returned nil items, duplicate
subject IDs across statuses, mismatched enums, invalid times, or otherwise
impossible data become sanitized protocol/decode failures rather than being
silently repaired.

## Failure Classification

- not found → `runtimecache.FailureNotFound`;
- unauthorized or forbidden → `FailureForbidden`;
- rate limited → `FailureRateLimited`;
- upstream 5xx → `FailureUpstream5xx`;
- timeout → `FailureTimeout`;
- transport → `FailureNetwork`;
- decode, protocol, or oversized response → `FailureDecode`;
- invalid configuration/input or an unclassified status → `FailureOther`.

Parent cancellation remains cancellation; no error retains upstream body,
UID, URL, collection data, token, Cookie, or raw external message.

## Runtime Assembly

`RunListener` constructs one source and passes the same instance to rankings,
candidates, person detail, partners, and co-star. Tests inject a provider so
they never depend on the public network. Global requests never call it;
personal requests cannot run with the former nil production provider.
