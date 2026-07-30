## ADDED Requirements

### Requirement: V2 SPA entry HTML SHALL identify the active release

The exact `/v2/`, exact `/v2/index.html`, and named `/v2/**` SPA fallback
responses SHALL return the currently active `index.html` bytes and SHALL NOT
allow mtime/size-derived validators from a previous release to produce a
successful stale revalidation. Those responses SHALL disable ETag generation,
ignore `If-Modified-Since`, and emit `Cache-Control: no-store`.

The ordinary `/v2/` static prefix location SHALL retain its existing direct
asset behavior so content-hashed JS, CSS, fonts, and images are not assigned the
SPA-entry policy.

#### Scenario: Previous release validators collide

- **WHEN** a client requests `/v2/`, `/v2/index.html`, or an SPA route with the
  previous release's `If-None-Match` and `If-Modified-Since` values
- **THEN** Nginx SHALL return `200`, `Cache-Control: no-store`, and HTML that
  references the active release's asset
- **AND** it SHALL NOT return `304` solely because normalized mtime and byte
  length collide

#### Scenario: Hashed asset is requested

- **WHEN** a client requests an existing content-hashed asset below `/v2/`
- **THEN** Nginx SHALL serve that asset through the unchanged static prefix
  location
- **AND** the SPA-entry-only non-storable policy SHALL NOT be projected onto it

#### Scenario: Live repair fails

- **WHEN** the active vhost preimage drifts or syntax, reload, content, legacy
  root, API, or browser acceptance fails
- **THEN** the exact repair backup SHALL be restored and reloaded
- **AND** no unrelated vhost or application state SHALL be changed
