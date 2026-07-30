# Updater development artifact

This directory owns the development-only Updater artifact boundary. Generated
wheel, Linux runtime bundle, OCI archive, checksum inventory, SPDX 2.3 SBOM,
component statement, caches, and disposable smoke state stay below `.tmp/` and
are ignored. Nothing here publishes, schedules, deploys, activates an Archive,
reads or writes `current.json`, emits `update_activated`, or invokes `produce`.

The reviewed immutable inputs are:

- the accepted
  `contracts/artifacts/producer-runtime-inputs-v1.json` and exactly its 42
  tracked `100644` blobs;
- the tracked `display-v1.yaml` and `staff-sets-v1.yaml` catalog pair;
- CPython `3.14.6`;
- uv `0.11.32`;
- Docker Buildx `0.34.1`;
- BuildKit `0.27.1`, through the current `docker-container` builder (local
  acceptance explicitly selects `bgmss-artifacts-v0271`);
- `docker.io/moby/buildkit:v0.27.1@sha256:1e110c71d389d6d24f67b9438e2f7b8da749a6ff407b22a1631e025c95599368`;
- `python:3.14.6-slim-bookworm@sha256:86f975aca15cf04a40b399eebede9aea7c82eae084d1f1a0a6ef6bcaae871a30`;
- `ghcr.io/astral-sh/uv:0.11.32@sha256:df4cae8f3a96d175e2e5f992e597550000edbe78fdc2594d5cd8de1a217f504c`.

Run the focused deterministic helpers from `updater/`:

```sh
export PYTHONDONTWRITEBYTECODE=1
export PYTHONPYCACHEPREFIX="$PWD/build/.tmp/pycache"
PYTHON="$PWD/.venv/bin/python"

"$PYTHON" -m unittest discover -s build -p 'test_*.py' -v
"$PYTHON" build/artifact.py verify-dockerfile
"$PYTHON" build/check.py \
  --python "$PYTHON" \
  --target linux/arm64
```

The last command performs two isolated frozen wheel/Linux-bundle builds with
fresh cache/output roots and byte-compares their artifacts, SHA-256 inventory,
build metadata, and SPDX document. It deliberately omits OCI, the Contracts
statement, and container smoke for the fast native-only gate.

After that handoff, the full acceptance command is:

```sh
"$PYTHON" build/check.py \
  --python "$PYTHON" \
  --docker "$(command -v docker)" \
  --builder bgmss-artifacts-v0271 \
  --contracts-root "$PWD/../contracts" \
  --target linux/arm64
```

It builds and normalizes two Docker-load-compatible OCI-media-type archives
sequentially with `push=false`, emits the strict Contracts-owned statement,
compares every output byte, publishes only the validated content address below
`.tmp/published/`, and runs `doctor`, embedded `contract-check`, and an
embedded catalog-loader probe from the image as UID/GID `65532:65532` with a
read-only filesystem and no network. The pinned single-platform Docker
exporter owns the sole compatibility `manifest.json`; its exact tag, config
and ordered layer paths must match the closed OCI layout `1.0.0` graph. Raw
export passes a bounded USTAR admission path before normalization, rejecting
unsafe, duplicate, linked, PAX/xattr, sparse, special, oversized, trailing,
extra and orphan members. No product, Contracts, or catalog path is mounted
into the container. The selected (or current, when `--builder` is omitted)
builder is validated before use and is passed explicitly to `buildx build`.
Smoke captures each created container ID and the first post-load image ID;
cleanup verifies current name/owner/ID tuples, deletes only by immutable ID,
never force-removes an image, and preserves replacement tags.

Both acceptance entrypoints derive revision, tree, and commit epoch from the
canonical checkout before tests, snapshots, or output mutation. For every
tracked regular blob, they compare the `HEAD` tree object ID and mode, the
stage-zero index object ID and mode, and the raw worktree bytes and executable
mode. Assume-unchanged, skip-worktree, non-stage-zero entries, untrusted ignore
controls, and every untracked non-ignored path fail closed; local attributes,
filters, global excludes, and `.git/info/exclude` cannot weaken the gate.

The source snapshot is then written only from the bytes retained by that
attestation. It never traverses the live `updater/src`, Contracts, or catalog
trees, so ignored `__pycache__`, `*.pyc`, `.env`, mutable authority bytes, and
similar local residue cannot enter or alter an artifact. The native bundle v2
stores the exact producer tree below `producer/` as `0:0` and `0444`/`0555`;
the image stores the same bytes below `/opt/bgmss/producer/` as
`65532:65532` and `0444`/`0555`. Canonical producer metadata, build metadata
v2, three fixed OCI labels, and the component statement bind the same manifest,
catalog digest, and common commit.

`--source-revision`, `--source-tree`, and `--source-date-epoch` may only repeat
the derived values exactly; they cannot select or override a candidate. Final
reproducibility and container acceptance therefore run only after the
implementation has been committed into the clean detached candidate checkout.
