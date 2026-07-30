# Catalog configuration

`display-v1.yaml` is the governed display, capability, shortcut, and cast-group
configuration. `staff-sets-v1.yaml` is the versioned staff-set extension; the
active v1 file is intentionally empty.

The updater rejects duplicate YAML keys and validates both documents against
the Contracts catalog schemas. It then emits one fixed-field canonical JSON
document with a trailing LF. Display array order remains semantic; staff-set
members are ASCII-sorted and staff sets are sorted by subject type, display
order, and key. `catalogConfigDigest` is SHA-256 over those canonical bytes,
not over either YAML file's spelling.

Pass the absolute path to `display-v1.yaml` as the producer's existing
`--catalog-config` argument. The matching staff-set file is resolved from this
directory. Configuration changes take effect only in a newly built immutable
Archive; there is no hot reload or activation behavior here.
