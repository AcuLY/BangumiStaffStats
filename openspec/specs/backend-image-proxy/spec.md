# backend-image-proxy Specification

## Purpose
Define bounded same-origin Bangumi image retrieval with exact routing,
fixed-origin transport, safe streaming/cache behavior, cancellation, and
low-cardinality failures.

## Requirements

### Requirement: The image route SHALL be exact and closed

The backend SHALL serve only
`GET /api/v1/images/bangumi/{subjects|persons|characters}/{positiveID}` with
exactly one required `type` query value from
`small|grid|large|medium|common`. It SHALL reject wrong methods, path
encodings/shapes, non-positive/overflow IDs, duplicate/unknown/missing query
fields, and unsupported values through the accepted safe error envelope.

#### Scenario: A valid image request is made
- **WHEN** an allowed resource, positive ID, and single allowed type are sent
- **THEN** the request reaches the bounded image upstream adapter

#### Scenario: Route input is not exact
- **WHEN** method, path, ID, resource, query cardinality, query key, or type is invalid
- **THEN** the backend rejects it before any upstream request

### Requirement: Upstream access SHALL not become an open proxy

The adapter SHALL construct the HTTPS request from fixed `api.bgm.tv`, the
validated resource/ID/type, and no caller-supplied URL, scheme, host, port,
path, or header. It SHALL forward no Cookie, Authorization, token, proxy, or
arbitrary request header. Redirects SHALL be rejected without following them.
Image and collection concurrency SHALL remain separate.

#### Scenario: An upstream location or credential bypass is attempted
- **WHEN** a request tries host/path/query/header injection, encoded traversal,
  redirect, DNS/IP target, Cookie, Authorization, or token forwarding
- **THEN** no unapproved target is contacted and no credential is sent

### Requirement: Image transfer SHALL be bounded and cancellation-aware

The adapter SHALL apply a bounded timeout and concurrency limit; accept only
reviewed successful upstream status and image MIME values; enforce a maximum
body size while streaming; propagate request cancellation; and close upstream
bodies on every path. Upstream errors, bodies, locations, and internal details
MUST NOT leak through the API error.

#### Scenario: A valid bounded image is returned
- **WHEN** upstream returns an allowed image response within all limits
- **THEN** the backend streams the bytes without redirecting the client

#### Scenario: Upstream response is unsafe or interrupted
- **WHEN** timeout, cancellation, concurrency saturation, redirect, bad status,
  non-image MIME, oversized body, read failure, or truncated transfer occurs
- **THEN** transfer terminates safely, resources close, and only a stable safe outcome is exposed

### Requirement: Only safe cache metadata SHALL cross the boundary

The proxy SHALL accept only reviewed conditional request headers and pass
through only safe `ETag`, `Last-Modified`, and `Cache-Control` response values.
It SHALL not forward arbitrary hop-by-hop, credential, tracing, cookie, CORS,
or upstream implementation headers.

#### Scenario: Conditional cache exchange succeeds
- **WHEN** a request uses an allowed conditional header and upstream returns a reviewed cache response
- **THEN** only the allowed cache metadata and correct response semantics are emitted

#### Scenario: Upstream emits unrelated headers
- **WHEN** upstream includes cookies, authorization challenges, server identity,
  hop-by-hop fields, CORS, or arbitrary metadata
- **THEN** those headers are absent from the client response

### Requirement: Image observations SHALL stay low-cardinality

The route SHALL use fixed image route/operation/outcome labels and existing
request IDs. Logs and metrics SHALL contain no raw ID, URL, query, token,
header, or upstream body.

#### Scenario: Image success and failure are observed
- **WHEN** representative successful and failed requests complete
- **THEN** observations use only closed labels and contain no user-controlled identifiers
