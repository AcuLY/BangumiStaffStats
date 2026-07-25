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
  onBeforeUnmount,
  ref,
  watch,
} from 'vue';

import SafeImage from '../../../shared/components/SafeImage.vue';
import AppIcon from '../../../shared/components/AppIcon.vue';
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
    targetWindow?: Window;
  }>(),
  {
    devicePixelRatio: 1,
    drawer: false,
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
const searchDraft = ref(props.resource.view.search ?? '');
let searchTimer: number | undefined;

const view = computed<Readonly<CandidateView>>(() =>
  Object.freeze({
    ...defaultCandidateView,
    ...props.resource.view,
  }),
);
const payload = computed(() => props.resource.payload);
const positionKey = computed(() => {
  const inputKey = String(props.resource.input.positionKey ?? '');
  return inputKey || payload.value?.positionKey || '';
});
const positionOptions = computed(() =>
  (payload.value?.positionCounts ?? []).map((entry) => ({
    label: `${props.positionLabel(entry.positionKey)} · ${entry.count} 人`,
    value: entry.positionKey,
  })),
);
const currentPositionLabel = computed(() =>
  props.positionLabel(positionKey.value),
);
const currentPositionCount = computed(
  () =>
    payload.value?.positionCounts.find(
      (entry) => entry.positionKey === positionKey.value,
    )?.count ?? 0,
);
const range = computed(() => {
  const current = payload.value;
  if (!current || current.items.length === 0) {
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
const otherSelectedIdentityLabels = (personId: number) =>
  props.selection
    .identitiesFor(personId)
    .filter((identity) => identity.positionKey !== payload.value?.positionKey)
    .map((identity) => identity.positionLabel);

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
  if (!requestedPositionKey) {
    return;
  }
  void props.executeView(
    candidateInput(requestedPositionKey),
    updateCandidateView(view.value, patch),
  );
}

function changePosition(value: string): void {
  clearSearchTimer();
  searchDraft.value = '';
  requestView({ page: 1, search: '' }, value);
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
  props.selection.toggle({
    person: item.person,
    positionKey: payload.value.positionKey,
    positionLabel: props.positionLabel(payload.value.positionKey),
  });
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
  <div class="candidate-picker" :class="{ 'is-drawer': drawer }">
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
                  v-for="identity in item.identities"
                  :key="identity.positionKey"
                  class="candidate-selected-position"
                  type="button"
                  :aria-label="`移除${primaryPersonName(item.person)}的${identity.positionLabel}身份`"
                  :title="`移除${identity.positionLabel}身份`"
                  @click="
                    selection.removeIdentity(
                      item.person.id,
                      identity.positionKey,
                    )
                  "
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
                @click="selection.removePerson(item.person.id)"
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
          {{ currentPositionCount }}
        </span>
      </div>

      <div
        v-if="positionOptions.length > 1"
        class="candidate-position-browser"
      >
        <span>浏览职位</span>
        <n-select
          :size="controlSize"
          :menu-size="controlSize"
          :value="positionKey"
          :options="positionOptions"
          aria-label="浏览已应用职位"
          :input-props="{ name: 'candidatePosition' }"
          @update:value="changePosition"
        />
      </div>

      <div
        class="candidate-position-results"
        role="region"
        :aria-label="`${currentPositionLabel}候选人物`"
        :aria-busy="rowsPending"
      >
        <div class="candidate-toolbar">
          <n-input
            :size="controlSize"
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
            :size="controlSize"
            :menu-size="controlSize"
            :value="view.sort"
            :options="sortOptions"
            :consistent-menu-width="false"
            aria-label="候选人物排序规则"
            @update:value="changeSort"
          />
          <sort-direction-button
            class="candidate-sort-direction"
            :order="view.order"
            @change="changeOrder"
          />
        </div>

        <p
          v-if="resource.error && payload"
          class="candidate-inline-error"
          role="alert"
        >
          {{ resource.error }}
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
          <p>{{ resource.error }}</p>
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
              'is-selected':
                payload &&
                selection.has(item.person.id, payload.positionKey),
            }"
            :aria-pressed="
              payload
                ? selection.has(item.person.id, payload.positionKey)
                : false
            "
            :aria-label="`${payload && selection.has(item.person.id, payload.positionKey) ? '移除' : '选择'}${primaryPersonName(item.person)}的${currentPositionLabel}身份`"
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
                  payload &&
                  selection.has(item.person.id, payload.positionKey)
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
                v-if="otherSelectedIdentityLabels(item.person.id).length"
                class="candidate-other-positions"
                :title="`已选其他身份：${otherSelectedIdentityLabels(item.person.id).join(' / ')}`"
              >
                已选其他身份：{{
                  otherSelectedIdentityLabels(item.person.id).join(' / ')
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
            @page="requestView({ page: $event })"
            @page-size="requestView({ pageSize: $event })"
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
