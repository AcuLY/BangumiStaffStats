## Why

Artifact acceptance still pins the OpenAPI digest from before the approved query-sharing removal, so current frontend packaging fails despite valid contracts. The user requested synchronizing the contract and increasing the 300 KiB initial JavaScript limit on 2026-09-09.

## What Changes

- Synchronize the existing artifact validator, Backend build pin and test, and both component statement fixtures to the exact current OpenAPI bytes. Retain strict mismatch rejection.
- Increase the initial JavaScript gzip limit to less than 350 KiB (358400 bytes), with unchanged measurement and artifact exclusions.
- Add a regression binding the accepted OpenAPI digest and Backend build pin to the source file.
- Preserve product behavior, dependencies, prior dirty work and all runtime state.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `contracts-artifact-compatibility`: require synchronized current OpenAPI identity across producers and fixtures.
- `frontend-foundation`: raise initial JavaScript gzip ceiling to 350 KiB.
- `frontend-design-system`: align the artifact acceptance ceiling to 350 KiB.

## Impact

Primary owns bounded contract/build/check/doc edits listed in design.md. This is a packaging acceptance follow-up to `contracts-remove-query-sharing` and `contracts-link-person-workspaces`; it does not take ownership of their product code or claim their complete acceptance. No dependency, API payload, persisted data, live host or Git ref changes. Work stays on master at 3612f50.

## Additional reviewed contract mismatch

Release assembly on 2026-09-11 proved the earlier 1..2 declaration incorrect: the accepted Backend and positive fixtures declare exactly 2..2, and assembly requires identical Archive declarations. Synchronize frontend/build/artifact.mjs to 2..2 using the Contracts-owned supported version constant, and compare its complete Archive declaration with the Backend positive fixture in frontend/build/test.mjs. These two additional writable paths remain packaging-only; no Archive schema or runtime change. This is required to complete the user-requested contract synchronization.
