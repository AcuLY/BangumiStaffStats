<script setup lang="ts">
import {
  NButton,
  NInput,
  NSelect,
  NTooltip,
} from 'naive-ui';
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';

import type {
  PartnerCore,
  PartnerItem,
  PartnerLeader,
} from '../../../api/adapters/partners';
import AppIcon from '../../../shared/components/AppIcon.vue';
import SafeImage from '../../../shared/components/SafeImage.vue';
import { personImageCandidates } from '../../../shared/media/bangumiImage';
import { useCompactLayout } from '../../query/composables/useCompactLayout';
import {
  formatHundredths,
  formatRational,
} from '../../ranking/format';
import AdaptivePagination from '../../ranking/components/AdaptivePagination.vue';
import SortDirectionButton from '../../ranking/components/SortDirectionButton.vue';
import type { SelectedPerson } from '../model';
import {
  activatePartner,
  defaultPartnersView,
  partnerSortOptions,
  partnersInput,
  partnersInputMatchesSelection,
  type PartnersInput,
  type PartnersResource,
  type PartnersSort,
  type PartnersView,
  updatePartnersView,
} from '../partners';
import type { CoStarSelection } from '../selection';
import CoStarIcon from './CoStarIcon.vue';

const props = withDefaults(
  defineProps<{
    cancel: () => void;
    devicePixelRatio?: number;
    execute: (
      input: Readonly<PartnersInput>,
      view: Readonly<PartnersView>,
    ) => Promise<boolean>;
    executeView: (view: Readonly<PartnersView>) => Promise<boolean>;
    positionKeys: readonly string[];
    positionLabel: (positionKey: string) => string;
    resource: PartnersResource;
    scope: 'global' | 'personal';
    selection: CoStarSelection;
    source: SelectedPerson;
    targetWindow?: Window;
    workUnit: 'series' | 'subject';
  }>(),
  {
    devicePixelRatio: 1,
    targetWindow: () => window,
  },
);
const emit = defineEmits<{
  partnerActivated: [item: PartnerCore | PartnerItem];
}>();

const candidatePositionKey = ref(
  props.resource.input.candidatePositionKey ?? '',
);
const search = ref(props.resource.view.search ?? '');
const metricTooltipVisible = ref(false);
const metricTooltipTrigger = ref<HTMLButtonElement | null>(null);
const metricTooltipWidth = ref<number>();
const compactLayout = useCompactLayout();
const controlSize = computed(() =>
  compactLayout.value ? 'small' : 'medium',
);
let searchTimer: number | undefined;
let lastAttempt:
  | Readonly<{
      input: Readonly<PartnersInput>;
      kind: 'full';
      view: Readonly<PartnersView>;
    }>
  | Readonly<{
      kind: 'view';
      view: Readonly<PartnersView>;
    }>
  | null = null;

const sourceSignature = computed(() =>
  [
    props.source.person.id,
    ...props.source.identities.map((identity) => identity.positionKey),
  ].join('\u0000'),
);
const currentPayload = computed(() => {
  const payload = props.resource.payload;
  if (
    !payload ||
    payload.source.person.id !== props.source.person.id ||
    payload.source.positionKeys.length !== props.source.identities.length ||
    payload.source.positionKeys.some(
      (positionKey, index) =>
        positionKey !== props.source.identities[index]?.positionKey,
    )
  ) {
    return null;
  }
  return payload;
});
const view = computed<Readonly<PartnersView>>(() =>
  Object.freeze({
    order: props.resource.view.order ?? defaultPartnersView.order,
    page: props.resource.view.page ?? defaultPartnersView.page,
    pageSize:
      props.resource.view.pageSize ?? defaultPartnersView.pageSize,
    search: props.resource.view.search ?? defaultPartnersView.search,
    sort: props.resource.view.sort ?? defaultPartnersView.sort,
  }),
);
const personal = computed(() => props.scope === 'personal');
const fullPending = computed(() => props.resource.phase === 'pending');
const listPending = computed(
  () => fullPending.value || props.resource.viewPending,
);
const sortOptions = computed(() =>
  [...partnerSortOptions(props.scope, props.workUnit)],
);
const positionOptions = computed(() => [
  { label: '全部职位', value: '' },
  ...props.positionKeys.map((positionKey) => ({
    label: props.positionLabel(positionKey),
    value: positionKey,
  })),
]);
const leaderMetrics = computed<
  readonly PartnerLeader['metric'][]
>(() =>
  personal.value
    ? ['count', 'average', 'overall', 'preference']
    : ['count', 'average', 'overall'],
);
const rangeLabel = computed(() => {
  const payload = currentPayload.value;
  if (!payload || payload.pagination.total === 0 || payload.items.length === 0) {
    return `0—0 / ${payload?.pagination.total ?? 0}`;
  }
  const start =
    (payload.pagination.page - 1) * payload.pagination.pageSize + 1;
  return `${start}—${Math.min(
    start + payload.items.length - 1,
    payload.pagination.total,
  )} / ${payload.pagination.total}`;
});
const activePositionLabel = computed(() =>
  candidatePositionKey.value
    ? props.positionLabel(candidatePositionKey.value)
    : '全部已查询职位',
);
const statusMessage = computed(() => {
  if (fullPending.value) {
    return '正在加载合作人物分析';
  }
  if (props.resource.viewPending) {
    return '正在更新合作人物列表';
  }
  return props.resource.error ?? props.resource.feedback ?? '';
});
const metricHelp = computed(
  () =>
    `作品或系列数、均分、已评分数量与综合分均由服务端返回；综合分结合有效评分证据衡量合作表现。${
      personal.value
        ? '相对偏好及其证据同样由服务端返回，页面不会从当前列表重新计算。'
        : ''
    }`,
);

function primaryName(
  person: Readonly<{ name: string; nameCN: string | null }>,
): string {
  return person.nameCN ?? person.name;
}

function sourceWorkLabel(): string {
  if (props.workUnit === 'series') {
    return '参与系列';
  }
  return personal.value ? '收藏作品' : '参与作品';
}

function leaderLabel(metric: PartnerLeader['metric']): string {
  if (metric === 'count') {
    return props.workUnit === 'series' ? '系列数最高' : '合作数最高';
  }
  if (metric === 'average') {
    return '均分最高';
  }
  if (metric === 'overall') {
    return '综合分最高';
  }
  return '偏好分最高';
}

function metricValue(
  item: PartnerCore,
  metric: PartnerLeader['metric'],
): string {
  if (metric === 'count') {
    return `${item.metrics.workCount} ${
      props.workUnit === 'series' ? '个' : '部'
    }`;
  }
  if (metric === 'average') {
    return formatHundredths(item.metrics.average);
  }
  if (metric === 'overall') {
    return formatHundredths(item.metrics.overall);
  }
  return formatRational(item.preference?.score);
}

function itemSummary(item: PartnerCore): string {
  return [
    `${item.metrics.workCount} ${
      props.workUnit === 'series' ? '个系列' : '部作品'
    }`,
    `均分 ${formatHundredths(item.metrics.average)}`,
    `综合分 ${formatHundredths(item.metrics.overall)}`,
    ...(personal.value
      ? [`相对偏好 ${formatRational(item.preference?.score)}`]
      : []),
  ].join('，');
}

function selectedView(patch: Partial<PartnersView>): Readonly<PartnersView> {
  return updatePartnersView(view.value, patch);
}

function requestView(patch: Partial<PartnersView>): void {
  const nextView = selectedView(patch);
  lastAttempt = Object.freeze({ kind: 'view', view: nextView });
  void props.executeView(nextView);
}

function clearSearchTimer(): void {
  if (searchTimer !== undefined) {
    props.targetWindow.clearTimeout(searchTimer);
    searchTimer = undefined;
  }
}

function requestSearchNow(): void {
  clearSearchTimer();
  requestView({ search: search.value });
}

function openMetricTooltip(): void {
  const trigger = metricTooltipTrigger.value;
  if (compactLayout.value && trigger) {
    const availableWidth =
      props.targetWindow.document.documentElement.clientWidth -
      Math.max(0, trigger.getBoundingClientRect().left);
    metricTooltipWidth.value = Math.max(
      160,
      Math.min(336, Math.floor(availableWidth)),
    );
  } else {
    metricTooltipWidth.value = undefined;
  }
  metricTooltipVisible.value = true;
}

function closeMetricTooltip(): void {
  metricTooltipVisible.value = false;
}

function scheduleSearch(value: string): void {
  search.value = value;
  clearSearchTimer();
  searchTimer = props.targetWindow.setTimeout(requestSearchNow, 240);
}

function changeSort(value: string): void {
  requestView({
    sort: value as PartnersSort,
  });
}

function changeCandidatePosition(value: string): void {
  clearSearchTimer();
  candidatePositionKey.value = value;
  const input = partnersInput(
    props.source,
    candidatePositionKey.value || undefined,
  );
  const nextView = selectedView({ page: 1 });
  lastAttempt = Object.freeze({
    input,
    kind: 'full',
    view: nextView,
  });
  void props.execute(input, nextView);
}

function activate(item: PartnerCore | PartnerItem): void {
  const result = activatePartner(
    props.selection,
    item,
    props.positionLabel,
  );
  if (result.ok) {
    emit('partnerActivated', item);
  }
}

function retry(): void {
  if (lastAttempt?.kind === 'view') {
    void props.executeView(lastAttempt.view);
    return;
  }
  const input =
    lastAttempt?.input ??
    partnersInput(
      props.source,
      candidatePositionKey.value || undefined,
    );
  void props.execute(input, lastAttempt?.view ?? view.value);
}

function ensureSource(): void {
  clearSearchTimer();
  const inputMatches = partnersInputMatchesSelection(
    props.resource.input,
    props.source,
  );
  if (
    inputMatches &&
    (props.resource.phase === 'pending' ||
      props.resource.phase === 'error' ||
      (props.resource.phase === 'ready' && currentPayload.value))
  ) {
    return;
  }
  candidatePositionKey.value = '';
  search.value = '';
  const input = partnersInput(props.source);
  const nextView = Object.freeze({
    ...view.value,
    page: 1,
    search: '',
  });
  lastAttempt = Object.freeze({
    input,
    kind: 'full',
    view: nextView,
  });
  void props.execute(input, nextView);
}

watch(sourceSignature, ensureSource);
watch(
  () => props.resource.phase,
  (phase) => {
    if (phase === 'pending') {
      clearSearchTimer();
    }
  },
);
watch(
  () =>
    [props.resource.view.search, props.resource.viewPending] as const,
  ([value, pending]) => {
    if (value !== undefined && !pending) {
      search.value = value;
    }
  },
);
watch(
  () => props.resource.input.candidatePositionKey,
  (value) => {
    if (
      partnersInputMatchesSelection(props.resource.input, props.source)
    ) {
      candidatePositionKey.value = value ?? '';
    }
  },
);

onMounted(ensureSource);
onBeforeUnmount(clearSearchTimer);
</script>

<template>
  <article
    class="single-cooperation partners-surface surface-panel"
    aria-label="单人物共演分析"
  >
    <p class="sr-only" role="status" aria-live="polite">
      {{ statusMessage }}
    </p>

    <section
      class="single-cooperation__selection"
      aria-label="已选人物概览"
    >
      <div class="single-cooperation__selection-content">
        <article
          class="selected-person-card"
          :aria-labelledby="`partners-source-${source.person.id}`"
        >
          <div class="selected-person-card__media">
            <safe-image
              class="selected-person-card__image"
              :sources="
                personImageCandidates(
                  source.person.id,
                  84,
                  devicePixelRatio,
                )
              "
              :alt="primaryName(source.person)"
              decorative
              loading="eager"
              :width="84"
            />
          </div>
          <div class="selected-person-card__body">
            <header class="selected-person-card__header">
              <span class="selected-person-card__ordinal" aria-hidden="true">
                01
              </span>
              <span
                class="selected-person-card__signature-rule"
                aria-hidden="true"
              />
              <div class="selected-person-card__signature">
                <h2
                  :id="`partners-source-${source.person.id}`"
                  class="selected-person-card__name"
                  :title="primaryName(source.person)"
                >
                  {{ primaryName(source.person) }}
                </h2>
                <p
                  class="selected-person-card__identities"
                  :aria-label="`${primaryName(source.person)}的已选身份`"
                >
                  <template
                    v-for="(identity, index) in source.identities"
                    :key="identity.positionKey"
                  >
                    <span>{{ identity.positionLabel }}</span>
                    <span
                      v-if="index < source.identities.length - 1"
                      class="selected-person-card__identity-separator"
                      aria-hidden="true"
                    >
                      ·
                    </span>
                  </template>
                </p>
              </div>
            </header>
            <dl class="selected-person-card__metrics">
              <div>
                <dd>
                  <span
                    v-if="fullPending && !currentPayload"
                    class="partners-inline-skeleton"
                    aria-hidden="true"
                  />
                  <template v-else>
                    {{ currentPayload?.source.metrics.workCount ?? '—' }}
                  </template>
                </dd>
                <dt>{{ sourceWorkLabel() }}</dt>
              </div>
              <div>
                <dd>
                  <span
                    v-if="fullPending && !currentPayload"
                    class="partners-inline-skeleton"
                    aria-hidden="true"
                  />
                  <template v-else>
                    {{
                      formatHundredths(
                        currentPayload?.source.metrics.average ?? null,
                      )
                    }}
                  </template>
                </dd>
                <dt>均分</dt>
              </div>
            </dl>
          </div>
        </article>

        <div class="single-cooperation__profile-copy">
          <div
            v-if="fullPending"
            class="single-cooperation__summary-grid partners-summary-skeleton"
            aria-hidden="true"
          >
            <span v-for="index in personal ? 5 : 4" :key="index" />
          </div>
          <div
            v-else-if="!currentPayload && !resource.error"
            class="single-cooperation__summary-grid partners-summary-placeholder"
            aria-label="合作人物分析暂无数据"
          >
            <div class="single-cooperation__summary-cell">
              <b>—</b>
              <small>合作人物</small>
            </div>
            <div
              v-for="metric in leaderMetrics"
              :key="metric"
              class="single-cooperation__leader partners-leader-placeholder"
            >
              <b>—</b>
              <small>{{ leaderLabel(metric) }}</small>
              <span class="single-cooperation__leader-person">
                <strong>暂无数据</strong>
              </span>
            </div>
          </div>
          <div
            v-else-if="currentPayload"
            class="single-cooperation__summary-grid"
            :aria-label="`合作人物 ${currentPayload.summary.partnerCount} 位，各指标最高合作人物`"
          >
            <div class="single-cooperation__summary-cell">
              <b>{{ currentPayload.summary.partnerCount }}</b>
              <small>合作人物</small>
            </div>
            <button
              v-for="leader in currentPayload.summary.leaders"
              :key="leader.metric"
              class="single-cooperation__leader"
              type="button"
              :disabled="!leader.item"
              :aria-label="
                leader.item
                  ? `${leaderLabel(leader.metric)}：${primaryName(
                      leader.item.person,
                    )}，${metricValue(leader.item, leader.metric)}`
                  : `${leaderLabel(leader.metric)}：暂无数据`
              "
              @click="leader.item && activate(leader.item)"
            >
              <b>{{
                leader.item
                  ? metricValue(leader.item, leader.metric)
                  : '—'
              }}</b>
              <small>{{ leaderLabel(leader.metric) }}</small>
              <span class="single-cooperation__leader-person">
                <safe-image
                  v-if="leader.item"
                  class="single-cooperation__leader-avatar"
                  :sources="
                    personImageCandidates(
                      leader.item.person.id,
                      28,
                      devicePixelRatio,
                    )
                  "
                  :alt="primaryName(leader.item.person)"
                  decorative
                  :width="28"
                />
                <strong
                  :title="
                    leader.item
                      ? primaryName(leader.item.person)
                      : '暂无数据'
                  "
                >
                  {{
                    leader.item
                      ? primaryName(leader.item.person)
                      : '暂无数据'
                  }}
                </strong>
              </span>
            </button>
          </div>
        </div>
      </div>
    </section>

    <section
      class="single-cooperation__workspace"
      aria-labelledby="cooperation-people-title"
    >
      <div class="single-cooperation__partners">
        <div class="single-cooperation__heading">
          <div>
            <div class="single-cooperation__heading-title">
              <h2 id="cooperation-people-title">合作人物</h2>
              <n-tooltip
                :show="metricTooltipVisible"
                placement="top-start"
                trigger="manual"
                :animated="false"
                :width="metricTooltipWidth"
                style="max-width: min(336px, calc(100dvw - 72px));"
                content-class="workbench-tooltip-content"
              >
                <template #trigger>
                  <button
                    ref="metricTooltipTrigger"
                    class="partners-metric-info"
                    type="button"
                    :aria-expanded="metricTooltipVisible"
                    :aria-label="`合作人物指标说明：${metricHelp}`"
                    @mouseenter="openMetricTooltip"
                    @mouseleave="closeMetricTooltip"
                    @focus="openMetricTooltip"
                    @blur="closeMetricTooltip"
                    @click.stop="openMetricTooltip"
                    @keydown.esc.stop.prevent="closeMetricTooltip"
                  >
                    <co-star-icon name="info" :size="16" />
                  </button>
                </template>
                <span class="partners-metric-help">{{ metricHelp }}</span>
              </n-tooltip>
            </div>
            <p>{{ rangeLabel }} · {{ activePositionLabel }}</p>
          </div>
        </div>

        <form
          class="ranking-toolbar partners-toolbar"
          role="search"
          @submit.prevent="requestSearchNow"
        >
          <n-input
            class="ranking-search-control"
            :size="controlSize"
            :value="search"
            :clearable="Boolean(search)"
            placeholder="搜索人物"
            autocomplete="off"
            aria-label="搜索合作人物"
            :input-props="{
              'aria-label': '搜索合作人物',
              name: 'partners-search',
              spellcheck: 'false',
            }"
            @update:value="scheduleSearch"
          >
            <template #prefix>
              <app-icon name="search" :size="16" />
            </template>
          </n-input>

          <n-select
            v-if="positionKeys.length > 1"
            class="ranking-sort-control partners-position-control"
            :size="controlSize"
            :menu-size="controlSize"
            :value="candidatePositionKey"
            :options="positionOptions"
            :consistent-menu-width="false"
            aria-label="按合作职位筛选"
            @update:value="changeCandidatePosition"
          />

          <n-select
            class="ranking-sort-control"
            :size="controlSize"
            :menu-size="controlSize"
            :value="view.sort"
            :options="sortOptions"
            :consistent-menu-width="false"
            aria-label="合作人物排序规则"
            @update:value="changeSort"
          />

          <sort-direction-button
            :order="view.order"
            @change="requestView({ order: $event })"
          />
        </form>

        <div
          v-if="resource.error && currentPayload"
          class="partners-inline-error"
          role="alert"
        >
          <span>{{ resource.error }}</span>
          <n-button
            class="partners-retry"
            :size="controlSize"
            secondary
            type="error"
            @click="retry"
          >
            重试
          </n-button>
        </div>

        <div
          class="partners-results-boundary"
          :aria-busy="listPending ? 'true' : undefined"
        >
        <div
          class="ranking-columns partners-columns"
          :class="{ 'is-global': !personal }"
          aria-hidden="true"
        >
          <span>#</span>
          <span />
          <span>人物</span>
          <span
            class="ranking-columns__metrics"
            :style="{
              '--ranking-metric-columns': personal ? 4 : 3,
            }"
          >
            <span>{{ workUnit === 'series' ? '系列' : '作品' }}</span>
            <span>均分</span>
            <span>综合</span>
            <span v-if="personal">偏好</span>
          </span>
        </div>

        <div
          v-if="listPending"
          class="partners-row-skeletons"
          aria-hidden="true"
        >
          <span v-for="index in view.pageSize" :key="index" />
        </div>
        <div
          v-else-if="resource.error && !currentPayload"
          class="partners-state"
          role="alert"
        >
          <app-icon name="refresh" :size="24" />
          <strong>合作人物加载失败</strong>
          <p>{{ resource.error }}</p>
          <div class="partners-state__actions">
            <n-button
              class="partners-retry"
              :size="controlSize"
              type="primary"
              @click="retry"
            >
              重试
            </n-button>
            <n-button
              :size="controlSize"
              secondary
              @click="cancel"
            >
              取消
            </n-button>
          </div>
        </div>
        <div
          v-else-if="currentPayload?.items.length"
          class="ranked-person-list partners-person-list"
        >
          <button
            v-for="item in currentPayload.items"
            :key="item.person.id"
            class="ranked-person-row partners-person-row"
            type="button"
            :data-person-id="item.person.id"
            :aria-label="`${item.rank}. ${primaryName(
              item.person,
            )}，${item.positionKeys
              .map(positionLabel)
              .join(' / ')}，${itemSummary(item)}；选择为合作人物`"
            @click="activate(item)"
          >
            <span class="ranked-person-row__rank">{{ item.rank }}</span>
            <safe-image
              class="ranked-person-row__avatar"
              :sources="
                personImageCandidates(
                  item.person.id,
                  36,
                  devicePixelRatio,
                )
              "
              :alt="primaryName(item.person)"
              decorative
              :width="36"
            />
            <span class="ranked-person-row__identity">
              <strong :title="primaryName(item.person)">
                {{ primaryName(item.person) }}
              </strong>
              <small :title="item.positionKeys.map(positionLabel).join(' / ')">
                {{ item.positionKeys.map(positionLabel).join(' / ') }}
              </small>
            </span>
            <span
              class="ranked-person-row__metrics"
              :style="{
                '--ranking-metric-columns': personal ? 4 : 3,
              }"
              :aria-label="itemSummary(item)"
            >
              <span :class="{ 'is-active': view.sort === 'count' }">
                <strong>{{ item.metrics.workCount }}</strong>
              </span>
              <span :class="{ 'is-active': view.sort === 'average' }">
                <strong>{{
                  formatHundredths(item.metrics.average)
                }}</strong>
              </span>
              <span :class="{ 'is-active': view.sort === 'overall' }">
                <strong>{{
                  formatHundredths(item.metrics.overall)
                }}</strong>
              </span>
              <span
                v-if="personal"
                :class="{
                  'is-active': view.sort === 'preference',
                  'is-unavailable': item.preference?.score == null,
                }"
              >
                <strong>{{ formatRational(item.preference?.score) }}</strong>
              </span>
            </span>
          </button>
        </div>
        <div v-else class="partners-state">
          <app-icon name="search" :size="22" />
          <strong>
            {{
              search.trim()
                ? '没有符合搜索条件的人物'
                : '没有符合当前条件的合作人物'
            }}
          </strong>
        </div>

        <div class="partners-pagination">
          <div v-if="listPending" class="ranking-pagination-skeleton" />
          <adaptive-pagination
            v-else-if="currentPayload"
            aria-label="合作人物分页"
            :item-count="currentPayload.items.length"
            :page="currentPayload.pagination.page"
            :page-size="currentPayload.pagination.pageSize"
            page-size-label="每页合作人物数"
            page-size-unit="人"
            :pending="resource.viewPending"
            :total="currentPayload.pagination.total"
            @page="requestView({ page: $event })"
            @page-size="requestView({ pageSize: $event })"
          />
        </div>
        </div>
      </div>
    </section>
  </article>
</template>

<style src="../partners.css"></style>
