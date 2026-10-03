## ADDED Requirements

### Requirement: Isolated bounded reporting
Backend progress SHALL report successful collection pages and subsequent conversion, filtering, analysis and projection stages. Same-key shared workers SHALL broadcast bounded coalescing updates only to their active waiters, replay latest state to new waiters, and report cache hits.

#### Scenario: Concurrent cancellation
- **WHEN** one of two same-key waiters disconnects
- **THEN** its subscription is removed while the other continues; unrelated keys never receive its events.

### Requirement: Terminal lifecycle
Backend streaming SHALL flush updates, periodically send heartbeat comments and terminate with the existing result or error envelope. Progress reporting SHALL NOT block computation or change upstream limits.

#### Scenario: Cached and failed requests
- **WHEN** a request hits cache or encounters a query error
- **THEN** the stream completes with the original result or error status and no invented analysis percentage.
