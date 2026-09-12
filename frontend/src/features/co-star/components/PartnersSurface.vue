<script setup lang="ts">
import { joinDisplayText } from '../../../shared/text/separators';

import {
  NButton,
  NSelect,
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
import { useResultReveal } from '../../../shared/composables/useResultReveal';
import { personImageCandidates } from '../../../shared/media/bangumiImage';
import { useCompactLayout } from '../../../shared/composables/useCompactLayout';
import {
  formatHundredths,
  formatRational,
} from '../../ranking/format';
import AdaptivePagination from '../../ranking/components/AdaptivePagination.vue';
import RankedPersonList from '../../ranking/components/RankedPersonList.vue';
import type { RankingItem } from '../../ranking/model';
import SearchSortToolbar from '../../../shared/components/SearchSortToolbar.vue';
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
import CoStarParticipants from './CoStarParticipants.vue';
import PartnersSkeleton from './PartnersSkeleton.vue';

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
  inspectPerson: [person: SelectedPerson['person'], positionKeys: readonly string[], trigger: HTMLElement];
  partnerActivated: [item: PartnerCore | PartnerItem, trigger: HTMLElement];
}>();

const candidatePositionKey = ref(
  props.resource.input.candidatePositionKey ?? '',
);
const search = ref(props.resource.view.search ?? '');
const compactLayout = useCompactLayout();
const controlSize = computed(() =>
  compactLayout.value ? 'small' : 'medium',
);
const partnerResults = useResultReveal(props.targetWindow);
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
const rankingItems = computed<readonly RankingItem[]>(() =>
  (currentPayload.value?.items ?? []).map((item) => ({
    ...item.metrics,
    person: item.person,
    rank: item.rank,
    preference: item.preference?.score && item.preference.mean
      ? { ...item.preference, score: item.preference.score, mean: item.preference.mean }
      : null,
  })),
);
const identityLabels = computed(() => Object.fromEntries(
  (currentPayload.value?.items ?? []).map((item) => [
    item.person.id, joinDisplayText(item.positionKeys.map(props.positionLabel), ' / '),
  ]),
));
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
// Latin letters in mixed labels do not occupy a full ideographic character.
const positionControlWidth = computed(() => `calc(${Math.max(...positionOptions.value.map(
  ({ label }) => Array.from(label).reduce((width, character) => width + (/^[\x20-\x7e]$/.test(character) ? 0.5 : 1), 0),
))}ic + 40px)`);
const leaderMetrics = computed<
  readonly PartnerLeader['metric'][]
>(() =>
  personal.value
    ? ['count', 'average', 'overall', 'preference']
    : ['count', 'average', 'overall'],
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

function activateRankedPartner(personId: number, trigger: HTMLElement): void {
  const item = currentPayload.value?.items.find((entry) => entry.person.id === personId);
  if (item) activateFromTrigger(item, trigger);
}


function selectedView(patch: Partial<PartnersView>): Readonly<PartnersView> {
  return updatePartnersView(view.value, patch);
}

function requestView(patch: Partial<PartnersView>): void {
  const nextView = selectedView(patch);
  lastAttempt = Object.freeze({ kind: 'view', view: nextView });
  void props.executeView(nextView);
}

async function requestPage(patch: Partial<PartnersView>): Promise<void> {
  const nextView = selectedView(patch);
  lastAttempt = Object.freeze({ kind: 'view', view: nextView });
  const accepted = await props.executeView(nextView);
  if (accepted) {
    await partnerResults.reveal();
  }
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

function activate(
  item: PartnerCore | PartnerItem,
  event: MouseEvent,
): void {
  activateFromTrigger(item, event.currentTarget as HTMLElement);
}

function activateFromTrigger(item: PartnerCore | PartnerItem, trigger: HTMLElement): void {
  const result = activatePartner(
    props.selection,
    item,
    props.positionLabel,
  );
  if (result.ok) {
    emit('partnerActivated', item, trigger);
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
    :class="{ 'is-personal': personal }"
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
        <co-star-participants
          :participants="[{ person: source.person, positionKeys: source.identities.map(identity => identity.positionKey), metrics: currentPayload?.source.metrics ?? { workCount: null, average: null } }]"
          :position-label="positionLabel"
          :work-unit="workUnit"
          :work-label="sourceWorkLabel()"
          :partner-count="currentPayload?.summary.partnerCount ?? null"
          :partner-count-pending="fullPending"
          :pending="fullPending && !currentPayload"
          :device-pixel-ratio="devicePixelRatio"
          @inspect-person="(person, keys, trigger) => emit('inspectPerson', person, keys, trigger)"
        />

        <div class="single-cooperation__profile-copy">
          <partners-skeleton
            v-if="fullPending"
            :source="source"
            :scope="scope"
            :work-unit="workUnit"
            :position-label="positionLabel"
            section="summary"
          />
          <div
            v-else-if="!currentPayload && !resource.error"
            class="single-cooperation__summary-grid partners-summary-placeholder"
            aria-label="合作人物分析暂无数据"
          >
            <div
              v-for="metric in leaderMetrics"
              :key="metric"
              class="single-cooperation__leader partners-leader-placeholder"
            >
              <b>—</b>
              <small>{{ leaderLabel(metric) }}</small>
            </div>
          </div>
          <div
            v-else-if="currentPayload"
            class="single-cooperation__summary-grid"
            :aria-label="`合作人物 ${currentPayload.summary.partnerCount} 位，各指标最高合作人物`"
          >
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
              @click="leader.item && activate(leader.item, $event)"
            >
              <b>{{
                leader.item
                  ? metricValue(leader.item, leader.metric)
                  : '—'
              }}</b>
              <small>{{ leaderLabel(leader.metric) }}</small>
              <span v-if="leader.item" class="single-cooperation__leader-person">
                <safe-image
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
                <strong :title="primaryName(leader.item.person)">
                  {{ primaryName(leader.item.person) }}
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
            </div>
          </div>
        </div>

        <search-sort-toolbar
          class="ranking-toolbar partners-toolbar"
          :style="{
            '--search-sort-controls-grow': 0,
            '--search-sort-search-basis': '8rem',
            '--search-sort-filter-width': positionControlWidth,
          }"
          :search="search"
          :sort="view.sort"
          :order="view.order"
          :options="sortOptions"
          search-label="搜索合作人物"
          search-name="partners-search"
          sort-label="合作人物排序规则"
          search-icon
          @search="scheduleSearch"
          @sort="changeSort"
          @order="requestView({ order: $event })"
          @submit="requestSearchNow"
        >
          <template #filters="{ size }">
            <n-select
              v-if="positionKeys.length > 1"
              class="ranking-sort-control partners-position-control"
              :size="size"
              :menu-size="size"
              :value="candidatePositionKey"
              :options="positionOptions"
              :consistent-menu-width="false"
              aria-label="按合作职位筛选"
              @update:value="changeCandidatePosition"
            />
          </template>
        </search-sort-toolbar>

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
          :ref="partnerResults.target"
          class="partners-results-boundary ranked-person-results"
          :class="{
            'is-reveal-attention': partnerResults.attention.value,
            'result-reveal-target': true,
          }"
          role="region"
          aria-label="合作人物结果"
          tabindex="-1"
          :aria-busy="listPending ? 'true' : undefined"
        >
        <partners-skeleton
          v-if="listPending"
          :source="source"
          :scope="scope"
          :work-unit="workUnit"
          :position-label="positionLabel"
          :page-size="view.pageSize"
          section="rows"
        />
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
        <ranked-person-list
          v-else-if="currentPayload?.items.length"
          :items="rankingItems"
          :metric-scale="currentPayload.metricScale"
          :personal="personal"
          :sort="view.sort"
          :work-unit="workUnit"
          :device-pixel-ratio="devicePixelRatio"
          :identity-labels="identityLabels"
          activation-label="选择为合作人物"
          @activate="activateRankedPartner"
        />
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

        <div v-if="currentPayload" class="partners-pagination">
          <adaptive-pagination
            aria-label="合作人物分页"
            :page="currentPayload.pagination.page"
            :page-size="currentPayload.pagination.pageSize"
            page-size-label="每页合作人物数"
            page-size-unit="人"
            :pending="listPending"
            :total="currentPayload.pagination.total"
            @page="requestPage({ page: $event })"
            @page-size="requestPage({ pageSize: $event })"
          />
        </div>
        </div>
      </div>
    </section>
  </article>
</template>

<style src="../partners.css"></style>
