## Capability Boundary

| Field | Declaration |
|---|---|
| Status | Modified transport behavior implemented and accepted at A2/B2 with green exact-head Actions. |
| Owner | Updater implementation owner; main agent specification/audit/acceptance. |
| Writable paths | Updater source/tests declared in the proposal and this delta. |
| Read-only protected inputs | Contracts, source origin/redirect allowlists, content bounds/digests, data semantics, other components, host/proxy state, and every undeclared path. |
| Deletion complement | No persistent path or dependency; exact test temporaries only. |
| Mutable refs | This change task state and later Git lifecycle only. |
| Consumes | Existing one-shot produce request and strict standard-library HTTPS client. |
| Produces | Optional validated `BGMSS_HTTPS_PROXY` transport input that cannot be selected or bypassed by ambient proxy variables. |
| Dependencies | Complete reviewed change before apply; operations consumes this input after updater acceptance. |
| Deliverables | Implementation, tests, documentation, and green component/full gates. |
| Acceptance | Requirement scenarios, including `NO_PROXY=*`, plus unchanged producer tests, typing, lint, build, and artifact gates. |
| Non-goals | Origin expansion, TLS bypass, credentials, generic proxy inheritance, retries, dependency changes, or host mutation. |
| Operations deferred | Runtime proxy projection and production retry remain operations-owned. |
| Stop/rollback conditions | Reject invalid configuration before staging/network; preserve direct behavior on any failed candidate. |

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
