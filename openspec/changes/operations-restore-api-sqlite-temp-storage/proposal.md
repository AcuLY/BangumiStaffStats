## Why

The embedded updater fails with SQLITE_BUILD_FAILED / database or disk is full (13). A full isolated reproduction downloaded the official Archive successfully, then failed on SQLite work. The API retains a 16 MiB /tmp tmpfs and lost the legacy updater's SQLITE_TMPDIR environment during consolidation. An identical-image 32 MiB temporary-table probe fails by default and succeeds with the Archive-disk directory.

## What Changes
- Set fixed SQLITE_TMPDIR=/var/lib/bgmss/archive on API, which now owns Archive production.
- Require that projection in Operations tests and reconcile retired updater-only documentation.
- Back up and replace only the server Compose file, recreating API with its already accepted image.

## Capabilities
### New Capabilities
None.
### Modified Capabilities
- operations-single-host-deployment: SQLite temporary storage belongs to the embedded updater in API.

## Impact
One fixed API environment entry, Operations tests/docs and authorized server configuration. No dependency, schema, application code, route, resource-limit or image change. Preserve unrelated local documents.
