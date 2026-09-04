## 1. Specification and review

- [x] 1.1 Record the exact checker path, six inventory additions, protected
  inputs, rollback conditions, and zero-P0/P1 planning review.
- [x] 1.2 Strict-validate the change before completing implementation.

## 2. Implementation

- [x] 2.1 Register the six exact persistent files already introduced by active
  Frontend changes.
- [x] 2.2 Normalize the checker-internal relative source path once without
  changing any architecture predicate.
- [x] 2.3 Retain every production-entry mount assertion and set its isolated
  timeout budget to 30 seconds for full-suite contention.
- [x] 2.4 Canonicalize the production-artifact inventory paths without changing
  `/v2/` reference, content, size, or file-set policy.

## 3. Acceptance

- [x] 3.1 Run native Windows `check:architecture` and full Frontend `npm run
  check` under Node 24.18.0.
- [x] 3.2 Run strict OpenSpec validation and `git diff --check`; keep Git and
  deployment operations false.
