# Removal implementation and acceptance

## Implemented

- Sharing UI, clipboard fallback, fragment codec/replay, share schema, three
  public OpenAPI components and their generated Go/TypeScript declarations
  removed. Active runtime residue scan finds none; historical evidence is
  retained outside runtime sources.
- Frontend-owned validated JSON session recovery replaces the former URL
  protocol, including storage-before-reload for failed dynamic imports. Old
  v1 sessions are discarded; normal query APIs and statistics remain.
- Header actions share one right-aligned container. The legacy anchor points
  exactly to `https://search.bgmss.fun/old/` in the same tab, includes a jump
  icon, displays `回到旧版` on desktop and `旧版` below 780px, and keeps the full
  accessible name. Theme behavior is unchanged.
- Active authorities and seven affected specifications are synchronized.

## Focused validation

- Pinned Node 24.18.0 / npm 11.16.0; installed dependency versions verified
  against the unchanged repository package-lock after installation recovery.
- Final focused run: seven test files, 142 tests passed with two workers.
  Covers ranking/detail, partners/co-star exact session replay, corrupt and
  incompatible storage, old-fragment inertness, query adapters, legacy Header
  link, successful chunk reload and storage-denied reload refusal.
- Query contract verifier passed: 6 schemas, 14 components, 113 goldens,
  95,370 NFKC assertions and 44,170 cross-validator executions, deterministic
  Go/TypeScript generation and query Go contract tests. See the adjacent
  `query-contract-verification.md` for exact commands and historical evidence.
- Final pinned typecheck, Vite production build and production artifact structural check passed (22 files, initial JavaScript gzip 300,610 bytes).
- All seven frontend wire-generation drift checks passed.
- Strict OpenSpec validation: 81 items passed; the final Header amendment
  also passed strict change validation.
- Owned source/test/docs diff hygiene passed. User and concurrent unrelated
  changes have been preserved; no broad clean, reset, staging or commit.

## Browser validation

Used the in-app browser and rendered DOM geometry. A local static server on
port 5180 served the actual production build with the repository catalog
golden fixture; it did not represent a deployed backend. Development preview
was also inspected for the final Header amendment, then the final rebuilt artifact
was rechecked at 360 and 1440px with correct labels, icon, right edge and keyboard
order and a clean console. Temporary browser viewports/tabs and QA server were
cleaned up.

At 320, 360, 779, 780 and 1440 CSS pixels the right action container meets the
Header's right edge, the legacy link precedes the theme button, and neither
button overlaps the mode switch or causes horizontal overflow. The visible
label changes at 780px. Both themes, mode navigation and keyboard traversal
from the legacy anchor to theme were exercised. A retired fragment was cleared
without restoring query state. No browser console errors were observed in the
fresh production preview. The existing development preview had HMR-only
Naive global-style warnings during edits; these are not a production pass.

## Complete-gate limitations

The implementation is not presented as full repository acceptance:

- `npm ci` could not unlink the Windows rolldown binary while other local
  preview processes held it. The original local 5174 preview was restored
  with its original launcher/configuration; other preview owners were left
  running. Dependency repair restored exact lockfile versions and original
  lockfile bytes.
- `npm run check` stops at the architecture inventory because pre-existing
  `frontend/vite-dev.err.log` and `frontend/vite-dev.out.log` are outside its
  whitelist. These unrelated files were preserved.
- Subsequent Unicode generation stops on the untouched raw-byte
  `DerivedAge.txt` digest under Windows line endings.
- Broad frontend diagnostic runs also found existing/concurrently edited
  ranking/person-detail CSS assertions and worker startup/timeout failures.
  They are not treated as acceptance; final owned tests passed separately
  after restoring exact dependency versions.
- Frontend artifact packaging tests: 5 passed, 3 failed on the existing
  `VERSION` requirement for an exact LF byte sequence.
- The complete backend shell gate stops on CRLF in
  `check-toolchain-mode.sh`. Full Go wire testing separately fails the
  untouched catalog-generated file's raw-byte seal; query Go tests pass.
- Pinned contract artifact tests: 28 passed, 20 failed in release/Archive
  metadata and Windows fixture-root validation, outside share removal.
- Global `git diff --check` reports CRLF whitespace in concurrent loading
  edits to frontend-accessibility/frontend-ranking-results specs. Their
  unrelated loading sections were not normalized or overwritten.

No commit, push, merge, release, deployment, `/old/` hosting or root-route
cutover was performed. The change remains unarchived pending complete-gate
acceptance; local implementation and specification synchronization are done.
