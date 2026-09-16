# frontend-bangumi-person-entry Specification

## Purpose
Define the restricted, single-use Bangumi person entry that creates a fresh personal query while preserving safe user navigation, local recovery boundaries, and the independently published script contract.

## Requirements
### Requirement: Bangumi person pages expose safe authenticated-user navigation
The existing root `bangumi_plugin.js` is maintained separately for the user's direct publication to HTTPS Bangumi hosts `bgm.tv`, `bangumi.tv`, and `chii.in`. Its preserved navigation contract SHALL add an idempotent native-style split button on exact `/person/<positive safe integer>` pages. “查看我的收藏参与作品” SHALL always target anime; “其他作品类型” SHALL expose book/music/game/real as separate immediate actions. Identity SHALL come only from authenticated navigation, never person/profile/body links. Unknown or logged-out identity SHALL show “登录 Bangumi 后可查看收藏参与作品” and not launch a guessed user query. The destination SHALL be fixed to `https://search.bgmss.fun/ranking`. The application SHALL NOT require script installation documentation, a download entry, or a bundled script copy as a delivery or acceptance gate; current implementation work SHALL preserve the existing script and its tests without edits.

#### Scenario: Default and secondary entries
- **WHEN** a logged-in user activates the main action or one secondary type
- **THEN** a URL SHALL be built with URL/URLSearchParams, containing only `entry=bangumi-person`, `user=<uid>`, `person=<id>` and `type=<single type>`
- **AND** subsequent main-action activation SHALL still use anime, and no cookie/token/page text SHALL be transmitted

#### Scenario: Installation and access
- **WHEN** the userscript runs twice, encounters a body user link, or the menu is operated by keyboard/touch
- **THEN** there SHALL be only one control, unrelated identities SHALL be ignored, Escape/outside click SHALL close the menu and focus SHALL return appropriately

### Requirement: Restricted entry URL triggers one fresh query only
Only `/ranking` URLs with exactly one each of `entry=bangumi-person`, `user`, `person`, and `type` SHALL trigger the person flow. UID SHALL follow shared validation; person SHALL be a positive decimal safe integer; type SHALL be one of book/anime/music/game/real. Duplicate, missing, malformed or unexpected query parameters SHALL fail safe to editable non-auto-executing state. The intent SHALL be captured then consumed/removed from the URL before normal mode navigation, prioritized over old tab recovery, and run after catalog success exactly once. Ordinary `?user=` remains prefill-only; fragment replay and generic query sharing SHALL remain disabled.

#### Scenario: Valid initial intent
- **WHEN** a valid restricted URL is loaded
- **THEN** a fresh default personal query with all five states, unrestricted positions, NSFW excluded and one detail target SHALL run once through the existing coordinator

#### Scenario: Invalid or duplicate entry parameter
- **WHEN** a parameter is repeated, an ID is unsafe, a type is unsupported or arbitrary filters are appended
- **THEN** no automatic collection query SHALL run and the user SHALL retain the ordinary editable query shell
