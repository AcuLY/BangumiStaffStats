# Historical query-contract acceptance

`verify.mjs` and `manifest.json` are exact copies taken before query-sharing
retirement on 2026-09-08. They preserve the former macOS-only acceptance
transcript and are not active specifications or evidence of a new run.

The old harness required fixed `/Users/luca` executable paths and hashes,
macOS `sandbox-exec`, offline tool materialization/recovery transcripts,
relocation/admission checks, and sandbox-specific cleanup probes. These
host-specific checks were not rerun on Windows and are not claimed by the
current verifier. Sharing-specific semantic tests are intentionally retired.

The current verifier preserves the remaining query normalization, strict
schema and negative tests, digest exclusions, RFC8785 canonicalization,
Unicode 15.1/NFKC checks, operation inputs/views, error envelopes and unknown
field checks. It independently checks projection references and exact schema
metadata removal, five-way golden validation equivalence, deterministic
Go/TypeScript generation, generated-consumer drift, query Go tests, input
immutability and bounded disposable output cleanup. Current recorded evidence
is in `contracts/goldens/query/manifest.json`.
