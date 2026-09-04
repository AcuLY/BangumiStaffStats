<script setup lang="ts">
import {
  NButton,
  NCollapse,
  NCollapseItem,
  NInput,
  NSelect,
  NSkeleton,
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
import { useCompactLayout } from '../../query/composables/useCompactLayout';
import AdaptivePagination from '../../ranking/components/AdaptivePagination.vue';
import SortDirectionButton from '../../ranking/components/SortDirectionButton.vue';
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
const controlSize = computed(() =>
  compactLayout.value ? 'small' : 'medium',
);
const toolbarControlSize = 'small' as const;
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
      label: `${props.positionLabel(entry.positionKey)} · ${entry.count} 人`,
      value: entry.positionKey,
    })),
  ],
);
const currentPositionLabel = computed(() =>
  positionKey.value === null ? '全部职位' : props.positionLabel(positionKey.value),
);
const payloadMatchesPosition = computed(
  () => payload.value?.positionKey === positionKey.value,
);
const currentPositionCount = computed(
  () =>
    !payloadMatchesPosition.value
      ? null
      : positionKey.value === null
      ? payload.value?.pagination.total ?? 0
      : payload.value?.positionCounts.find(
          (entry) => entry.positionKey === positionKey.value,
        )?.count ?? 0,
);
const range = computed(() => {
  const current = payload.value;
  if (
    !current ||
    !payloadMatchesPosition.value ||
    current.items.length === 0
  ) {
    return { end: 0, start: 0 };
  }
  const start =
    (current.pagination.page - 1) * current.pagination.pageSize + 1;
  return {
    end: start + current.items.length - 1,
    start,
  };
});
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
  if (!payload.value) {
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
    '.n-collapse-item__header-main',
  ) ?? null;
  if (!focusTarget && trayHeader) {
    trayHeader.tabIndex = -1;
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

onBeforeUnmount(clearSearchTimer);
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
          <template #header>已选人物</template>
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

          <ol
            id="co-star-selected-people-list"
            class="candidate-selected-people"
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
                  <span class="candidate-selected-position__surface">
                    <span :title="identity.positionLabel">
                      {{ identity.positionLabel }}
                    </span>
                    <app-icon name="close" :size="12" />
                  </span>
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
        <span>
          {{ currentPositionLabel }} · {{ range.start }}—{{ range.end }} /
          {{ currentPositionCount ?? '…' }}
        </span>
      </div>

      <div class="candidate-position-browser">
        <n-select
          :size="controlSize"
          :menu-size="controlSize"
          :value="positionKey ?? allPositionsValue"
          :options="positionOptions"
          aria-label="候选职位范围"
          :input-props="{ name: 'candidatePosition' }"
          @update:value="changePosition"
        />
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
        <div class="candidate-toolbar">
          <n-input
            :size="toolbarControlSize"
            :value="searchDraft"
            :clearable="Boolean(searchDraft)"
            autocomplete="off"
            placeholder="搜索人物"
            :aria-label="`搜索${currentPositionLabel}候选人物`"
            :input-props="{
              name: 'candidateSearch',
              spellcheck: 'false',
            }"
            @update:value="changeSearch"
          >
            <template #prefix>
              <app-icon name="search" :size="16" />
            </template>
          </n-input>
          <n-select
            class="candidate-sort-select"
            :size="toolbarControlSize"
            :menu-size="toolbarControlSize"
            :value="view.sort"
            :options="sortOptions"
            :consistent-menu-width="false"
            aria-label="候选人物排序规则"
            @update:value="changeSort"
          />
          <sort-direction-button
            class="candidate-sort-direction"
            :size="toolbarControlSize"
            :order="view.order"
            @change="changeOrder"
          />
        </div>

        <p
          v-if="resource.error && payload"
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

        <div v-if="rowsPending" class="candidate-row-skeletons">
          <span class="sr-only" role="status" aria-live="polite">
            正在加载候选人物
          </span>
          <n-skeleton
            v-for="index in view.pageSize"
            :key="index"
            height="60px"
            :sharp="false"
            aria-hidden="true"
          />
        </div>

        <div
          v-else-if="!payload && resource.error"
          class="candidate-state"
          role="alert"
        >
          <strong>候选人物加载失败</strong>
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
            }"
            :aria-pressed="itemSelected(item)"
            :aria-label="`${itemSelected(item) ? '移除' : '选择'}${primaryPersonName(item.person)}的${item.positionKeys.map(positionLabel).join('、')}身份`"
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
                  itemSelected(item)
                "
                class="candidate-row__selected-state"
                aria-hidden="true"
              >
                <co-star-icon name="check" :size="11" />
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
                :title="item.positionKeys.map(positionLabel).join(' / ')"
              >
                {{ item.positionKeys.map(positionLabel).join(' · ') }}
              </span>
              <span
                v-if="otherSelectedIdentityLabels(item.person.id, item.positionKeys).length"
                class="candidate-other-positions"
                :title="`已选其他身份：${otherSelectedIdentityLabels(item.person.id, item.positionKeys).join(' / ')}`"
              >
                已选其他身份：{{
                  otherSelectedIdentityLabels(item.person.id, item.positionKeys).join(' / ')
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

        <footer class="candidate-footer">
          <div v-if="rowsPending" class="candidate-pagination-skeleton" />
          <adaptive-pagination
            v-else-if="payload"
            :page="payload.pagination.page"
            :page-size="payload.pagination.pageSize"
            :item-count="payload.items.length"
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
