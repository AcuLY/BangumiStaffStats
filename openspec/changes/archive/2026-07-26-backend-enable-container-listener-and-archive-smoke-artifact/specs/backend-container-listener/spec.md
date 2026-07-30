## Capability Boundary

| Field | Contract |
|---|---|
| Status | New product prerequisite; not released or deployed. |
| Owner | Backend. |
| Writable paths | API command/parser/test and Backend artifact smoke declared by this change. |
| Read-only protected inputs | Internal app/server behavior, contracts, other components, operations, hosts, and production. |
| Deletion complement | None. |
| Mutable refs | None during apply. |
| Consumes | Existing address-accepting `app.RunWithOptions`. |
| Produces | Safe explicit API listener configuration and bridge reachability evidence. |
| Dependencies | Go standard library and accepted HTTP runtime. |
| Deliverables | CLI parser, tests, and internal-bridge artifact smoke. |
| Acceptance | Parser positives/negatives, full Backend tests, bridge probe, no host publication, exact cleanup. |
| Non-goals | HTTP semantic changes, interface-specific binds, DNS listener names, TLS, host topology, or deploy. |
| Operations deferred | Host loopback publication and all production routing/service configuration. |
| Stop/rollback conditions | Reject ambiguous/unsafe values and stop on default drift, bridge failure, residue, or external mutation. |

## ADDED Requirements

### Requirement: API listener configuration SHALL be explicit and bounded

`cmd/api` SHALL accept `-listen-address` with default
`127.0.0.1:8080`. The value SHALL be one valid host:port pair whose host is an
IP literal that is loopback or unspecified and whose numeric port is in
`1..65535`. Hostnames, interface-specific addresses, IPv6 zones, empty hosts,
zero/out-of-range/non-numeric ports, malformed pairs, duplicate flags, and
positional arguments SHALL fail with bounded command usage before the API
starts. Parser failures SHALL use a fixed single-line error envelope and SHALL
not echo caller-controlled argument bytes. The accepted value SHALL be passed unchanged to
`app.RunWithOptions`.

#### Scenario: Existing local invocation omits the new flag
- **WHEN** the API receives its accepted existing arguments without `-listen-address`
- **THEN** it listens on `127.0.0.1:8080`
- **AND** all existing HTTP behavior remains unchanged

#### Scenario: A container bridge listener is explicit
- **WHEN** the API receives `-listen-address 0.0.0.0:8080`
- **THEN** it passes that exact value to the app runtime
- **AND** a separate container on the same internal bridge can reach its health endpoints

#### Scenario: A listener could escape the bounded policy
- **WHEN** the host is a DNS name, interface-specific IP, zoned IPv6 address, empty value, or the port/pair/argument list is invalid
- **THEN** command parsing fails before the listener or any product process starts

#### Scenario: Invalid input attempts to amplify the error
- **WHEN** an invalid flag, listener, or positional argument is oversized or contains control/newline bytes
- **THEN** parsing returns one bounded single-line error without reflecting the supplied bytes

### Requirement: Container reachability SHALL be tested without host exposure

Backend artifact smoke SHALL run the accepted API image on a uniquely owned
internal user-defined bridge with the explicit unspecified listener. A separate
pinned helper container SHALL probe `/livez`, `/readyz`, and `/metrics` by the
API container's bridge identity. Smoke SHALL publish no host port, join no
pre-existing/live network, and contact no external endpoint. It SHALL remove
only its exact containers, network, and loaded image on success or failure.
Every created container and network SHALL be captured by immutable Docker ID;
cleanup SHALL re-check the current name/label/ID tuple and delete by that ID,
never by a reusable name. The first post-load image ID SHALL be recorded before
other runtime checks. Image cleanup SHALL never use force, SHALL act only on
that immutable ID, and SHALL report a tag/ID replacement without deleting the
replacement.

#### Scenario: API is reachable through a normal bridge
- **WHEN** the API and helper join the owned internal bridge
- **THEN** all three probes succeed from the helper without a shared network namespace or host port

#### Scenario: A smoke resource already exists
- **WHEN** the generated container/network/image identity collides with pre-existing state
- **THEN** smoke fails before replacement or removal of that state

#### Scenario: A smoke name changes ownership before cleanup
- **WHEN** a container, network, or image tag no longer resolves to the immutable identity created or loaded by this run
- **THEN** smoke fails, preserves the primary failure, and does not delete the replacement resource
