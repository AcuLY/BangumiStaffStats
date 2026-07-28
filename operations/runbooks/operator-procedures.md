# Fixed operator procedures

## Preconditions

These procedures apply only after a separate production change has installed
and activated the reviewed controller. They do not authorize host mutation by
the current repository-definition change.

Every application/data operation shares the non-waiting
`/run/bgmss-v2.lock`. Exit `75` means another admitted transaction owns the
lock. Exit `78` means automatic compensation could not be proved safe; stop
automation and preserve all evidence.

## Preflight

Run:

```text
/srv/bgmss-v2/bin/bgmss-ops preflight
```

This verifies the closed root/controller inventory, ownership and modes,
immutable release/data markers, active refs, fixed commands, free space, and
absence of symlink/special/unknown state. Success means the installed state is
admissible; it does not publish, activate, release, or deploy anything.

## Install or deploy a published application release

The normal path is the manual, production-Environment-gated deploy workflow.
Its one remote command is:

```text
sudo -n -- /usr/local/sbin/bgmss-v2-deploy --version <strict-vMAJOR.MINOR.PATCH> --manifest-digest <published-manifest-sha256>
```

That remains the exact SSH original command emitted by the workflow. The
authorized-key forced command validates it, passes the two values as one
closed TSV record, and invokes the only sudo-authorized command,
`/usr/local/sbin/bgmss-v2-deploy --sudo-stdin`. The sudoers rule does not
authorize variable arguments, wildcards, regular expressions, environment
injection, or an alternate executable.

The wrapper downloads only the named published release, enforces the fixed
authority and size limits, verifies and immutably publishes its closed bytes,
switches `release.env`, restarts and verifies API readiness/build/data plus one
catalog-derived rankings query, and switches `current-frontend` last.
Every acquisition directory and file is entered in the transaction ledger
before its exclusive creation and is identity-sealed immediately afterward.
The controller never treats a reverse walk of the current tree as proof of
ownership; a walk is used only to compare the observed tree with the already
closed creation ledger. A foreign object observed before final sealing is
preserved and forces exit `78`.

On a strictly fresh root, the same transaction first runs the candidate's
pinned Updater once. It requires exactly one published Archive, runs the
release's standalone smoke verifier, freezes the version to root ownership,
records its inode/digest inventory, and absent-creates `current.json` before
starting API. Before that one-shot starts, the controller absent-creates an
unreadable root-owned `current.json` sentinel from
`compose/updater-current-deny`; Compose bind-mounts that exact inode over the
Updater's pointer path. The controller gives that one-shot an exact run-scoped
name and label, captures its immutable container ID plus security projection,
and may stop/remove only that still-matching ID. Project/service label queries
are collision checks only; they never select a cleanup target. It removes the
captured sentinel before validating publication or absent-publishing the real
pointer. Failure leaves active application/data refs absent; published/status
residue that cannot be reversed by exact identity exits `78`.

## Weekly or manual Archive update

Run:

```text
/srv/bgmss-v2/bin/bgmss-ops update
```

The one-shot Updater has a six-hour timeout and bounded output. A `no-change`
terminal record leaves `current.json`, the API container identity, and every
version byte unchanged. A successful publication is smoke-checked, frozen,
marked, atomically activated, and verified before `previous.json` is committed.
Only success emits the single canonical `update_activated` event.

If acquisition, timeout, validation, or pre-switch checks fail, no activation
event is emitted. If the new Archive fails after switching, the wrapper
restores and verifies the previous pointer. If both states fail, exit `78`
stops automatic cycling and records both error codes.

`HUP`, `INT`, and `TERM` remain transaction events while the shared lock is
held. Acquisition, bootstrap, producer, application, and data phases retain
exact compensation identities; regular-file refs seal device, inode, owner,
mode, link count, size, and digest, while Frontend links seal their lstat
identity and target. Publication and identity sealing share one signal guard.
The exit handler compensates and verifies before releasing the lock. Run-owned
temporary files are removed only when device/inode identity still matches.
Same-byte new inodes and same-target new symlinks are foreign replacements and
are preserved. Unprovable cleanup exits `78`.

## Application rollback

Supply the exact application version currently active:

```text
/srv/bgmss-v2/bin/bgmss-ops rollback-app --expected-current-version <strict-vMAJOR.MINOR.PATCH>
```

This changes only the application release environment, API process generation,
and Frontend link. It seals and re-verifies the current data pointer, performs
the bounded recent-log check, and persists rollback evidence before committing.
A mismatched expected version refuses before switching.

## Data rollback

Supply the exact data version currently active:

```text
/srv/bgmss-v2/bin/bgmss-ops rollback-data --expected-current-data-version <dv1-64hex>
```

This changes only `current.json` and the API process generation. It verifies
that both the application environment and Frontend link are byte-identical
before and after, performs the bounded recent-log check, and persists rollback
evidence before committing. A mismatched expected data version or
cross-dimension drift refuses the transaction.

## Health and identity checks

Run:

```text
/srv/bgmss-v2/bin/bgmss-ops check
```

The check covers controller/release/data identity, standalone Archive smoke,
`/readyz`, build and snapshot metrics, one catalog-derived typed rankings
query, API RSS, last successful Archive age, and recent API log access. It does
not depend on Prometheus availability.

## Retention cleanup

First enumerate only:

```text
/srv/bgmss-v2/bin/bgmss-ops cleanup --dry-run
```

After reviewing that exact list, run:

```text
/srv/bgmss-v2/bin/bgmss-ops cleanup --apply
```

Cleanup requires a current successful rollback-exercise marker and a green
full check. It retains current and previous application/data states, refuses
staging/foreign/symlink/device/inode/ownership ambiguity, and removes only
closed controller-marked trees. It never removes a legacy or named volume.

## Manual recovery

On exit `78`:

1. stop scheduled and deploy retries;
2. preserve `recovery/manual-run-<32hex>.json`, current/previous refs, release
   trees, data versions, status, and journal evidence;
3. do not delete `.bgmss-stage-*`, `.acquire-*`, bootstrap staging, or an
   unknown path, and do not stop a same-label container unless its exact
   transaction-sealed ID and security identity still match;
4. compare the recorded primary and secondary codes with the current exact
   inode/digest identities; and
5. use only the read-only fixed check while preparing a separately reviewed
   recovery decision:

```text
/srv/bgmss-v2/bin/bgmss-ops check
```

Do not combine application and data rollback, rewrite markers, run broad
recursive deletion, or touch the legacy stack. Nginx/systemd installation or
reload, public routing, TLS/DNS/firewall changes, and production activation
remain separate explicitly approved actions.
