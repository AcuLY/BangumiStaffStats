<script setup lang="ts">
import { joinDisplayText } from '../../../shared/text/separators';

import {
  NButton,
  NCollapse,
  NCollapseItem,
  NSelect,
  NTag,
} from 'naive-ui';
import {
  computed,
  nextTick,
  onBeforeUnmount,
  ref,
  watch,
} from 'vue';

import SafeImage from '../../../shared/components/SafeImage.vue';
import AppIcon from '../../../shared/components/AppIcon.vue';
import { useResultReveal } from '../../../shared/composables/useResultReveal';
import { personImageCandidates } from '../../../shared/media/bangumiImage';
import { useCompactLayout } from '../../../shared/composables/useCompactLayout';
import AdaptivePagination from '../../ranking/components/AdaptivePagination.vue';
import SearchSortToolbar from '../../../shared/components/SearchSortToolbar.vue';
import {
  candidateInput,
  candidateSortOptions,
  defaultCandidateView,
  primaryPersonName,
  updateCandidateView,
  type CandidateInput,
  type CandidateResource,
  type CandidateView,
} from '../model';
import type { CoStarSelection } from '../selection';
import CoStarIcon from './CoStarIcon.vue';
import CandidateRowsSkeleton from './CandidateRowsSkeleton.vue';

const props = withDefaults(
  defineProps<{
    cancel: () => void;
    devicePixelRatio?: number;
    drawer?: boolean;
    executeView: (
      input: Readonly<CandidateInput>,
      view: Readonly<CandidateView>,
    ) => Promise<boolean>;
    positionLabel: (positionKey: string) => string;
    resource: CandidateResource;
    retry: () => Promise<boolean>;
    selection: CoStarSelection;
    suppressErrorMessage?: boolean;
    targetWindow?: Window;
  }>(),
  {
    devicePixelRatio: 1,
    drawer: false,
    suppressErrorMessage: false,
    targetWindow: () => window,
  },
);
const emit = defineEmits<{
  close: [];
}>();

const selectedTrayExpandedNames = ref<Array<string | number>>(
  props.drawer ? [] : ['selected-people'],
);
const compactLayout = useCompactLayout();
const selectedList = ref<HTMLElement | null>(null);
const selectedCanScrollUp = ref(false);
const selectedCanScrollDown = ref(false);
let selectedResizeObserver: ResizeObserver | undefined;

function updateSelectedScrollEdges(): void {
  const list = selectedList.value;
  selectedCanScrollUp.value = Boolean(list && list.scrollTop > 1);
  selectedCanScrollDown.value = Boolean(list && list.scrollHeight - list.clientHeight - list.scrollTop > 1);
}

watch([selectedList, () => props.selection.people.value], () => {
  selectedResizeObserver?.disconnect();
  const list = selectedList.value;
  if (list && typeof ResizeObserver === 'function') {
    selectedResizeObserver = new ResizeObserver(updateSelectedScrollEdges);
    selectedResizeObserver.observe(list);
    for (const item of list.children) selectedResizeObserver.observe(item);
  }
  updateSelectedScrollEdges();
}, { flush: 'post' });
const controlSize = computed(() =>
  compactLayout.value ? 'small' : 'medium',
);
const allPositionsValue = '__all-positions__';
const searchDraft = ref(props.resource.view.search ?? '');
const picker = ref<HTMLElement | null>(null);
const selectedTray = ref<HTMLElement | null>(null);
const candidateResults = useResultReveal(props.targetWindow);
let searchTimer: number | undefined;

const view = computed<Readonly<CandidateView>>(() =>
  Object.freeze({
    ...defaultCandidateView,
    ...props.resource.view,
  }),
);
const payload = computed(() => props.resource.payload);
const positionKey = computed(() => {
  const requestedPositionKey = props.resource.input.positionKey;
  return requestedPositionKey === undefined
    ? payload.value?.positionKey ?? null
    : requestedPositionKey;
});
const positionOptions = computed(() =>
  [
    { label: '全部职位', value: allPositionsValue },
    ...(payload.value?.positionCounts ?? []).map((entry) => ({
      label: joinDisplayText([props.positionLabel(entry.positionKey), `${entry.count} 人`], ' · '),
      value: entry.positionKey,
    })),
  ],
);
const currentPositionLabel = computed(() =>
  positionKey.value === null ? '全部职位' : props.positionLabel(positionKey.value),
);
const sortOptions = computed(() =>
  [
    ...candidateSortOptions(
      payload.value?.scope ?? 'personal',
      payload.value?.workUnit ?? 'subject',
    ),
  ],
);
const rowsPending = computed(
  () => props.resource.phase === 'pending' || props.resource.viewPending,
);
const otherSelectedIdentityLabels = (
  personId: number,
  currentPositionKeys: readonly string[],
) =>
  props.selection
    .identitiesFor(personId)
    .filter((identity) => !currentPositionKeys.includes(identity.positionKey))
    .map((identity) => identity.positionLabel);

const itemSelected = (
  item: NonNullable<CandidateResource['payload']>['items'][number],
) =>
  item.positionKeys.every((key) => props.selection.has(item.person.id, key));

const itemPartiallySelected = (
  item: NonNullable<CandidateResource['payload']>['items'][number],
) => !itemSelected(item) && item.positionKeys.some((key) => props.selection.has(item.person.id, key));

function candidateActionLabel(item: NonNullable<CandidateResource['payload']>['items'][number]): string {
  const name = primaryPersonName(item.person);
  if (itemPartiallySelected(item)) {
    const selected = props.selection.identitiesFor(item.person.id).map((identity) => identity.positionLabel).join('、');
    const missing = item.positionKeys.filter((key) => !props.selection.has(item.person.id, key)).map(props.positionLabel).join('、');
    return `${name}已选${selected}身份；补选${missing}身份`;
  }
  return `${itemSelected(item) ? '移除' : '选择'}${name}的${item.positionKeys.map(props.positionLabel).join('、')}身份`;
}

function clearSearchTimer(): void {
  if (searchTimer !== undefined) {
    props.targetWindow.clearTimeout(searchTimer);
    searchTimer = undefined;
  }
}

function requestView(
  patch: Partial<CandidateView>,
  requestedPositionKey = positionKey.value,
): void {
  void props.executeView(
    candidateInput(requestedPositionKey),
    updateCandidateView(view.value, patch),
  );
}

async function requestPage(patch: Partial<CandidateView>): Promise<void> {
  const accepted = await props.executeView(
    candidateInput(positionKey.value),
    updateCandidateView(view.value, patch),
  );
  if (accepted) {
    await candidateResults.reveal();
  }
}

function changePosition(value: string): void {
  clearSearchTimer();
  searchDraft.value = '';
  requestView(
    { page: 1, search: '' },
    value === allPositionsValue ? null : value,
  );
}

function changeSearch(value: string): void {
  searchDraft.value = value;
  clearSearchTimer();
  searchTimer = props.targetWindow.setTimeout(() => {
    searchTimer = undefined;
    requestView({ search: value });
  }, 240);
}

function changeSort(value: string): void {
  requestView({ sort: value as CandidateView['sort'] });
}

function changeOrder(order: 'asc' | 'desc'): void {
  requestView({ order });
}

function toggleCandidate(
  item: NonNullable<CandidateResource['payload']>['items'][number],
): void {
  if (!payload.value || rowsPending.value || props.resource.membershipValid === false) {
    return;
  }
  const keys = item.positionKeys;
  if (itemSelected(item)) {
    props.selection.replace(
      props.selection.identities.value.filter(
        (identity) =>
          identity.person.id !== item.person.id ||
          !keys.includes(identity.positionKey),
      ),
    );
    return;
  }
  const retained = props.selection.identities.value.filter(
    (identity) =>
      identity.person.id !== item.person.id ||
      !keys.includes(identity.positionKey),
  );
  props.selection.replace([
    ...retained,
    ...keys.map((key) => ({
      person: item.person,
      positionKey: key,
      positionLabel: props.positionLabel(key),
    })),
  ]);
}

async function restoreSelectionFocus(
  personIndex: number,
  identityIndex = 0,
): Promise<void> {
  await nextTick();
  const people = props.selection.people.value;
  const person = people[Math.min(personIndex, people.length - 1)];
  let focusTarget: HTMLElement | null = null;

  if (person) {
    const personRow = selectedTray.value?.querySelector<HTMLElement>(
      `[data-selected-person-id="${person.person.id}"]`,
    );
    const identities = personRow?.querySelectorAll<HTMLElement>(
      '.candidate-selected-position',
    );
    if (identities?.length) {
      focusTarget = identities[Math.min(identityIndex, identities.length - 1)] ?? null;
    }
    focusTarget ??= personRow?.querySelector<HTMLElement>(
      '.candidate-selected-person__remove',
    ) ?? null;
  }

  const trayHeader = selectedTray.value?.querySelector<HTMLElement>(
    '.candidate-selected-tray-toggle',
  ) ?? null;
  if (!focusTarget && trayHeader) {
    focusTarget = trayHeader;
  }
  focusTarget ??= picker.value?.querySelector<HTMLInputElement>(
    'input[name="candidateSearch"]',
  ) ?? null;
  focusTarget ??= props.targetWindow.document.querySelector<HTMLElement>(
    '.co-star-mobile-entry',
  );
  focusTarget?.focus({ preventScroll: true });
}

async function removeIdentity(
  personId: number,
  positionKey: string,
  personIndex: number,
  identityIndex: number,
): Promise<void> {
  props.selection.removeIdentity(personId, positionKey);
  await restoreSelectionFocus(personIndex, identityIndex);
}

async function removePerson(personId: number, personIndex: number): Promise<void> {
  props.selection.removePerson(personId);
  await restoreSelectionFocus(personIndex);
}

watch(
  () => props.resource.view.search,
  (search) => {
    if (search !== undefined && search !== searchDraft.value) {
      searchDraft.value = search;
    }
  },
);

watch(
  () => props.resource.phase,
  (phase, previousPhase) => {
    if (phase === 'pending' && previousPhase !== 'pending') {
      clearSearchTimer();
      searchDraft.value = props.resource.view.search ?? '';
    }
  },
);

onBeforeUnmount(() => {
  clearSearchTimer();
  selectedResizeObserver?.disconnect();
});
</script>

<template>
  <div ref="picker" class="candidate-picker" :class="{ 'is-drawer': drawer }">
    <header v-if="drawer" class="candidate-picker__heading">
      <h2>人物选择</h2>
      <n-button
        class="candidate-picker__close-hit candidate-picker__close"
        quaternary
        circle
        attr-type="button"
        aria-label="关闭人物选择"
        title="关闭人物选择"
        @click="emit('close')"
      >
        <span class="candidate-picker__close-surface">
          <app-icon name="close" :size="16" />
        </span>
      </n-button>
    </header>

    <section
      ref="selectedTray"
      class="candidate-selected-tray"
      :class="{
        'is-expanded':
          selectedTrayExpandedNames.includes('selected-people'),
      }"
      aria-label="已选人物"
    >
      <n-collapse
        v-model:expanded-names="selectedTrayExpandedNames"
        display-directive="show"
      >
        <n-collapse-item name="selected-people">
          <template #header>
            <button
              class="candidate-selected-tray-toggle"
              type="button"
              :aria-expanded="selectedTrayExpandedNames.includes('selected-people')"
              aria-controls="co-star-selected-people-list"
              @click.stop="selectedTrayExpandedNames = selectedTrayExpandedNames.includes('selected-people') ? [] : ['selected-people']"
            >已选人物</button>
          </template>
          <template #header-extra>
            <span
              class="candidate-selection-summary"
              :aria-label="`${selection.personCount.value} 人，${selection.identityCount.value} 个身份`"
            >
              <span><strong>{{ selection.personCount.value }}</strong> 人</span>
              <span
                class="candidate-selection-summary__divider"
                aria-hidden="true"
              />
              <span>
                <strong>{{ selection.identityCount.value }}</strong> 身份
              </span>
            </span>
          </template>

          <div class="candidate-selected-content">
          <div
            class="candidate-selected-scroll-boundary"
            :inert="!selectedTrayExpandedNames.includes('selected-people') || undefined"
            :aria-hidden="!selectedTrayExpandedNames.includes('selected-people')"
            :class="{ 'can-scroll-up': selectedCanScrollUp, 'can-scroll-down': selectedCanScrollDown }"
          >
          <ol
            ref="selectedList"
            id="co-star-selected-people-list"
            class="candidate-selected-people"
            @scroll.passive="updateSelectedScrollEdges"
          >
            <li
              v-for="(item, index) in selection.people.value"
              :key="item.person.id"
              class="candidate-selected-person"
              :data-selected-person-id="item.person.id"
              :aria-label="`第${index + 1}位，${primaryPersonName(item.person)}，${item.identities
                .map((identity) => identity.positionLabel)
                .join('、')}`"
            >
              <span class="candidate-selected-person__ordinal" aria-hidden="true">
                {{ index + 1 }}
              </span>
              <strong
                class="candidate-selected-person__name"
                :title="primaryPersonName(item.person)"
              >
                <span>{{ primaryPersonName(item.person) }}</span>
              </strong>
              <span class="candidate-selected-person__positions">
                <button
                  v-for="(identity, identityIndex) in item.identities"
                  :key="identity.positionKey"
                  class="candidate-selected-position"
                  type="button"
                  :aria-label="`移除${primaryPersonName(item.person)}的${identity.positionLabel}身份`"
                  :title="`移除${identity.positionLabel}身份`"
                  @click="removeIdentity(
                    item.person.id,
                    identity.positionKey,
                    index,
                    identityIndex,
                  )"
                >
                  <n-tag class="candidate-selected-position__surface" type="primary" size="small">
                    <span class="candidate-selected-position__content">
                      <span :title="identity.positionLabel">
                        {{ identity.positionLabel }}
                      </span>
                      <app-icon name="close" :size="12" />
                    </span>
                  </n-tag>
                </button>
              </span>
              <button
                class="candidate-selected-person__remove"
                type="button"
                :aria-label="`移除${primaryPersonName(item.person)}的全部身份`"
                :title="`移除${primaryPersonName(item.person)}`"
                @click="removePerson(item.person.id, index)"
              >
                <span aria-hidden="true">
                  <app-icon name="close" :size="14" />
                </span>
              </button>
            </li>
          </ol>
          </div>
          <p v-if="selection.personCount.value === 1" class="co-star-multi-person-hint">
            <app-icon name="people" :size="20" />
            <span>点选下方候选人物，查看与已选人物的共演情况</span>
          </p>
          </div>
        </n-collapse-item>
      </n-collapse>
      <p
        v-if="selection.limitError.value"
        class="candidate-limit-error"
        role="alert"
      >
        {{ selection.limitError.value }}
      </p>
    </section>

    <section class="candidate-browser" aria-labelledby="candidate-title">
      <div class="candidate-browser__heading">
        <strong id="candidate-title">候选人物</strong>
      </div>

      <div
        :ref="candidateResults.target"
        class="candidate-position-results"
        :class="{
          'is-reveal-attention': candidateResults.attention.value,
          'result-reveal-target': true,
        }"
        role="region"
        tabindex="-1"
        :aria-label="`${currentPositionLabel}候选人物`"
        :aria-busy="rowsPending"
      >
        <search-sort-toolbar
          class="candidate-toolbar"
          :search="searchDraft"
          :sort="view.sort"
          :order="view.order"
          :options="sortOptions"
          :search-label="`搜索${currentPositionLabel}候选人物`"
          search-name="candidateSearch"
          search-class=""
          sort-label="候选人物排序规则"
          sort-class="candidate-sort-select"
          order-class="candidate-sort-direction"
          search-icon
          @search="changeSearch"
          @sort="changeSort"
          @order="changeOrder"
        >
          <template #filters="{ size }">
            <n-select
              :size="size"
              :menu-size="size"
              :value="positionKey ?? allPositionsValue"
              :options="positionOptions"
              :consistent-menu-width="false"
              aria-label="候选职位范围"
              :input-props="{ name: 'candidatePosition' }"
              @update:value="changePosition"
            />
          </template>
        </search-sort-toolbar>

        <p
          v-if="resource.error && payload && resource.membershipValid !== false"
          class="candidate-inline-error"
          :role="suppressErrorMessage ? undefined : 'alert'"
        >
          <span
            v-if="!suppressErrorMessage"
            class="candidate-inline-error__message"
          >{{ resource.error }}</span>
          <n-button
            class="candidate-retry"
            :size="controlSize"
            secondary
            type="error"
            @click="retry"
          >
            重试
          </n-button>
        </p>

        <template v-if="rowsPending">
          <span class="sr-only" role="status" aria-live="polite">
            正在加载候选人物
          </span>
          <candidate-rows-skeleton :count="view.pageSize" :show-positions="positionKey === null" />
        </template>

        <div
          v-else-if="(!payload && resource.error) || resource.membershipValid === false"
          class="candidate-state"
          role="alert"
        >
          <strong>{{ resource.error ? '候选人物加载失败' : '候选人物加载已取消' }}</strong>
          <p v-if="!suppressErrorMessage">{{ resource.error }}</p>
          <n-button
            class="app-primary-action candidate-retry"
            :size="controlSize"
            type="primary"
            @click="retry"
          >
            重试
          </n-button>
        </div>

        <div v-else class="candidate-list">
          <button
            v-for="item in payload?.items ?? []"
            :key="`candidate-${item.person.id}`"
            class="candidate-row"
            type="button"
            :class="{
              'is-selected': itemSelected(item),
              'is-partially-selected': itemPartiallySelected(item),
            }"
            :aria-pressed="itemPartiallySelected(item) ? 'mixed' : itemSelected(item)"
            :aria-label="candidateActionLabel(item)"
            @click="toggleCandidate(item)"
          >
            <span class="candidate-row__portrait">
              <safe-image
                class="candidate-row__avatar"
                :sources="
                  personImageCandidates(
                    item.person.id,
                    drawer ? 32 : 36,
                    devicePixelRatio,
                  )
                "
                :alt="primaryPersonName(item.person)"
                decorative
                :width="drawer ? 32 : 36"
              />
              <span
                v-if="
                  itemSelected(item) || itemPartiallySelected(item)
                "
                class="candidate-row__selected-state"
                aria-hidden="true"
              >
                <span v-if="itemPartiallySelected(item)" class="candidate-row__partial-mark" />
                <co-star-icon v-else name="check" :size="11" />
              </span>
            </span>
            <span class="candidate-row__identity">
              <strong :title="primaryPersonName(item.person)">
                {{ primaryPersonName(item.person) }}
              </strong>
              <small>
                <span class="candidate-rank">#{{ item.rank }}</span>
                <span aria-hidden="true">·</span>
                <span class="candidate-work-count">
                  <strong>{{ item.workCount }}</strong>
                  {{ payload?.workUnit === 'series' ? '个' : '部' }}
                </span>
              </small>
              <span
                v-if="positionKey === null"
                class="candidate-row__positions"
                :title="joinDisplayText(item.positionKeys.map(positionLabel), ' / ')"
              >
                {{ joinDisplayText([...(itemPartiallySelected(item) ? ['已选部分身份'] : []), joinDisplayText(item.positionKeys.map(positionLabel), ' / ')], ' · ') }}
              </span>
              <span
                v-if="otherSelectedIdentityLabels(item.person.id, item.positionKeys).length"
                class="candidate-other-positions"
                :title="`已选其他身份：${joinDisplayText(otherSelectedIdentityLabels(item.person.id, item.positionKeys), ' / ')}`"
              >
                已选其他身份：{{
                  joinDisplayText(otherSelectedIdentityLabels(item.person.id, item.positionKeys), ' / ')
                }}
              </span>
            </span>
          </button>

          <div
            v-if="payload && payload.items.length === 0"
            class="candidate-empty"
            role="status"
            aria-live="polite"
          >
            <app-icon name="search" :size="22" />
            <strong>
              {{
                view.search.trim()
                  ? '没有符合搜索条件的人物'
                  : '该职位暂无候选人物'
              }}
            </strong>
          </div>
        </div>

        <footer v-if="payload && resource.membershipValid !== false" class="candidate-footer">
          <adaptive-pagination
            :pending="rowsPending"
            :page="payload.pagination.page"
            :page-size="payload.pagination.pageSize"
            :total="payload.pagination.total"
            aria-label="候选人物分页"
            page-size-label="每页人数"
            page-size-unit="人"
            @page="requestPage({ page: $event })"
            @page-size="requestPage({ pageSize: $event })"
          />
        </footer>
      </div>
    </section>

    <n-button
      v-if="rowsPending"
      class="candidate-cancel"
      :size="controlSize"
      secondary
      @click="cancel"
    >
      取消
    </n-button>
  </div>
</template>
