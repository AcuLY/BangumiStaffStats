## Why

The `bangumi_plugin.js` entry currently renders as its own block above Bangumi's
person-page tab row, with a primary “查看我的收藏参与作品” action and a secondary
“其他作品类型” disclosure. On the live person page the user asked for that block
to disappear and for a single right-aligned item inside Bangumi's own
`#headerSubject` navigation tab row, grouped with 加入收藏, whose activation
expands a work-type menu. The requested outcome is one native-looking row, one
entry, and no separate injected block.

## What Changes

- **BREAKING (userscript surface):** remove the injected
  `#bgmss-person-entry` block, its own action row, and its adjacent status row
  above `#headerSubject .subjectNav`.
- Add exactly one idempotent item to the person page's own
  `#headerSubject .navTabs` list, appended as the last (rightmost) item so it
  sits in the same right-aligned group as 加入收藏, 加入黑名单 and 收集.
- Label the item “在 Bangumi Staff Stats 中查看” and render it with Bangumi's own
  navigation-tab markup and classes (`.navTabs > li` plus the native `.dropdown`
  panel), so typography, spacing, hover, focus and dark-theme treatment come
  from Bangumi itself instead of duplicated styles.
- Activating the entry expands a work-type menu with 动画, 书籍, 音乐, 游戏 and
  三次元. 动画 stays the first/default option, and the previous two controls are
  merged into this single disclosure.
- Move the “登录 Bangumi 后可查看收藏参与作品” explanation into the expanded menu
  and keep all five destinations non-navigable while identity is unknown.
- Preserve the existing entry contract: fixed
  `https://search.bgmss.fun/ranking` destination, `entry=bangumi-person`,
  `user`, `person` and a single `type`, identity only from authenticated
  navigation, anime-only default, `_blank`/`noopener noreferrer` navigation, and
  no cookie, token or page-text transmission.
- Keep the keyboard, touch, Escape, outside-click, re-check-at-activation and
  single-installation behavior of the current script, and rewrite
  `frontend/tests/app/bangumi-plugin.test.ts` to assert the merged navigation
  entry against a header fixture that mirrors the real Bangumi markup.
- Record the accepted behavior in `PRODUCT.md`, which currently describes the
  removed primary/secondary split.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `frontend-bangumi-person-entry`: the requirement that person pages expose safe
  authenticated-user navigation changes from an injected native-style split
  button above the tab row to one right-aligned item inside Bangumi's own
  `ul.navTabs` whose work-type menu merges the two previous controls. The
  URL, identity, destination and login-explanation rules are unchanged.

## Impact

<!-- markdownlint-disable MD013 -->

- **Status:** Proposed; apply is blocked until proposal, specs, design, and tasks pass strict validation and main-agent review.
- **Owner:** Frontend / `frontend-bangumi-person-entry`; the primary agent is the sole implementation owner for this bounded userscript correction.
- **Behavior classification:** The injected block and its primary/secondary split are `INTENTIONAL_DELTA` requested by the user against the accepted `openspec/specs/frontend-bangumi-person-entry/spec.md`. The identity, destination, URL-parameter, single-run and login-explanation rules stay `PRESERVE_ORACLE` from immutable commit `644b7748674e553f863d0ffd61d029f86fdc0717` as already adapted by `add-unrestricted-person-entry`.
- **Writable paths:** `openspec/changes/frontend-move-person-entry-into-header-nav/**`, `bangumi_plugin.js`, `frontend/tests/app/bangumi-plugin.test.ts`, `openspec/specs/frontend-bangumi-person-entry/spec.md` (sync only), and the `### Bangumi person entry` section of `PRODUCT.md`.
- **Read-only protected inputs:** `DESIGN.md`, `.impeccable/**`, `.agents/skills/impeccable/**`, `frontend/src/**`, every other frontend test, `contracts/**`, `backend/**`, `operations/**`, `tmp-formal-development/**`, all archived changes, and every other active OpenSpec change.
- **Deletion complement:** The injected entry block, its own action row and its standalone status row are removed from the script; no file, capability, test, fixture or user data is deleted.
- **Mutable refs:** None; no branch, tag, remote ref, generated contract or persisted browser state is mutated.
- **Consumes:** The captured live `#headerSubject` markup and `bangumi.min.css` navigation/dropdown rules for `bgm.tv`, the accepted person-entry URL contract, and the existing userscript identity detection.
- **Produces:** A single native navigation-row entry with a merged work-type menu, an updated focused test file, and the synced requirement text.
- **Dependencies:** Existing `frontend-bangumi-person-entry` capability and its entry-URL consumer `frontend/src/app/personEntry.ts`; no new package, service or contract.
- **Deliverables:** Strict-valid change artifacts, the updated `bangumi_plugin.js`, the rewritten focused test, local evidence for the zero-install and malformed-path guards, and an exact final diff audit.
- **Acceptance:** Focused `npx vitest run tests/app/bangumi-plugin.test.ts` from `frontend`; `openspec validate frontend-move-person-entry-into-header-nav --strict`; `git diff --check` on the owned paths. A rendered Tampermonkey run on a live logged-in Bangumi person page is recorded as not performed unless the user installs the updated script locally.
- **Non-goals:** No change to the entry URL parameters, ranking application behavior, `frontend/src/app/personEntry.ts`, contracts, backend or operations; no new dependency; no Bangumi style-sheet override beyond the disposition of the entry's own elements; no restored “install the script” documentation, download entry or bundled copy.
- **Operations deferred:** Commit, push, pull request, merge, release, deployment, host mutation and production activation remain out of scope without separate authorization.
- **External state:** This change writes only repository files. Reading `https://bgm.tv/person/103034` and `https://bgm.tv/css/dist/bangumi.min.css` was read-only external research; the user remains responsible for publishing the script to Bangumi.
- **Stop/rollback conditions:** Stop on authority conflict, an unexpected concurrent edit to a writable path, strict-validation failure, or a required fix that would broaden the entry contract. Rollback is the exact removal of this change directory plus reversal of only the owned hunks in `bangumi_plugin.js`, `frontend/tests/app/bangumi-plugin.test.ts` and `PRODUCT.md` before any separately authorized commit.

<!-- markdownlint-enable MD013 -->
