## MODIFIED Requirements

### Requirement: Compose SHALL run the minimal single-host topology

Compose SHALL define long-running API and Prometheus services plus a one-shot
updater. Host ports SHALL bind to loopback, writable data SHALL be isolated
below the configured root, services SHALL use bounded resources and hardened
non-root settings, and stdout/stderr SHALL use journald. No Docker socket,
legacy path, public metrics endpoint, mutable `latest`, or shared writable
volume is allowed.

The base topology SHALL retain direct updater and image transport. Release env
SHALL encode exact mode `direct` or `proxy`; proxy mode SHALL require both a
strictly validated `BGMSS_UPDATER_HTTPS_PROXY` and
`BGMSS_UPDATER_PROXY_NETWORK`, while direct mode SHALL forbid both. The URL
rules SHALL match the updater capability and the network name SHALL be 1–128
ASCII bytes matching `[A-Za-z0-9][A-Za-z0-9_.-]*`.

The tracked proxy overlay SHALL be selected only for valid proxy mode. It
SHALL map the release URL to updater-only `BGMSS_HTTPS_PROXY` and API-only
`BGMSS_IMAGE_HTTPS_PROXY`, attach only API and updater to the named
pre-existing external network, publish no additional port, and leave
Prometheus projection unchanged. Operations SHALL inspect but SHALL NOT
create, alter, or remove the external network or proxy service.

The common Compose wrapper SHALL derive mode, URL, and network exclusively
from the root-managed `current.env` after exact validation. It SHALL remove
ambient `BGMSS_UPDATER_TRANSPORT`, `BGMSS_UPDATER_HTTPS_PROXY`, and
`BGMSS_UPDATER_PROXY_NETWORK` from the Compose child process, or provide an
equivalent isolation that prevents shell-over-`--env-file` precedence. A
conflicting calling-shell value SHALL neither select the overlay nor replace
the URL/network. API and updater SHALL receive no generic HTTP/HTTPS/ALL/NO
proxy input from this projection.

#### Scenario: Runtime starts from an admitted env

- **WHEN** the env names present local image identities, a valid Archive root, unique project, and free loopback ports
- **THEN** API `/livez` and `/readyz`, API `/metrics`, Prometheus readiness, and the API scrape SHALL succeed

#### Scenario: Direct runtime remains closed

- **WHEN** a valid direct release is rendered
- **THEN** API, updater, and Prometheus SHALL remain on the backend network and no service SHALL receive a dedicated proxy input

#### Scenario: Proxy runtime is projected

- **WHEN** a valid proxy release is rendered and its named external network exists
- **THEN** API SHALL receive only the image proxy input, updater SHALL retain only its updater proxy input, both SHALL join the external network, and Prometheus SHALL receive neither input nor attachment

#### Scenario: Calling shell conflicts with release authority

- **WHEN** `current.env` contains one admitted direct/proxy mode while the calling shell exports conflicting transport, URL, network, or generic proxy values
- **THEN** Compose projection SHALL equal the validated `current.env`, with no ambient selection, replacement, or bypass

#### Scenario: Runtime authority is widened

- **WHEN** a service uses host networking/PID, a public bind, Docker socket, legacy mount, unbounded resource, root user, undeclared writable path, invalid mode/pair/network, swapped or generic proxy input, Prometheus external-network attachment, or release-authorized mode/URL/network bypass
- **THEN** static or Compose validation SHALL fail before startup

### Requirement: Live traffic SHALL require a real Archive

Replacement deployment SHALL preserve exact transport `proxy`, URL
`http://myserver-proxy:7897`, and network `proxy-net`. Compose projection SHALL
attach API and updater to that external network, pass only updater
`BGMSS_HTTPS_PROXY=http://myserver-proxy:7897` plus
`SQLITE_TMPDIR=/var/lib/bgmss/archive`, and pass only API
`BGMSS_IMAGE_HTTPS_PROXY=http://myserver-proxy:7897`; Prometheus SHALL receive
none of those inputs and SHALL remain absent from `proxy-net`. Updater `/tmp`,
mounts, resources, security controls, and every other service/network value
SHALL remain unchanged.

#### Scenario: Proxy transport is projected exactly

- **WHEN** the admitted base Compose and proxy overlay install over their exact preimages and private checks pass
- **THEN** updater SHALL join `proxy-net` with exact updater-proxy and SQLite inputs, API SHALL join it with only the exact image-proxy input, Prometheus SHALL receive neither input nor attachment, and exactly one newly authorized production updater invocation MAY run

#### Scenario: Proxy deployment widens authority

- **WHEN** Prometheus joins `proxy-net`, API receives an updater or generic proxy input, updater receives the image or a generic proxy input, another proxy/SQLite value or network is projected, another Compose field changes, the endpoint/network is mutated, or another updater invocation is requested after the newly authorized attempt
- **THEN** deployment SHALL stop, retain or restore legacy public routing, and SHALL NOT force progress

## ADDED Requirements

### Requirement: Production image egress repair SHALL be reversible

On `myserver`, the accepted replacement application SHALL first deploy through
the existing `/srv/bgmss-v2` transaction while the old overlay remains active.
After application health succeeds, operations SHALL take the existing
non-waiting lock, verify and back up the installed overlay, atomically replace
only `/srv/bgmss-v2/compose/compose.updater-proxy.yaml` among installed
operations definitions, and force-recreate API so the new environment and
network projection take effect.

The transaction SHALL preserve the current Archive and proxy release fields.
It SHALL NOT invoke updater or change base Compose, operations commands,
Prometheus, Nginx, systemd, logrotate, proxy/network lifecycle, public routing,
or legacy state. After successful acceptance, the admitted replacement
application, overlay, and proxy projection become the current baseline; the
earlier one-time activation preimages remain historical evidence and SHALL NOT
be reused as current-state admission values.

#### Scenario: Production repair succeeds

- **WHEN** the admitted application deploys, the overlay preimage matches, API is recreated with the exact proxy projection, and health/image/Prometheus checks pass
- **THEN** the bounded image route SHALL return an accepted final image while all protected runtime state remains unchanged

#### Scenario: Overlay activation fails

- **WHEN** overlay installation, API recreation, projection, health, image, or isolation verification fails
- **THEN** operations SHALL restore the exact prior overlay, force-recreate API under the restored projection, verify API is detached from the external network, and use normal application rollback if the replacement release must also be reverted
