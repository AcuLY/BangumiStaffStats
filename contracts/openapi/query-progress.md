# Query progress transport v1

The five POST query operations support `Accept: text/event-stream`. JSON remains
the default. Requests, validation, cache keys and statistics do not change.

A streaming HTTP response uses status 200, `Content-Type: text/event-stream`,
`Cache-Control: private, no-store`, and `X-Accel-Buffering: no`. Frames are UTF-8:

```text
event: progress
data: {"phase":"collection_page","message":"正在获取收藏分页（已完成 2 页）","completed":2}

event: result
data: {"status":200,"headers":{"Content-Type":"application/json","X-Request-ID":"…"},"body":{"data":{}}}

```

`QueryProgressV1` and `QueryStreamResultV1` in OpenAPI define the payloads.
Messages are concise Chinese UI copy. Counters describe only the current phase;
`total` is absent unless a real positive total is known. No synthetic overall
percentage is supplied. Consumers show an indeterminate progress bar without a
known total. Pages are reported after successful HTTP body completion, without
claiming an upstream total that has not been validated. Collection conversion,
filtering, statistics, and response projection have separate stages. Cache hits
skip work and explicitly report the cached stage.

Exactly one `result` terminates a normally completed stream, including original
validation, timeout and upstream errors; its `status` is authoritative. `body` is
the unchanged JSON envelope. Headers are restricted to Content-Type,
X-Request-ID, Retry-After, Server-Timing and Cache-Control. Heartbeat comments do
not advance progress. An interrupted stream without a result is a transport
failure, never successful completion. Explicit retry issues a new POST; there is
no persistent job, automatic resume, or Last-Event-ID protocol.

Progress is scoped to the request. Same-key shared workers broadcast to their
active waiters and replay their latest stage for late subscribers; different keys
never share progress. Canceling or disconnecting removes only that subscriber,
while existing bounded detached workers may finish for other waiters/cache.
Progress queues are bounded and coalesce intermediate updates for slow consumers;
they never block computation. Completion is delivered independently of progress.
