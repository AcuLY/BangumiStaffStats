## 1. Preparation

- [x] 1.1 Inspect dependency recommendation, icon inventory, current code and dirty files.
- [x] 1.2 Review complete artifacts and declare brand/chart boundaries and exact dependency.
- [x] 1.3 Update design/architecture authority and exact dependency inventory.

## 2. Implementation

- [x] 2.1 Install the exact icon package without changing existing locked versions.
- [x] 2.2 Replace all four local SVG icon implementations with library-backed wrappers.
- [x] 2.3 Update icon tests to verify vendor mapping, shared info, sizing and accessibility.

## 3. Acceptance

- [ ] 3.1 Run focused icon/component checks, pinned build and affected frontend gate; record failures honestly.
- [x] 3.2 Verify representative desktop/mobile controls, both themes, sizing, sorting and keyboard in browser.
- [x] 3.3 Scan residual icons and brand/chart diff; run owned diff hygiene.
- [x] 3.4 Sync accepted specs and strictly validate them.
- [ ] 3.5 Archive after outstanding complete-gate blockers are resolved.

## Current status

Icon migration is implemented and focused-verified. Complete frontend acceptance is blocked by initial-JavaScript size (309420 bytes vs 307200-byte budget), existing inventory extras, and unrelated concurrent query/drawer tests. No budget was loosened and no unrelated files were cleaned. The change remains unarchived; see evidence.md.
