## Capability Boundary

- **Status:** user-authorized local ranking loading delta.
- **Owner:** Frontend ranking workspace.
- **Writable paths:** App except the transferred target-mode/co-star-default
  slices, RankingResults, reusable detail skeleton, person-detail ranking CSS
  except the transferred work-toolbar size rules, exact ranking empty/pending
  slices in base CSS, DESIGN/sidecar, ranking integration and exact
  ranking/query component tests excluding unrelated mode/toolbar cases, this
  change, and root spec only at later sync.
- **Read-only protected inputs:** query/ranking/person-detail contracts and
  coordinator, QueryWorkspace/selector, Backend, external state.
- **Deletion complement:** preserve ranking states/data/controls/tests; remove
  only the generic right placeholder.
- **Mutable refs:** current local worktree only.
- **Consumes:** ranking resource phase/payload and desktop Inspector column.
- **Produces:** companion detail skeleton, no-person single-column layout,
  bounded ranking controls/pagination, ready-shaped pending, and plain first/zero
  ranking empty states.
- **Dependencies:** accepted ranking/person-inspector resources and App topology.
- **Deliverables:** source/test/browser loading evidence.
- **Acceptance:** primary pending has two truthful skeletons with ready-shaped
  ranking topology; no selectable person reserves no blank right column;
  first-query/complete-zero states share plain hierarchy; controls remain aligned
  and pagination stays inside the pane when content exists.
- **Non-goals:** ranking API/order/view/query or control semantics changes.
- **Operations deferred:** all remote/live integration and lifecycle.
- **Stop/rollback conditions:** loading/empty/error/state or layout regression.

## ADDED Requirements

### Requirement: Primary ranking state SHALL coordinate the companion Inspector

At desktop widths, an initial or semantically changed primary ranking request
without a matching selected detail SHALL render the ranking skeleton and a
person-detail-shaped skeleton in the existing Inspector column. The detail
skeleton SHALL expose an adjacent polite pending status and mirror the real
profile/metrics/section structure; a generic choose-person placeholder SHALL
NOT render. An unchanged refresh with an accepted selected person SHALL retain
that detail while the ranking refresh is pending.

After the request is no longer pending, when no accepted result person can be
selected, the ranking workspace SHALL use one column and SHALL NOT reserve an
empty or generic Inspector surface. Compact layout SHALL remain one-column and
use only the accepted detail drawer when a person is selected.

#### Scenario: Primary ranking request is pending

- **WHEN** a desktop primary ranking request has no accepted new payload yet
- **THEN** the left column SHALL render ranking pending state and the right
  column SHALL render the reusable person-detail skeleton
- **AND** “选择人物查看详情” SHALL NOT be present

#### Scenario: Accepted ranking contains no people

- **WHEN** a ranking request completes ready with zero items, or fails without
  a selectable retained person
- **THEN** the ranking surface SHALL occupy the available workspace without an
  empty right placeholder or reserved Inspector column

### Requirement: Ranking empty and pending presentation SHALL preserve one hierarchy

The first-query ranking state SHALL retain its centered 360px layout but SHALL
render directly on the page canvas without panel border, raised surface, or
shadow. It SHALL show the approved icon and “尚未开始查询” title and SHALL NOT
render a duplicate query action because Query Editor is already open.

When an accepted ranking payload reports complete `summary.personCount = 0`,
the result SHALL render the same plain centered icon/title hierarchy with
“没有符合查询条件的人物”. It SHALL NOT render the `0` summary, ranking toolbar,
table/list chrome, or pagination. A search-empty page whose complete summary is
non-zero SHALL retain the summary and search/sort controls so the user can
recover from the search.

Primary pending SHALL use the same summary, toolbar, column, row, and pagination
regions and responsive tracks as the ready ranking pane. Every visible
placeholder leaf SHALL be direct Naive UI `NSkeleton`; wrappers MAY define
layout/dimensions but SHALL NOT introduce another visual Skeleton primitive or
request state.

#### Scenario: User has not applied a ranking query

- **WHEN** the ranking route has no Applied Query
- **THEN** the centered first-query title SHALL blend into the canvas with no
  card chrome and no “设置查询条件” button

#### Scenario: Complete ranking is empty

- **WHEN** an accepted ranking payload has `summary.personCount = 0`
- **THEN** the same plain centered empty hierarchy SHALL render without summary,
  toolbar, table/list chrome, or pagination

#### Scenario: Search alone empties a non-zero ranking

- **WHEN** current search returns no page items but the complete summary remains
  non-zero
- **THEN** summary and search/sort controls SHALL remain visible with the
  search-empty message

#### Scenario: Primary ranking is pending

- **WHEN** the ranking request waits for its first accepted page
- **THEN** personal/global column topology, page-size-bounded rows, and
  pagination SHALL mirror the ready pane using only `NSkeleton` leaves
- **AND** one polite status SHALL announce loading while pending controls and
  fabricated result values remain absent

### Requirement: Ranking controls SHALL remain usable inside the result pane

The existing ranking search, sort selector, direction button, page navigation,
page-size selector, and jump input SHALL remain Naive UI primitives with their
current labels, events, pending behavior, and server-view semantics. Search,
sort, and direction SHALL share a 44px minimum interaction height. The direction
button SHALL reserve at least 80px so the complete “升序/降序” label and icon do
not clip or collapse. When the ranking pane itself is at most 340px wide, search
SHALL occupy its own first row and sort plus direction SHALL form the second row.

Pagination SHALL keep its range summary and page navigation on a bounded first
row. Page-size and jump tools SHALL explicitly span a full second row, align to
the end, size to their content up to the pane width, and wrap inside that width
when necessary. The page navigation SHALL use content width with a 100% maximum.
Neither toolbar nor pagination SHALL create horizontal scrolling or clip a
control at supported widths from 360px upward.

#### Scenario: Ranking occupies the desktop Inspector workspace

- **WHEN** the ranking pane is the narrow left column beside a person Inspector
- **THEN** search, sort, and direction SHALL be equal-height, “降序” or “升序”
  SHALL remain fully visible, and all three controls SHALL stay inside the pane
- **AND** pagination tools SHALL occupy their own full second row rather than
  being constrained by the range-summary column

#### Scenario: Ranking pane becomes compact

- **WHEN** the ranking pane is at most 340px wide
- **THEN** search SHALL span the first toolbar row while sort and direction use
  the second row
- **AND** page navigation and pagination tools SHALL remain bounded without
  horizontal clipping, scrolling, or hidden labels
