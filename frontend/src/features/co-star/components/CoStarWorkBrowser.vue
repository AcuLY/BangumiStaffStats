<script setup lang="ts">
import { joinDisplayText } from '../../../shared/text/separators';
import {
  NButton,
  NRadioButton,
  NRadioGroup,
  NTag,
  NTooltip,
} from 'naive-ui';
import {
  computed,
  onBeforeUnmount,
  ref,
  watch,
} from 'vue';

import SearchSortToolbar from '../../../shared/components/SearchSortToolbar.vue';
import WorkCardsSkeleton from '../../../shared/components/WorkCardsSkeleton.vue';
import { useResultReveal } from '../../../shared/composables/useResultReveal';
import { useTruncatedTooltip } from '../../../shared/composables/useTruncatedTooltip';
import SafeImage from '../../../shared/components/SafeImage.vue';
import { subjectImageCandidates } from '../../../shared/media/bangumiImage';
import {
  bilingualNameTitle,
  resolveBilingualName,
} from '../../../shared/names/bilingualName';
import { useCompactLayout } from '../../../shared/composables/useCompactLayout';
import AdaptivePagination from '../../ranking/components/AdaptivePagination.vue';
import { formatHundredths } from '../../ranking/format';
import {
  coStarSortOptions,
  type CoStarParticipant,
  type CoStarView,
  type CoStarWorkItem,
  updateCoStarView,
} from '../coStar';
import CoStarIcon from './CoStarIcon.vue';
import AdaptiveCreditList from './AdaptiveCreditList.vue';

const memberTooltip = useTruncatedTooltip();

const props = withDefaults(
  defineProps<{
    devicePixelRatio?: number;
    error: string | null;
    executeView: (view: Readonly<CoStarView>) => Promise<boolean>;
    items: readonly CoStarWorkItem[];
    page: number;
    pageSize: 5 | 10 | 20;
    participants: readonly CoStarParticipant[];
    pending: boolean;
    positionLabel: (positionKey: string) => string;
    retry: () => void;
    scope: 'global' | 'personal';
    targetWindow?: Window;
    total: number;
    view: Readonly<CoStarView>;
    workUnit: 'series' | 'subject';
  }>(),
  {
    devicePixelRatio: 1,
    targetWindow: () => window,
  },
);

const compactLayout = useCompactLayout();
const controlSize = computed(() =>
  compactLayout.value ? 'small' : 'medium',
);
const densityMode = ref<'compact' | 'detailed'>('detailed');
const workList = ref<HTMLElement | null>(null);
const canScrollUp = ref(false);
const canScrollDown = ref(false);
const scrollEdgeInset = ref(0);
let listResizeObserver: ResizeObserver | undefined;

function updateScrollEdges(): void {
  const list = workList.value;
  canScrollUp.value = Boolean(list && list.scrollTop > 1);
  canScrollDown.value = Boolean(list && list.scrollHeight - list.clientHeight - list.scrollTop > 1);
  const cardRight = list?.children.length
    ? Math.max(...Array.from(list.children, (card) => card.getBoundingClientRect().right))
    : undefined;
  scrollEdgeInset.value = list && cardRight !== undefined
    ? Math.max(0, list.getBoundingClientRect().right - cardRight)
    : 0;
}

watch([workList, () => props.items, densityMode], () => {
  listResizeObserver?.disconnect();
  const list = workList.value;
  if (list && typeof ResizeObserver === 'function') {
    listResizeObserver = new ResizeObserver(updateScrollEdges);
    listResizeObserver.observe(list);
    for (const item of list.children) listResizeObserver.observe(item);
  }
  updateScrollEdges();
}, { flush: 'post' });
const search = ref(props.view.search);
const searchInput = ref<{ inputElRef: HTMLInputElement | null } | null>(null);
const {
  attention: resultAttention,
  reveal: revealResults,
  target: resultTarget,
} = useResultReveal(props.targetWindow);
const visibleSeriesInfoKey = ref<string | null>(null);
let searchTimer: number | undefined;

const compact = computed(() => densityMode.value === 'compact');
const sortOptions = computed(() =>
  [...coStarSortOptions(props.scope, props.workUnit)],
);
const participantNames = computed(
  () =>
    new Map(
      props.participants.map((participant) => [
        participant.person.id,
        participant.person.nameCN ?? participant.person.name,
      ]),
    ),
);
const headingMeta = computed(
  () =>
    `${props.total} ${
      props.workUnit === 'series' ? '个系列' : '部'
    }`,
);
const headingLabel = computed(
  () =>
    `${props.workUnit === 'series' ? '共同系列' : '共同作品'}，${headingMeta.value}`,
);
const emptyText = computed(() => {
  if (props.view.search.trim()) {
    return props.workUnit === 'series'
      ? '没有符合搜索条件的系列'
      : '没有符合搜索条件的作品';
  }
  return props.workUnit === 'series'
    ? '没有共同系列'
    : '没有共同作品';
});

function primaryName(entity: {
  readonly name: string;
  readonly nameCN: string | null;
}): string {
  return resolveBilingualName(entity).primary;
}

function secondaryName(entity: {
  readonly name: string;
  readonly nameCN: string | null;
}): string {
  return resolveBilingualName(entity).secondary;
}

function request(patch: Partial<CoStarView>): Promise<boolean> {
  return props.executeView(updateCoStarView(props.view, patch));
}

async function requestPage(patch: Partial<CoStarView>): Promise<void> {
  if (await request(patch)) {
    await revealResults();
  }
}

function clearSearchTimer(): void {
  if (searchTimer !== undefined) {
    props.targetWindow.clearTimeout(searchTimer);
    searchTimer = undefined;
  }
}

function requestSearch(): void {
  clearSearchTimer();
  void request({ search: search.value });
}

function scheduleSearch(value: string): void {
  search.value = value;
  clearSearchTimer();
  searchTimer = props.targetWindow.setTimeout(requestSearch, 240);
}

async function focusUnit(unitName: string): Promise<void> {
  clearSearchTimer();
  search.value = unitName;
  if (await request({ search: unitName })) {
    await revealResults({ focus: searchInput.value?.inputElRef ?? null });
  }
}

function entityFor(item: CoStarWorkItem) {
  return item.kind === 'series' ? item.representative : item.subject;
}

function personalScore(item: CoStarWorkItem): number | null | undefined {
  if (item.kind === 'series' && 'personalScore' in item) {
    return item.personalScore as number | null;
  }
  if (item.kind === 'subject' && 'personal' in item) {
    const evidence = item.personal as Readonly<{ score: number | null }>;
    return evidence.score;
  }
  return undefined;
}

function currentScore(item: CoStarWorkItem): number | null {
  return props.scope === 'personal'
    ? (personalScore(item) ?? null)
    : item.globalScore;
}

function collectionUpdatedAt(
  item: CoStarWorkItem,
): string | null | undefined {
  if (
    item.kind === 'series' &&
    'latestCollectionUpdatedAt' in item
  ) {
    return item.latestCollectionUpdatedAt as string | null;
  }
  if (item.kind === 'subject' && 'personal' in item) {
    const evidence = item.personal as Readonly<{
      updatedAt: string | null;
    }>;
    return evidence.updatedAt;
  }
  return undefined;
}

function formattedCollectionDate(
  item: CoStarWorkItem,
): string | null {
  const value = collectionUpdatedAt(item);
  const parts = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return parts ? `${parts[1]}/${parts[2]}/${parts[3]}` : null;
}

function contributionLabel(
  credit: CoStarWorkItem['participants'][number]['credits'][number],
): string {
  if (credit.kind === 'cast') {
    const character = credit.character.nameCN ?? credit.character.name;
    const identity = `声优（${credit.roleLabel}）`;
    return joinDisplayText([`${identity}：${character}`, ...(
      'workCount' in credit ? [`${credit.workCount} 部`] : []
    )], ' · ');
  }
  const exact = props.positionLabel(String(credit.exactPositionKey));
  const selected = props.positionLabel(String(credit.positionKey));
  return joinDisplayText([
    joinDisplayText(selected === exact ? [exact] : [selected, exact], ' / '),
    ...('workCount' in credit ? [`${credit.workCount} 部`] : []),
  ], ' · ');
}

function participantRows(item: CoStarWorkItem) {
  return Array.from(
    { length: Math.ceil(item.participants.length / 2) },
    (_, rowIndex) =>
      item.participants.slice(rowIndex * 2, rowIndex * 2 + 2),
  );
}

function participantWorkCount(
  participant: CoStarWorkItem['participants'][number],
): number | null {
  return 'workCount' in participant ? participant.workCount : null;
}

function showSeriesInfo(key: string): void {
  visibleSeriesInfoKey.value = key;
}

function hideSeriesInfo(key: string): void {
  if (visibleSeriesInfoKey.value === key) {
    visibleSeriesInfoKey.value = null;
  }
}

watch(
  () => [props.view.search, props.pending] as const,
  ([value, pending]) => {
    if (!pending) {
      search.value = value;
    }
  },
);
onBeforeUnmount(() => {
  clearSearchTimer();
  listResizeObserver?.disconnect();
});

defineExpose({ focusUnit });
</script>

<template>
  <div
    ref="resultTarget"
    class="subject-work-browser co-star-work-browser result-reveal-target"
    :class="{ 'is-reveal-attention': resultAttention }"
    role="region"
    aria-labelledby="co-star-common-works-title"
    :aria-busy="pending ? 'true' : undefined"
    tabindex="-1"
  >
    <div
      class="section-heading co-star-section-heading subject-work-browser__heading"
    >
      <div class="subject-work-browser__heading-copy">
        <h2 id="co-star-common-works-title">
          {{ workUnit === 'series' ? '共同系列' : '共同作品' }}
        </h2>
        <p
          class="section-heading__meta"
          role="status"
          aria-live="polite"
        >
          {{ headingMeta }}
        </p>
      </div>
      <div class="subject-work-browser__density-toggle">
        <n-radio-group
          v-model:value="densityMode"
          :size="controlSize"
          role="radiogroup"
          :aria-label="
            workUnit === 'series'
              ? '共同系列缩略模式'
              : '共同作品缩略模式'
          "
        >
          <n-radio-button
            value="detailed"
            :title="
              workUnit === 'series'
                ? '显示完整系列信息'
                : '显示完整作品信息'
            "
          >
            <span class="subject-work-browser__density-label">详细</span>
          </n-radio-button>
          <n-radio-button
            value="compact"
            :title="
              workUnit === 'series'
                ? '仅显示代表条目的序号、双语名和系列均分'
                : '仅显示序号、双语名和评分'
            "
          >
            <span class="subject-work-browser__density-label">缩略</span>
          </n-radio-button>
        </n-radio-group>
      </div>
    </div>

    <search-sort-toolbar
      ref="searchInput"
      class="work-list-toolbar co-star-work-toolbar"
      :search="search"
      :sort="view.sort"
      :order="view.order"
      :options="sortOptions"
      :placeholder="
        workUnit === 'series'
          ? '搜索系列或系列内作品'
          : '搜索作品'
      "
      :search-label="
        workUnit === 'series'
          ? '搜索共同系列或系列内作品'
          : '搜索共同作品'
      "
      :sort-label="
        workUnit === 'series'
          ? '共同系列排序依据'
          : '共同作品排序依据'
      "
      :order-label="
        workUnit === 'series'
          ? '共同系列排序方向'
          : '共同作品排序方向'
      "
      search-name="sharedWorkSearch"
      search-class=""
      sort-class=""
      search-icon
      @search="scheduleSearch"
      @sort="request({ sort: $event })"
      @order="request({ order: $event })"
      @submit="requestSearch"
    />

    <div
      v-if="error"
      class="co-star-inline-error"
      role="alert"
    >
      <span>{{ error }}</span>
      <n-button
        :size="controlSize"
        secondary
        type="error"
        @click="retry"
      >
        重新加载
      </n-button>
    </div>

    <div
      class="co-star-work-list-boundary"
      :class="{ 'can-scroll-up': canScrollUp, 'can-scroll-down': canScrollDown }"
      :style="{ '--scroll-edge-inset': `${scrollEdgeInset}px` }"
      :aria-busy="pending ? 'true' : undefined"
    >
      <work-cards-skeleton
        v-if="pending"
        class="co-star-work-skeletons"
        :count="pageSize"
        :compact="compact"
        :personal="scope === 'personal'"
        :kind="workUnit"
        :participant-count="participants.length"
      />

      <ul
        v-else
        ref="workList"
        class="subject-work-list person-work-list co-star-work-list"
        :class="{ 'subject-work-list--compact': compact }"
        :aria-label="headingLabel"
        @scroll.passive="updateScrollEdges"
      >
        <li
          v-for="(item, index) in items"
          :key="item.key"
          class="subject-work-row person-work-row co-star-work-row"
          :class="{
            'subject-work-row--compact': compact,
            'subject-work-row--with-participants': !compact,
            'subject-work-row--with-series-members':
              !compact &&
              item.kind === 'series' &&
              item.members.length > 0,
          }"
        >
          <template v-if="compact">
            <span
              class="subject-work-row__index"
              :aria-label="`第 ${(page - 1) * pageSize + index + 1} 项`"
            >
              {{ (page - 1) * pageSize + index + 1 }}
            </span>
            <div class="subject-work-row__compact-names">
              <a
                class="subject-work-row__primary-link"
                :href="`https://bgm.tv/subject/${entityFor(item).id}`"
                target="_blank"
                rel="noopener noreferrer"
                :title="bilingualNameTitle(entityFor(item))"
                :aria-label="`打开${primaryName(entityFor(item))}`"
              >
                <strong>{{ primaryName(entityFor(item)) }}</strong>
              </a>
              <small
                v-if="secondaryName(entityFor(item))"
                class="subject-work-row__secondary"
                :title="bilingualNameTitle(entityFor(item))"
              >
                {{ secondaryName(entityFor(item)) }}
              </small>
            </div>
            <dl
              class="subject-work-row__compact-score"
              :aria-label="`${
                workUnit === 'series' ? '均分' : '评分'
              } ${formatHundredths(currentScore(item))}`"
            >
              <dt class="sr-only">
                {{ workUnit === 'series' ? '均分' : '评分' }}
              </dt>
              <dd aria-hidden="true">
                <span>{{ formatHundredths(currentScore(item)) }}</span>
                <span class="co-star-score-star">★</span>
              </dd>
            </dl>
          </template>

          <template v-else>
            <div class="subject-work-row__work person-work-row__work work-cell">
              <span class="subject-work-row__cover-media" aria-hidden="true">
                <safe-image
                  class="subject-work-row__cover"
                  :sources="
                    subjectImageCandidates(
                      entityFor(item).id,
                      64,
                      devicePixelRatio,
                    )
                  "
                  alt=""
                  decorative
                  :width="64"
                />
              </span>
              <div class="subject-work-row__copy work-cell__copy">
                <div class="subject-work-row__heading">
                  <a
                    class="subject-work-row__primary-link"
                    :href="`https://bgm.tv/subject/${entityFor(item).id}`"
                    target="_blank"
                    rel="noopener noreferrer"
                    :title="bilingualNameTitle(entityFor(item))"
                    :aria-label="`打开${primaryName(entityFor(item))}`"
                  >
                    <strong>{{ primaryName(entityFor(item)) }}</strong>
                  </a>
                  <time
                    v-if="item.kind === 'subject' && formattedCollectionDate(item)"
                    class="subject-work-row__collection-time"
                    :datetime="collectionUpdatedAt(item) ?? undefined"
                    :title="`收藏于 ${formattedCollectionDate(item)}`"
                  >
                    {{ formattedCollectionDate(item) }}
                  </time>
                </div>
                <small
                  v-if="secondaryName(entityFor(item))"
                  class="subject-work-row__secondary"
                  :title="bilingualNameTitle(entityFor(item))"
                >
                  {{ secondaryName(entityFor(item)) }}
                </small>
                <small
                  v-if="item.kind === 'series'"
                  class="subject-work-row__series-summary"
                >
                  <span>
                    共同参与 {{ item.matchedWorkCount }} 部 · 系列
                    {{ item.memberCount }} 部
                  </span>
                  <n-tooltip
                    :show="visibleSeriesInfoKey === item.key"
                    placement="top-end"
                    trigger="manual"
                    :animated="false"
                  >
                    <template #trigger>
                      <button
                        class="subject-work-row__series-info info-trigger"
                        type="button"
                        aria-label="系列参与身份数量说明：参与身份标签末尾的数字表示该人物以此身份参与的系列内作品数"
                        :aria-expanded="
                          visibleSeriesInfoKey === item.key
                        "
                        @mouseenter="showSeriesInfo(item.key)"
                        @mouseleave="hideSeriesInfo(item.key)"
                        @focus="showSeriesInfo(item.key)"
                        @blur="hideSeriesInfo(item.key)"
                        @click.stop="showSeriesInfo(item.key)"
                        @keydown.esc.stop.prevent="
                          hideSeriesInfo(item.key)
                        "
                      >
                        <co-star-icon name="info" :size="16" />
                      </button>
                    </template>
                    <span>
                      参与身份标签末尾的数字表示该人物以此身份参与的系列内作品数
                    </span>
                  </n-tooltip>
                </small>
                <ul
                  v-if="item.metaTags.length"
                  class="subject-work-row__meta"
                  aria-label="条目属性"
                >
                  <li
                    v-for="tag in item.metaTags.slice(0, 5)"
                    :key="tag"
                  >
                    <n-tag size="small" round>{{ tag }}</n-tag>
                  </li>
                </ul>
              </div>
            </div>

            <dl
              class="subject-work-row__facts person-work-row__facts"
              :class="{
                'subject-work-row__facts--global':
                  scope === 'global',
              }"
            >
              <div
                class="subject-work-row__score subject-work-row__score--global"
              >
                <dt>
                  {{
                    scope === 'global'
                      ? workUnit === 'series'
                        ? '均分'
                        : '评分'
                      : workUnit === 'series'
                        ? '全站均分'
                        : '全站评分'
                  }}
                </dt>
                <dd>
                  <strong>{{ formatHundredths(item.globalScore) }}</strong>
                </dd>
              </div>
              <div
                v-if="scope === 'personal'"
                class="subject-work-row__score subject-work-row__score--mine"
              >
                <dt>
                  {{ workUnit === 'series' ? '我的均分' : '我的评分' }}
                </dt>
                <dd>
                  <b>{{ formatHundredths(personalScore(item) ?? null) }}</b>
                </dd>
              </div>
            </dl>

            <div class="subject-work-row__participants">
              <div class="shared-work-participants">
                <div
                  v-for="(row, rowIndex) in participantRows(item)"
                  :key="row[0]?.personId"
                  class="shared-work-participant-row"
                >
                  <div
                    v-for="(participant, participantIndex) in row"
                    :key="participant.personId"
                    class="shared-work-participant"
                    :class="{
                      'shared-work-participant--series':
                        item.kind === 'series',
                    }"
                  >
                    <span
                      class="shared-work-participant__index"
                      aria-hidden="true"
                    >
                      {{ rowIndex * 2 + participantIndex + 1 }}
                    </span>
                    <div
                      class="shared-work-participant__body"
                      :class="{
                        'shared-work-participant__body--series':
                          item.kind === 'series',
                      }"
                    >
                      <div class="shared-work-participant__identity">
                        <strong class="shared-work-participant__name">
                          {{
                            participantNames.get(
                              participant.personId,
                            ) ?? `人物 ${participant.personId}`
                          }}
                        </strong>
                        <small
                          v-if="item.kind === 'series'"
                          class="shared-work-participant__support"
                        >
                          参与 {{ participantWorkCount(participant) }} 部
                        </small>
                      </div>
                      <div class="shared-work-participant__roles">
                        <adaptive-credit-list :labels="participant.credits.map(contributionLabel)" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <section
              v-if="item.kind === 'series' && item.members.length"
              class="subject-work-row__series-members"
              :aria-label="`${primaryName(
                entityFor(item),
              )}的系列作品，共 ${item.members.length} 部`"
            >
              <strong class="subject-work-row__series-members-title">
                系列作品（{{ item.members.length }}）
              </strong>
              <ul class="subject-work-row__series-member-list">
                <li v-for="member in item.members" :key="member.id">
                  <n-tooltip
                    :show="memberTooltip.activeKey.value === `${item.key}/${member.id}`"
                    trigger="manual"
                    placement="top"
                    :animated="false"
                    style="max-width: min(336px, calc(100dvw - 24px));"
                    content-class="workbench-tooltip-content"
                  >
                  <template #trigger>
                  <a
                    class="subject-work-row__series-member"
                    :href="`https://bgm.tv/subject/${member.id}`"
                    target="_blank"
                    rel="noopener noreferrer"
                    @mouseenter="memberTooltip.show(`${item.key}/${member.id}`, $event)"
                    @focus="memberTooltip.show(`${item.key}/${member.id}`, $event)"
                    @mouseleave="memberTooltip.leave(`${item.key}/${member.id}`)"
                    @blur="memberTooltip.hide(`${item.key}/${member.id}`)"
                    @keydown.esc.stop.prevent="memberTooltip.hide(`${item.key}/${member.id}`)"
                  >
                    <safe-image
                      class="subject-work-row__series-member-cover"
                      :sources="
                        subjectImageCandidates(
                          member.id,
                          28,
                          devicePixelRatio,
                        )
                      "
                      alt=""
                      decorative
                      :width="28"
                    />
                    <span class="subject-work-row__series-member-copy">
                      <span class="subject-work-row__series-member-name" data-truncated-text>
                        {{ primaryName(member) }}
                      </span>
                      <small
                        v-if="secondaryName(member)"
                        class="subject-work-row__series-member-original"
                        data-truncated-text
                      >
                        {{ secondaryName(member) }}
                      </small>
                    </span>
                  </a>
                  </template>
                  <span style="white-space: pre-line" @mouseenter="memberTooltip.keepOpen" @mouseleave="memberTooltip.leave(`${item.key}/${member.id}`)">{{ bilingualNameTitle(member) }}</span>
                  </n-tooltip>
                </li>
              </ul>
            </section>
          </template>
        </li>
        <li
          v-if="!items.length"
          class="subject-work-list__empty person-work-list__empty co-star-ready-empty"
        >
          {{ emptyText }}
        </li>
      </ul>
    </div>

    <adaptive-pagination
      v-if="total > 5"
      class="co-star-work-pagination"
      :aria-busy="pending ? 'true' : undefined"
      :aria-label="
        workUnit === 'series' ? '共同系列分页' : '共同作品分页'
      "
      :page="page"
      :page-size="pageSize"
      :page-size-unit="workUnit === 'series' ? '个系列' : '部'"
      :pending="pending"
      :total="total"
      @page="requestPage({ page: $event })"
      @page-size="requestPage({ pageSize: $event })"
    />
  </div>
</template>
