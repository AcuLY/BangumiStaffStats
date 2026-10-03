## Context

The Go service exposes five synchronous POST queries. There is no existing browser event channel. querytiming already records phases, and detached singleflight workers deliberately outlive a canceled waiter. The sole frontend fetch owner is api/client.ts.

## Goals / Non-Goals

Expose actual collection-page and analysis work while preserving requests, default JSON, caches and statistics. Do not add durable jobs, credentials, dependencies or fictitious overall percentages.

## Decisions

Use optional Accept: text/event-stream on existing POST routes. Each `progress` event follows QueryProgressV1 (phase/message, optional completed/total). A final `result` event follows QueryStreamResultV1 (original status, allowlisted headers, unchanged JSON envelope). JSON-only clients remain compatible. Early validation errors may use their existing HTTP JSON response. No Last-Event-ID or transparent retry.

Reuse context-based querytiming reporting. Shared workers broadcast only to same-key active waiters, replay latest phase to late joiners, and remove canceled subscriptions without canceling work needed by other waiters. Bounded coalescing queues and heartbeat comments prevent backpressure and idle proxy buffering. Total is supplied only when known; counters are phase-local. Cache hit, successful collection pages, conversion, filtering, analysis and projection are distinct stages.

Frontend reads SSE in api/client.ts and passes final result through existing decoders. Per-request identities and latest admission prevent older or concurrent queries from replacing unrelated progress. Abort, completion, error and retry retire progress. No-terminal EOF is an error, not success; retry starts a fresh request. A native accessible progress indicator displays determinate phase counters only with a real total, otherwise indeterminate, with concise Chinese stage text. Existing result and loading structure remains intact.

## Risks / Trade-offs

SSE over POST uses fetch rather than EventSource and cannot automatically resume; existing explicit retry is retained. Hosting intermediaries may buffer; no-store/X-Accel-Buffering and flushed frames mitigate this, but live hosting is not claimed tested. Detached cache work may continue after cancel as before. No real iPhone is available; Chromium touch emulation is evidence only for that environment.

## Migration Plan

No persisted migration. Ship backward-compatible backend and frontend in the existing assembled bundle. Topic CI first, review exact accepted commit, then master merge if green. Dispatch existing workflow for bundle, not a new deploy mechanism. Revert commit for code rollback; production rollback remains separate.

## Open Questions

Production activation cannot be completed through a repository deployment workflow because none exists; parent must align the final host action without bypassing the user's pipeline requirement.
