## 1. Specification

- [x] 1.1 Record the observed equal-validator stale-HTML failure, affected
  paths, static-asset boundary, live mutation boundary, and rollback contract.
- [x] 1.2 Strict-validate the complete change before implementation with
  OpenSpec 1.6.0.

## 2. Implementation

- [x] 2.1 Update the reviewed Nginx template for exact `/v2/`, exact
  `/v2/index.html`, and the named SPA fallback without changing the general
  static prefix.
- [x] 2.2 Add focused static assertions for the three HTML locations, preserved
  security headers, and unchanged prefix boundary.
- [x] 2.3 Document the SPA entry cache contract and run Bash/diff/OpenSpec
  source checks with all 57 OpenSpec items strict-valid.

## 3. Production acceptance

- [x] 3.1 Apply the bounded active-vhost transformation through an exact
  backup and atomic rename, validate, reload, and prove ordinary routing.
- [x] 3.2 Prove deliberately stale ETag/mtime requests return `200`, the
  current asset reference, and `Cache-Control: no-store`, while a hashed asset
  remains directly served.
- [x] 3.3 Repeat desktop and 360px browser QA, footer checks, one core
  interaction, and console/resource inspection.

## 4. Lifecycle

- [x] 4.1 Obtain green Actions for implementation commit `b562b9c0` in run
  `30519491185`.
- [x] 4.2 Sync the delta, archive the completed change, merge the final
  lifecycle state to `master`, and align the deployed release if product bytes
  changed.
