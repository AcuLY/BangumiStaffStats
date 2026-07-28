# Production bootstrap boundary

## Status and authorization

This runbook describes a later production prerequisite. The current Operations
change provides repository-defined, inert inputs only. Creating the account,
writing `/usr/local`, creating `/srv/bgmss-v2`, installing Nginx/systemd
files, reloading daemons, or starting `bgmss_v2` requires separate explicit
production approval.

The initial root administrator installs one reviewed controller package. The
package root is exactly `/usr/local/libexec/bgmss-v2`, its payload is exactly
the closed inventory in `operations/config/controller-files.json`, and its
canonical `controller-manifest.json` binds every file's path, mode, size, and
SHA-256 digest. The byte-identical deployment wrapper is installed at
`/usr/local/sbin/bgmss-v2-deploy`, owned by root, group root, mode `0555`, with
one link.

The reviewed package is assembled in Actions, never on the production host:

```text
node operations/bin/assemble-controller-package.mjs \
  --operations-root /absolute/checkout/operations \
  --controller-revision <40-lowercase-hex-revision> \
  --output-root /absolute/absent/controller-package
```

The output root must be absent. The assembler creates only
`controller-manifest.json` and `payload/`, copies the exact configured
inventory, and fails on an existing destination. Package directories are
`0555`; the manifest and non-entrypoint payload files are `0444`; both
entrypoints are `0555`; and `payload/compose/updater-current-deny` is `0000`.
All packaged files have one link, fixed timestamps, and descriptors computed
from their actual bytes. The resulting build-owned package is only an inert
input. A separately authorized administrator installation must preserve those
bytes and modes, change ownership to root:root, and independently install the
byte-identical wrapper at the fixed `/usr/local/sbin` path.

The wrapper verifies the package, its own installed bytes, every parent
directory, and the global lock before sourcing controller code or writing
`/srv`. A fresh application root is assembled under a unique root-owned
same-filesystem `/srv/.bgmss-v2-stage.XXXXXXXX` directory, fully verified, and
published with an absent-destination rename. The signal/exit guard either
removes the still-staged tree by its captured device/inode or preserves a
fully verified controller-only root after publication. Unknown or
identity-changed staging state is preserved for manual recovery.

## Dedicated SSH account

The only remote deployment identity is `bgmss-deploy`.

An administrator must:

1. create that dedicated account with no administrative group membership;
2. lock its password and disable interactive password authentication;
3. create a root-owned, non-group/world-writable SSH directory and
   `authorized_keys`;
4. install exactly one reviewed deploy public key, prefixed byte-for-byte by
   `operations/config/bgmss-v2-deploy.authorized-key-options`;
5. install `operations/config/bgmss-v2-deploy.sudoers` as a root-owned `0440`
   sudoers fragment and accept it only after `visudo -cf` succeeds; and
6. verify there is no second key, user rc file, forwarding exception, `SETENV`,
   wildcard command, shell, or alternate deployment path.

The resulting authorized-key line has this shape:

```text
restrict,command="/usr/local/sbin/bgmss-v2-deploy --ssh-forced-command" ssh-ed25519 <reviewed-public-key>
```

The forced-command branch accepts no TTY and only this original command:

```text
sudo -n -- /usr/local/sbin/bgmss-v2-deploy --version <strict-vMAJOR.MINOR.PATCH> --manifest-digest <sha256-64hex>
```

It parses the two bounded values, writes exactly one
`<version><TAB><manifest-digest><LF>` record, and invokes only:

```text
sudo -n -- /usr/local/sbin/bgmss-v2-deploy --sudo-stdin
```

The sudoers fragment grants only that fixed argument string. It contains no
wildcard or argument regular expression, remains valid on sudo 1.9.5, and
never authorizes the variable version/digest argv or caller-controlled
environment. `use_pty` may make the privileged wrapper's fd 0 appear as a
terminal, so terminal detection is not an admission check. The privileged
branch instead requires the `bgmss-deploy` sudo identity and the exact fixed
`SUDO_COMMAND`, consumes exactly one closed TSV record through EOF, rejects
additional fields or bytes, and validates both values again before the
transaction. An already privileged root administrator may still use the
strictly parsed variable argv entrypoint, but the deploy account's sudo rule
cannot. GitHub Actions supplies no path, shell, environment, or controller
package, and its original remote command remains unchanged.

## Before enabling deployment

The administrator must confirm all of the following without changing live
traffic:

- the controller revision equals the `source.operationsController.revision`
  admitted by the published release manifest;
- `/run`, `/srv`, `/usr/local`, `/usr/local/libexec`, and
  `/usr/local/sbin` are root-owned and not group/world writable;
- the production Environment has an exact pinned host key, the matching
  private deploy key, and no additional deploy capability;
- `/srv/bgmss-v2`, project `bgmss_v2`, and loopback port `18080` are either
  wholly absent for first deployment or wholly controller-managed; and
- the existing legacy service, routes, containers, data, and volumes remain
  outside every v2 path and command.

Do not enable the deploy workflow until this prerequisite has its own reviewed,
explicitly authorized production implementation record.
