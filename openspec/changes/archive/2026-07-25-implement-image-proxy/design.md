## Context

The accepted server has strict routing, safe envelopes, cancellation, and
low-cardinality observations but no business route. The image boundary is
security-sensitive and must remain independently testable.

| Boundary | Declaration |
|---|---|
| Status | specification ready for main review; implementation pending |
| Owner | One Backend subagent; main-agent acceptance. |
| Writable paths | Exact proposal paths. |
| Read-only protected inputs | Exact proposal protected set. |
| Deletion complement | None. |
| Mutable refs | None during apply. |
| Consumes | Accepted HTTP/runtime/observability primitives. |
| Produces | Image proxy package plus narrow router/app integration. |
| Dependencies | Accepted HTTP/observability change. |
| Deliverables | Go code and tests. |
| Acceptance | Proposal gates. |
| Non-goals | Wildcard proxy, collection, frontend size policy, operations. |
| Operations deferred | CDN and deployment concerns. |
| Stop/rollback conditions | Stop rather than broaden upstream or paths. |

Dependency direction is `httpapi/app -> imageproxy -> net/http`; the image
package does not import app, Archive, query, or frontend code.

## Goals / Non-Goals

**Goals:** Exact validation, fixed-origin retrieval, bounded streaming, safe
headers/errors, cancellation, and low-cardinality evidence.

**Non-Goals:** Generic proxying, image transformation, persistent cache, or
production networking.

## Decisions

- Use a small standard-library client with injected transport/base endpoint
  only for tests; production construction fixes HTTPS `api.bgm.tv`.
- Disable redirects and admit only exact resource/type enums before transport.
- Limit concurrency with a request-scoped semaphore and body size while
  streaming. Cancellation waiting for either resource or I/O returns promptly.
- Buffer no whole successful image. Before headers commit, validate status,
  MIME, declared size, and safe cache metadata; enforce the hard limit during
  copy and abort the connection if a late stream error prevents a clean
  envelope.
- Extend the existing router and closed observation enums rather than add a
  second middleware stack.

No library is added; standard `net/http`, `io`, and synchronization primitives
cover the boundary.

## Risks / Trade-offs

- [Late streaming failure cannot become JSON] → abort safely and test committed-response behavior.
- [Redirect/DNS bypass] → production origin is fixed and redirects are never followed.
- [Resource exhaustion] → timeout, semaphore, declared/actual size limits, and prompt cancellation.
