## Capability Boundary

| Field | Declaration |
|---|---|
| Status | Official asset timestamp compatibility specified; repository apply pending. |
| Owner | Main agent as updater implementation owner and specification/audit/acceptance owner. |
| Writable paths | `updater/src/bangumi_staff_stats_updater/producer/acquisition.py`, `updater/tests/producer/test_acquisition.py`, and this delta. |
| Read-only protected inputs | All other updater behavior; contracts/backend/frontend/operations except the later pin literal; upstream/external/host state; every undeclared path. |
| Deletion complement | No file or dependency; exact existing test temporaries only. |
| Mutable refs | This change task state and later narrow Git lifecycle only. |
| Consumes | Existing strict official latest-document parser and exact current upstream metadata. |
| Produces | Independent canonical validation for dump-name and GitHub asset timestamps. |
| Dependencies | Complete reviewed change before apply; later activation consumes an accepted replacement artifact. |
| Deliverables | Focused implementation/tests and green full gates. |
| Acceptance | Current official mismatch succeeds while every retained identity negative fails. |
| Non-goals | Origin/URL/ID/digest/size/content/ZIP relaxation, skew inference, retries, proxy, or host mutation. |
| Operations deferred | Artifact deployment and a newly authorized updater invocation remain operations-owned. |
| Stop/rollback conditions | Stop on any widened gate or regression; leave B2 production state unchanged. |

## MODIFIED Requirements

### Requirement: Acquisition SHALL be exact, bounded, and staged

One terminating invocation SHALL resolve one official Archive asset and one
exact common commit, accept only approved HTTPS origins/redirects, and verify
status, declared and actual size, SHA-256, ZIP safety/inventory, commit, and
`subject_staffs.yml` bytes before parsing. Download, extraction, database, and
manifest work SHALL stay in a unique staging directory below the same absolute,
canonical, non-symlink output root and filesystem as `versions/`. One
development writer per output root SHALL be a caller precondition until the
deferred operations lock exists.

The latest document SHALL retain its exact field set. The asset name SHALL be
one canonical `dump-YYYY-MM-DD.HHMMSSZ.zip` and SHALL bind the exact official
download URL; the positive JSON-safe asset ID SHALL bind the exact official API
URL; content type, bounded positive size, SHA-256 digest, label, and node ID
SHALL remain strictly validated. `created_at` and `updated_at` SHALL each be a
calendar-valid canonical GitHub UTC-seconds timestamp and `updated_at` SHALL
not precede `created_at`. The canonical timestamp embedded in the dump name
and GitHub's asset `created_at` SHALL be validated independently; they SHALL
NOT be required to equal and no inferred skew window SHALL replace either
field's independent validation.

Acquisition SHALL continue to use direct HTTPS and ignore every generic
upper/lower-case HTTP, HTTPS, ALL, and NO proxy environment variable when
`BGMSS_HTTPS_PROXY` is absent. When that dedicated input is present, it SHALL
accept only one credential-free canonical `http://HOST:PORT` value of at most
320 ASCII bytes. `HOST` SHALL be at most 253 lowercase ASCII DNS-label bytes,
each label SHALL contain 1–63 lowercase letters/digits/hyphens without an edge
hyphen, and `PORT` SHALL be canonical decimal `1..65535`; userinfo, trailing
slash, path, query, fragment, defaulted/zero-padded port, IPv6 literal, and
every other spelling SHALL be rejected. Invalid or empty configuration SHALL
fail before staging or external network access and MAY write only sanitized
lifecycle event/status evidence. Dedicated proxy mode SHALL not consult
ambient bypass rules, including `NO_PROXY=*`, and SHALL use the value only as
the HTTPS transport proxy. Approved destination and redirect hosts, normal
destination TLS certificate/hostname verification, response bounds, digests,
cancellation, and sanitized output SHALL remain identical. The proxy value
SHALL NOT appear in events or errors.

#### Scenario: Source identity or container is unsafe
- **WHEN** status/origin/redirect/size/digest/commit/member set differs, a ZIP entry escapes/links/duplicates/exceeds bounds, or cancellation occurs
- **THEN** the command SHALL return one sanitized stable failure, remove only its staging, and leave no final version

#### Scenario: Official dump and asset timestamps differ
- **WHEN** every official field and cross-binding is valid while the canonical dump-name timestamp differs from canonical `created_at`
- **THEN** the latest document SHALL be accepted without changing any later size, digest, origin, ZIP, common, or publication gate

#### Scenario: Independent latest identity is invalid
- **WHEN** the field set, dump-name grammar, official download/API binding, ID, content type, size, digest, label, node ID, timestamp format/calendar validity, or updated-after-created ordering differs
- **THEN** acquisition SHALL fail before asset download and publication

#### Scenario: Dedicated proxy is valid
- **WHEN** `BGMSS_HTTPS_PROXY` is one valid credential-free HTTP proxy URL and the proxy completes CONNECT to an approved HTTPS destination
- **THEN** acquisition SHALL preserve destination TLS and every existing origin, redirect, response, identity, and publication gate

#### Scenario: Proxy configuration is absent or invalid
- **WHEN** the dedicated input is absent, empty, over 320 bytes, non-ASCII, noncanonical, malformed, credentialed, non-HTTP, contains an invalid host/port, or contains slash/path/query/fragment data
- **THEN** absence SHALL retain direct mode while any present invalid value SHALL fail before staging or external network access without revealing the value except through sanitized lifecycle event/status evidence

#### Scenario: Ambient proxy variables are present
- **WHEN** generic upper/lower-case HTTP, HTTPS, ALL, or NO proxy variables exist without the dedicated input
- **THEN** acquisition SHALL ignore them and retain the existing direct transport

#### Scenario: Ambient bypass attempts to skip the dedicated proxy
- **WHEN** the dedicated input is valid while `NO_PROXY`, `no_proxy`, or another generic bypass variable requests an approved destination be direct
- **THEN** acquisition SHALL still use the dedicated proxy and preserve destination TLS and identity gates
