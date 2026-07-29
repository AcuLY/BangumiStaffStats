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

The adapter SHALL construct the initial HTTPS request from fixed
`api.bgm.tv`, the validated resource/ID/type, and no caller-supplied URL,
scheme, host, port, path, or header. It SHALL forward no Cookie,
Authorization, token, proxy, or arbitrary request header. Automatic redirect
following SHALL remain disabled.

The adapter MAY manually follow exactly one `302` only when the initial fixed
request returns one bounded absolute Location whose scheme is `https`, host is
exactly `lain.bgm.tv`, user information and fragment are absent, and port is
absent or `443`. It SHALL close the intermediate body and issue one explicit
GET under the original timeout and concurrency permit. It SHALL reject a
relative, malformed, oversized, credentialed, non-HTTPS, other-host,
non-default-port, fragmented, non-302, or second redirect before contacting
the unapproved target. Direct mode SHALL retain public-address filtering for
the two exact approved hosts; proxy mode SHALL permit dialing only the explicit
configured proxy while request targets remain closed. Image and collection
concurrency SHALL remain separate.

#### Scenario: Official image redirect succeeds

- **WHEN** the fixed `api.bgm.tv` request returns one valid `302` Location on HTTPS `lain.bgm.tv` and that target returns an accepted image response
- **THEN** the Backend SHALL stream the final image without exposing a redirect or Location to the caller

#### Scenario: Redirect target or count is unsafe

- **WHEN** a redirect differs from the one approved class or the `lain.bgm.tv` response redirects again
- **THEN** no unapproved target SHALL be contacted and only the stable safe protocol failure SHALL be exposed

#### Scenario: An upstream location or credential bypass is attempted

- **WHEN** a request tries host/path/query/header injection, encoded traversal, DNS/IP target, Cookie, Authorization, token, or incoming proxy-header forwarding
- **THEN** no unapproved target SHALL be contacted and no credential SHALL be sent

### Requirement: Image transport proxy selection SHALL be explicit

When `BGMSS_IMAGE_HTTPS_PROXY` is absent, image retrieval SHALL remain direct
and SHALL ignore every upper- or lower-case HTTP, HTTPS, ALL, and NO proxy
environment variable. When present, the value SHALL be at most 320 ASCII bytes
and exactly one canonical credential-free `http://HOST:PORT` URL using the
existing release proxy host/port rules; empty, malformed, credentialed,
non-HTTP, path/query/fragment-bearing, or noncanonical values SHALL make API
startup fail before serving or image egress. The value SHALL NOT appear in
errors, logs, metrics, or responses.

The dedicated value SHALL be used only as transport for the fixed approved
image targets. Ambient bypass variables, including `NO_PROXY=*`, SHALL NOT
bypass it. Destination HTTPS certificate and hostname verification SHALL
remain enabled.

#### Scenario: Dedicated proxy is absent

- **WHEN** generic proxy or bypass variables are present without `BGMSS_IMAGE_HTTPS_PROXY`
- **THEN** image transport SHALL remain direct and none of those variables SHALL select a proxy

#### Scenario: Dedicated proxy is valid

- **WHEN** `BGMSS_IMAGE_HTTPS_PROXY` is one valid credential-free HTTP proxy URL
- **THEN** both approved HTTPS image requests SHALL use that proxy without weakening target or TLS validation

#### Scenario: Dedicated proxy is invalid

- **WHEN** the dedicated value is present but empty, malformed, noncanonical, credentialed, oversized, non-ASCII, or contains unapproved URL components
- **THEN** API startup SHALL fail safely before serving or image egress without reflecting the value

### Requirement: Image transfer SHALL be bounded and cancellation-aware

The adapter SHALL apply one bounded timeout and concurrency permit across the
initial request, optional approved redirect, and final body; accept only
reviewed successful final status and image MIME values; enforce the existing
maximum body and response-header sizes; propagate request cancellation; and
close every intermediate and final body on every path. Upstream errors,
bodies, locations, proxy values, and internal details MUST NOT leak through
the API error.

#### Scenario: A valid bounded image is returned

- **WHEN** the direct response or approved redirect target returns an allowed image response within all limits
- **THEN** the Backend SHALL stream the bytes with the existing response and cache semantics

#### Scenario: Upstream response is unsafe or interrupted

- **WHEN** timeout, cancellation, concurrency saturation, unapproved redirect, second redirect, bad status, non-image MIME, oversized body/header, read failure, or truncated transfer occurs
- **THEN** transfer SHALL terminate safely, all resources SHALL close, and only a stable safe outcome SHALL be exposed

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
