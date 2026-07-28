# Operations

This directory defines the bounded single-host runtime, release controls, and
isolated validation machinery for Bangumi Staff Stats v2. Application source is
never built on the production host.

## Lifecycle vocabulary

The following states are deliberately independent:

- **repository-defined**: reviewed files exist in this repository.
- **installed**: the reviewed controller or an inert host template has been
  copied to its exact host path.
- **activated**: the `bgmss_v2` containers or a host integration unit is
  running.
- **released**: immutable images and the matching GitHub Release manifest have
  been published.
- **deployed**: one published release has passed the locked production
  transaction and become the active application/Frontend pair.

Repository-defined does not imply any of the other four states. In particular,
the files in `nginx/` and `systemd/` are inert templates.

## Fixed production boundary

- root: `/srv/bgmss-v2`
- Compose project: `bgmss_v2`
- API publication: `127.0.0.1:18080:8080`
- shared lock: `/run/bgmss-v2.lock`
- operator entrypoint: `/srv/bgmss-v2/bin/bgmss-ops`
- deployment entrypoint: `/usr/local/sbin/bgmss-v2-deploy`

Only immutable release image digests are accepted. API and Prometheus share the
internal runtime network; API and the one-shot Updater are the only members of
the egress-capable outbound network. Prometheus has no host port.

Both production entrypoints install the same `HUP`/`INT`/`TERM`/`ERR` exit
guard after inheriting the shared lock. Bootstrap, release acquisition,
fresh-Archive publication, routine Updater execution, application switching,
and data switching each retain closed compensation identities until terminal
evidence succeeds. The lock is released only after compensation and exact
temporary cleanup, or after an exit-`78` manual-recovery record is persisted.

## Controller package

`bin/assemble-controller-package.mjs` turns one reviewed Operations tree and
its admitted 40-hex revision into the exact bootstrap package. It accepts only
an absent absolute output root, copies the closed controller inventory, applies
the runtime modes (including the unreadable Updater sentinel), writes the
canonical byte-and-mode manifest, fixes timestamps, and refuses destination
replacement. The package remains inert until a separately authorized host
installation makes it root-owned at the fixed paths. See the bootstrap
runbook for the command and ownership boundary.

## Verification

The repository runtime gate is:

```text
npm --prefix operations run test:runtime
npm --prefix operations run check:compose
npm --prefix operations run check:host-templates
npm --prefix operations run check:secrets
bash -n operations/bin/bgmss-ops operations/bin/bgmss-v2-deploy operations/bin/lib/*.sh
```

Run these through the authorized green Actions and isolated remote validation
path. They do not prove production installation, activation, release, or
deployment.

See [operator procedures](runbooks/operator-procedures.md) and the
[bootstrap boundary](runbooks/bootstrap-boundary.md).
