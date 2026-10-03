# frontend-bangumi-person-entry Specification

## Purpose
Define the restricted, single-use Bangumi person entry that creates a fresh personal query while preserving safe user navigation, local recovery boundaries, and the independently published script contract.
## Requirements
### Requirement: Bangumi person pages expose safe authenticated-user navigation
The existing root `bangumi_plugin.js` is maintained separately for the user's direct publication to HTTPS Bangumi hosts `bgm.tv`, `bangumi.tv`, and `chii.in`. Its navigation contract SHALL add exactly one idempotent native-style entry inside the person page's own `#headerSubject` navigation list (`ul.navTabs`) on exact `/person/<positive safe integer>` pages, as the last item of that list so it stays grouped with the right-aligned 加入收藏, 加入黑名单 and 收集 items. The entry SHALL retain the label “在 Bangumi Staff Stats 中查看” without a visible diagnostic version badge. It SHALL reuse Bangumi's native navigation-tab placement and visually compatible dropdown presentation; the menu SHALL be mounted independently of the header's clipping/compositing ancestors, rather than adding an action block above or beside the tab row, and SHALL NOT add a separate page-level block, action row or status row. Activating the entry by pointer, touch or keyboard SHALL expand one work-type menu whose items are 动画, 书籍, 音乐, 游戏 and 三次元, with 动画 first, and each item SHALL immediately navigate to its single work type; hovering the collapsed entry alone SHALL NOT expand it. Identity SHALL come only from authenticated navigation, never person/profile/body links. Unknown or logged-out identity SHALL show “登录 Bangumi 后可查看收藏参与作品” inside the expanded menu and not launch a guessed user query. The destination SHALL be fixed to `https://search.bgmss.fun/ranking`. The application SHALL NOT require script installation documentation, a download entry, or a bundled script copy as a delivery or acceptance gate.

#### Scenario: Default and secondary entries
- **WHEN** a logged-in user opens the person page and activates the single navigation entry
- **THEN** the menu SHALL offer 动画, 书籍, 音乐, 游戏 and 三次元 in that order, and activating one SHALL build a URL with URL/URLSearchParams containing only `entry=bangumi-person`, `user=<uid>`, `person=<id>` and `type=<single type>`
- **AND** 动画 SHALL be the first option, the entry SHALL be the last child of `ul.navTabs` inside `#headerSubject`, and no cookie, token or page text SHALL be transmitted

#### Scenario: Pointer hover does not expand the menu
- **WHEN** the pointer rests on the collapsed entry without activating it
- **THEN** the work-type menu SHALL stay collapsed and the entry SHALL keep reporting its collapsed state

#### Scenario: Installation and access
- **WHEN** the userscript runs twice, encounters a body user link, or the menu is operated by keyboard/touch
- **THEN** there SHALL be exactly one entry, unrelated identities SHALL be ignored, and Escape or an outside click SHALL close the menu and return focus appropriately

#### Scenario: Versioned installation and safe takeover
- **WHEN** the same script initializes repeatedly or known script versions load in either order
- **THEN** one visible entry and one menu SHALL remain; equal/newer registered instances SHALL be retained, and a newer script SHALL dispose the older registered instance's own DOM, styles and listeners before installing
- **AND** legacy unregistered instances SHALL only be replaced when their exact script-owned structure is recognized; they SHALL be closed before detaching so their unremovable anonymous listeners cannot affect the current menu
- **AND** unrelated components, styles and ID collisions SHALL NOT be removed, and the active version SHALL remain in script metadata and owned runtime data without appearing in the entry label

#### Scenario: Mobile menu remains independent of host styles
- **WHEN** the host navigation uses overflow, transforms, paint containment or backdrop compositing and the user opens the menu by touch
- **THEN** the five option labels SHALL be readable and hit-testable outside that navigation, with explicit text fill, light/dark surfaces and viewport bounds
- **AND** focus moving between the native trigger and the separate menu SHALL NOT close it; Escape, keyboard focus outside, and an outside pointer/click SHALL still dismiss it

#### Scenario: Unknown identity in the merged menu
- **WHEN** the logged-in identity is unknown or a login link is present
- **THEN** all five work-type destinations SHALL be non-navigable and the expanded menu SHALL show 登录 Bangumi 后可查看收藏参与作品

### Requirement: Restricted entry URL triggers one fresh query only
Only `/ranking` URLs with exactly one each of `entry=bangumi-person`, `user`, `person`, and `type` SHALL trigger the person flow. UID SHALL follow shared validation; person SHALL be a positive decimal safe integer; type SHALL be one of book/anime/music/game/real. Duplicate, missing, malformed or unexpected query parameters SHALL fail safe to editable non-auto-executing state. The intent SHALL be captured then consumed/removed from the URL before normal mode navigation, prioritized over old tab recovery, and run after catalog success exactly once. Ordinary `?user=` remains prefill-only; fragment replay and generic query sharing SHALL remain disabled.

#### Scenario: Valid initial intent
- **WHEN** a valid restricted URL is loaded
- **THEN** a fresh default personal query with all five states, unrestricted positions, NSFW excluded and one detail target SHALL run once through the existing coordinator

#### Scenario: Invalid or duplicate entry parameter
- **WHEN** a parameter is repeated, an ID is unsafe, a type is unsupported or arbitrary filters are appended
- **THEN** no automatic collection query SHALL run and the user SHALL retain the ordinary editable query shell
