## Capability Boundary

- **Status:** operations contract clarification only; no host mutation.
- **Owner:** Operations, consuming accepted updater/backend behavior.
- **Writable paths:** this delta and synchronized root capability; no
  operations implementation file is writable unless implementation evidence
  proves a stale admission assertion requires exact correction.
- **Read-only protected inputs:** live hosts/services/routes/secrets/data,
  updater/backend product code outside declared owners, and remotes.
- **Deletion complement:** only claims that API startup/readiness re-admits an
  Archive; pointer atomicity, readiness/query checks, and rollback remain.
- **Mutable refs:** local topic branch only.
- **Consumes:** producer-published Archive, current pointer, direct-open Backend.
- **Produces:** clarified validation/readiness/rollback responsibility.
- **Dependencies:** updater producer validation and Backend direct open.
- **Deliverables:** strict-valid operations delta and matching docs/tests if
  required.
- **Acceptance:** operations never treats readiness as Archive admission.
- **Non-goals:** topology, ports, proxy, deployment, release, or host changes.
- **Operations deferred:** all live/isolated host writes and activation.
- **Stop/rollback conditions:** stop on rollback/atomicity weakening or failed
  strict validation; preserve parent operations definitions.

## MODIFIED Requirements

### Requirement: Live traffic SHALL require a real Archive

The public V2 runtime SHALL use a non-fixture Archive published by the
producer after all producer-owned validation. API readiness, catalog, metrics,
and the Prometheus scrape SHALL agree on the opened SQLite
`archive_meta.data_version`. API startup/readiness SHALL prove contained
read-only open and the fixed business probe only; it SHALL NOT repeat or claim
Archive manifest/digest/integrity/foreign-key/schema/table-count admission.
Update or direct-open failure SHALL retain or restore the prior pointer rather
than activate partial, fixture, or unusable data.

Updater and API acquisition traffic SHALL use the host-transparent egress
authority. The project SHALL retain only its base Compose topology and receive
no dedicated/generic proxy variable, overlay, or proxy network. The
intentionally stopped legacy loader SHALL remain stopped and SHALL NOT be a
rollback dependency.

#### Scenario: Real producer-published Archive is active

- **WHEN** public V2 traffic is enabled
- **THEN** the current Archive SHALL be non-fixture and traceable to a
  successful producer publication
- **AND** readiness, catalog, metrics, and Prometheus SHALL report the same
  opened dataVersion without a Backend Archive admission pass

#### Scenario: Update, open, or business readiness fails

- **WHEN** updater execution publishes no valid terminal result, direct open or
  fixed readiness probe fails, or runtime observers disagree
- **THEN** the prior Archive pointer SHALL remain or be restored
- **AND** public routing and the stopped legacy loader SHALL remain unchanged

#### Scenario: Host egress remains external to the project

- **WHEN** updater or API acquisition needs DIRECT or Proxy egress
- **THEN** the host gateway SHALL classify the destination transparently
- **AND** no application proxy input, overlay, or proxy-network attachment
  SHALL appear in the project
