<script setup lang="ts">
import {
  NButton,
  NCheckbox,
  NCheckboxGroup,
  NCollapse,
  NCollapseItem,
  NDynamicTags,
  NInput,
  NRadioButton,
  NRadioGroup,
  NSelect,
  NSpace,
  NSwitch,
  NTooltip,
} from 'naive-ui';
import { computed, nextTick, ref, watch } from 'vue';

import type {
  CatalogGroup,
  CatalogPosition,
  CatalogSubjectType,
  SubjectType,
} from '../../../api/adapters/catalog';
import type { CatalogPhase } from '../../catalog/store';
import type {
  DraftRange,
  QueryDraft,
  QueryField,
  QueryFieldErrors,
  QueryMode,
} from '../model';
import {
  queryInputThemeOverrides,
  queryRadioThemeOverrides,
  querySelectThemeOverrides,
  type QueryControlSize,
} from './controlTheme';
import PositionSelector from './PositionSelector.vue';
import QueryDateRange from './QueryDateRange.vue';
import QueryIcon from './QueryIcon.vue';
import QueryNumericRange from './QueryNumericRange.vue';

const props = defineProps<{
  catalogPhase: CatalogPhase;
  compact: boolean;
  dirty: boolean;
  disabled?: boolean;
  draft: QueryDraft;
  errors: QueryFieldErrors;
  groups: readonly CatalogGroup[];
  hasAppliedQuery: boolean;
  mergeSeriesAvailable: boolean;
  mode: QueryMode;
  positions: readonly CatalogPosition[];
  statusMessage?: string | null;
  subjectTypes: readonly CatalogSubjectType[];
}>();

const emit = defineEmits<{
  cancel: [];
  close: [];
  refresh: [];
  retryCatalog: [];
  restore: [];
  submit: [];
}>();
const expandedSections = defineModel<string[]>('expandedSections', {
  default: () => [],
});

type AdvancedOptionKey =
  | 'collectionDate'
  | 'globalRate'
  | 'mergeSeries'
  | 'negativeTags'
  | 'positiveTags'
  | 'ratingCount'
  | 'scoreDifference'
  | 'showNSFW'
  | 'subjectDate'
  | 'userRate';
type RangeOptionKey =
  | 'collectionDate'
  | 'globalRate'
  | 'ratingCount'
  | 'scoreDifference'
  | 'subjectDate'
  | 'userRate';
type NumericOptionKey = Exclude<
  RangeOptionKey,
  'collectionDate' | 'subjectDate'
>;
type TagOptionKey = 'negativeTags' | 'positiveTags';

interface AdvancedOption {
  field?: QueryField;
  help: string;
  key: AdvancedOptionKey;
  personalOnly?: boolean;
  title: string;
}

type FocusableControl = { focus: () => void };

const uidHelpVisible = ref(false);
const visibleHelp = ref<string | null>(null);
const collectionField = ref<HTMLFieldSetElement>();
const editorForm = ref<HTMLFormElement>();
const positionInput = ref<FocusableControl>();
const subjectTypeInput = ref<FocusableControl>();
const userInput = ref<FocusableControl>();
const controlSize = computed<QueryControlSize>(() =>
  props.compact ? 'small' : 'medium',
);

const advancedOptionGroups: readonly (readonly AdvancedOption[])[] = [
  [
    {
      key: 'showNSFW',
      title: '显示 NSFW 条目',
      help: '',
    },
    {
      key: 'mergeSeries',
      title: '合并续作',
      help: '按续作关系把条目合并为系列；人物、共同范围和数量按系列去重，系列评分取当前范围内成员作品的均分',
      field: 'mergeSeries',
    },
  ],
  [
    {
      key: 'subjectDate',
      title: '播出时间范围',
      help: '',
      field: 'subjectDate',
    },
    {
      key: 'collectionDate',
      title: '收藏时间范围',
      help: '按收藏记录最后更新时间筛选；修改收藏状态、评分或短评都会更新时间，不等同于首次收藏时间',
      field: 'collectionUpdatedAt',
      personalOnly: true,
    },
  ],
  [
    {
      key: 'userRate',
      title: '我的评分范围',
      help: '',
      field: 'personalScore',
      personalOnly: true,
    },
    {
      key: 'globalRate',
      title: '全站评分范围',
      help: '',
      field: 'globalScore',
    },
  ],
  [
    {
      key: 'scoreDifference',
      title: '我的评分与全站评分差范围',
      help: '我的评分减去全站评分；正数表示你打得更高，负数表示更低',
      field: 'scoreDifference',
      personalOnly: true,
    },
    {
      key: 'ratingCount',
      title: '评分人数范围',
      help: '按作品的全站有效评分人数筛选；该条件只过滤作品，不参与综合分加权',
      field: 'ratingCount',
    },
  ],
  [
    {
      key: 'positiveTags',
      title: '正向标签',
      help: '每个正向标签项都必须命中；同一项中用 / 分隔表示满足任一标签',
      field: 'tags',
    },
    {
      key: 'negativeTags',
      title: '反向标签',
      help: '命中任一反向标签项即排除；同一项中用 + 分隔表示同时包含这些标签时才排除',
      field: 'tags',
    },
  ],
];

const advancedFields: readonly QueryField[] = [
  'collectionUpdatedAt',
  'globalScore',
  'mergeSeries',
  'personalScore',
  'ratingCount',
  'scoreDifference',
  'subjectDate',
  'tags',
];
const visibleAdvancedOptionGroups = computed(() =>
  advancedOptionGroups
    .map((group) =>
      group.filter((option) => {
        if (option.key === 'mergeSeries') {
          return props.mergeSeriesAvailable;
        }
        return !(option.personalOnly && props.draft.scope === 'global');
      }),
    )
    .filter((group) => group.length),
);
const collectionOptions = computed(() => {
  const labels: Record<SubjectType, [string, string]> = {
    anime: ['看过', '在看'],
    book: ['读过', '在读'],
    game: ['玩过', '在玩'],
    music: ['听过', '在听'],
    real: ['看过', '在看'],
  };
  const [completed, inProgress] = labels[props.draft.subjectType];
  return [
    { label: completed, value: 'completed' },
    { label: inProgress, value: 'in_progress' },
    { label: '搁置', value: 'on_hold' },
    { label: '抛弃', value: 'dropped' },
  ] as const;
});
const subjectOptions = computed(() =>
  props.subjectTypes.map((subject) => ({
    label: subject.label,
    value: subject.key,
  })),
);
const visiblePositions = computed(() =>
  props.positions.filter(
    (position) =>
      position.subjectType === props.draft.subjectType &&
      position.selectable &&
      position.capabilities.includes(
        props.mode === 'ranking' ? 'rankings' : 'candidates',
      ),
  ),
);
const visibleGroups = computed(() =>
  props.groups.filter(
    (group) => group.subjectType === props.draft.subjectType,
  ),
);
const positionStageTitle = computed(() =>
  props.mode === 'ranking' ? '排行职位' : '参与职位',
);
const positionStageHelp = computed(() =>
  props.mode === 'ranking'
    ? '仅统计同时具备全部已选职位的人物；参与作品按已选职位合并并去重'
    : '每个职位分别生成候选人物；第一项作为默认浏览职位',
);
const submitLabel = computed(() =>
  props.disabled
    ? '查询中…'
    : props.hasAppliedQuery
      ? '应用并查询'
      : '开始查询',
);

const numericRangeConfigs: Record<
  NumericOptionKey,
  {
    inputmode: 'decimal' | 'numeric';
    max?: number;
    maxLabel: string;
    maxPlaceholder: string;
    min: number;
    minLabel: string;
    minPlaceholder: string;
    step: number;
  }
> = {
  globalRate: {
    min: 0,
    max: 10,
    step: 0.5,
    minLabel: '全站评分下限',
    maxLabel: '全站评分上限',
    minPlaceholder: '最低分',
    maxPlaceholder: '最高分',
    inputmode: 'decimal',
  },
  ratingCount: {
    min: 0,
    step: 100,
    minLabel: '评分人数下限',
    maxLabel: '评分人数上限',
    minPlaceholder: '最少人数',
    maxPlaceholder: '最多人数',
    inputmode: 'numeric',
  },
  scoreDifference: {
    min: -10,
    max: 10,
    step: 0.5,
    minLabel: '我的评分与全站评分差下限',
    maxLabel: '我的评分与全站评分差上限',
    minPlaceholder: '最低差值',
    maxPlaceholder: '最高差值',
    inputmode: 'decimal',
  },
  userRate: {
    min: 0,
    max: 10,
    step: 0.5,
    minLabel: '我的评分下限',
    maxLabel: '我的评分上限',
    minPlaceholder: '最低分',
    maxPlaceholder: '最高分',
    inputmode: 'decimal',
  },
};

function error(field: QueryField): string | undefined {
  return props.errors[field];
}

function errorId(field: QueryField): string {
  return `query-error-${field.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
}

function optionTitle(option: AdvancedOption): string {
  return option.key === 'globalRate' && props.draft.scope === 'global'
    ? '评分范围'
    : option.title;
}

function optionEnabled(key: AdvancedOptionKey): boolean {
  switch (key) {
    case 'showNSFW':
      return props.draft.includeNSFW;
    case 'mergeSeries':
      return props.draft.mergeSeries;
    case 'subjectDate':
      return props.draft.subjectDate.enabled;
    case 'collectionDate':
      return props.draft.collectionUpdatedAt.enabled;
    case 'userRate':
      return props.draft.personalScore.enabled;
    case 'globalRate':
      return props.draft.globalScore.enabled;
    case 'scoreDifference':
      return props.draft.scoreDifference.enabled;
    case 'ratingCount':
      return props.draft.ratingCount.enabled;
    case 'positiveTags':
      return props.draft.positiveTags.enabled;
    case 'negativeTags':
      return props.draft.negativeTags.enabled;
  }
}

function setOptionEnabled(key: AdvancedOptionKey, enabled: boolean): void {
  switch (key) {
    case 'showNSFW':
      props.draft.includeNSFW = enabled;
      break;
    case 'mergeSeries':
      props.draft.mergeSeries = enabled;
      break;
    case 'subjectDate':
      props.draft.subjectDate.enabled = enabled;
      break;
    case 'collectionDate':
      props.draft.collectionUpdatedAt.enabled = enabled;
      break;
    case 'userRate':
      props.draft.personalScore.enabled = enabled;
      break;
    case 'globalRate':
      props.draft.globalScore.enabled = enabled;
      break;
    case 'scoreDifference':
      props.draft.scoreDifference.enabled = enabled;
      break;
    case 'ratingCount':
      props.draft.ratingCount.enabled = enabled;
      break;
    case 'positiveTags':
      props.draft.positiveTags.enabled = enabled;
      break;
    case 'negativeTags':
      props.draft.negativeTags.enabled = enabled;
      break;
  }
}

function optionHasControl(
  key: AdvancedOptionKey,
): key is RangeOptionKey | TagOptionKey {
  return key !== 'showNSFW' && key !== 'mergeSeries';
}

function isNumericOption(key: AdvancedOptionKey): key is NumericOptionKey {
  return (
    key === 'userRate' ||
    key === 'globalRate' ||
    key === 'scoreDifference' ||
    key === 'ratingCount'
  );
}

function rangeFor(key: RangeOptionKey): DraftRange {
  switch (key) {
    case 'subjectDate':
      return props.draft.subjectDate;
    case 'collectionDate':
      return props.draft.collectionUpdatedAt;
    case 'userRate':
      return props.draft.personalScore;
    case 'globalRate':
      return props.draft.globalScore;
    case 'scoreDifference':
      return props.draft.scoreDifference;
    case 'ratingCount':
      return props.draft.ratingCount;
  }
}

function rangeValue(key: RangeOptionKey): [string, string] {
  const range = rangeFor(key);
  return [range.min, range.max];
}

function updateRange(
  key: RangeOptionKey,
  [minimum, maximum]: [string, string],
): void {
  const range = rangeFor(key);
  range.min = minimum;
  range.max = maximum;
}

function numericRangeConfig(key: NumericOptionKey) {
  if (key !== 'globalRate' || props.draft.scope !== 'global') {
    return numericRangeConfigs[key];
  }
  return {
    ...numericRangeConfigs.globalRate,
    minLabel: '评分下限',
    maxLabel: '评分上限',
  };
}

function optionError(option: AdvancedOption): string | undefined {
  return option.field ? error(option.field) : undefined;
}

function showOptionError(option: AdvancedOption): boolean {
  if (!optionError(option)) {
    return false;
  }
  if (option.field !== 'tags') {
    return true;
  }
  const owner = props.draft.positiveTags.enabled
    ? 'positiveTags'
    : 'negativeTags';
  return option.key === owner;
}

function toggleAdvancedSection(): void {
  visibleHelp.value = null;
  expandedSections.value = expandedSections.value.includes('advanced')
    ? []
    : ['advanced'];
}

function updateSubjectType(value: SubjectType): void {
  props.draft.subjectType = value;
  props.draft.positionKeys = props.draft.positionKeys.filter((key) =>
    props.positions.some(
      (position) =>
        position.key === key &&
        position.subjectType === props.draft.subjectType,
    ),
  );
}

function containQueryWheel(event: WheelEvent): void {
  if (!event.deltaY) {
    return;
  }
  const scrollContainer = event.currentTarget;
  if (!(scrollContainer instanceof HTMLElement)) {
    return;
  }
  const maxScrollTop =
    scrollContainer.scrollHeight - scrollContainer.clientHeight;
  const canScroll =
    event.deltaY < 0
      ? scrollContainer.scrollTop > 0
      : scrollContainer.scrollTop < maxScrollTop - 1;
  if (!canScroll) {
    event.preventDefault();
  }
  event.stopPropagation();
}

async function focusFirstInvalidField(): Promise<void> {
  const fieldOrder: readonly QueryField[] = [
    'uid',
    'subjectType',
    'collectionStatuses',
    'mergeSeries',
    'subjectDate',
    'collectionUpdatedAt',
    'personalScore',
    'globalScore',
    'scoreDifference',
    'ratingCount',
    'tags',
    'positionKeys',
  ];
  const field = fieldOrder.find((candidate) => Boolean(error(candidate)));
  if (!field) {
    return;
  }
  if (
    advancedFields.includes(field) &&
    !expandedSections.value.includes('advanced')
  ) {
    expandedSections.value = ['advanced'];
    await nextTick();
  }
  switch (field) {
    case 'uid':
      userInput.value?.focus();
      return;
    case 'subjectType':
      subjectTypeInput.value?.focus();
      return;
    case 'collectionStatuses':
      collectionField.value
        ?.querySelector<HTMLElement>(
          ':is([role="checkbox"], input[type="checkbox"])',
        )
        ?.focus();
      return;
    case 'positionKeys':
      positionInput.value?.focus();
      return;
    case 'subjectDate':
      editorForm.value
        ?.querySelector<HTMLElement>(
          '.query-date-range[data-condition-key="播出时间"] input',
        )
        ?.focus();
      return;
    case 'collectionUpdatedAt':
      editorForm.value
        ?.querySelector<HTMLElement>(
          '.query-date-range[data-condition-key="收藏时间"] input',
        )
        ?.focus();
      return;
    case 'mergeSeries':
      editorForm.value
        ?.querySelector<HTMLElement>(
          '[role="switch"][aria-label="合并续作"]',
        )
        ?.focus();
      return;
    case 'personalScore':
      editorForm.value
        ?.querySelector<HTMLElement>('[name="userRateMin"]')
        ?.focus();
      return;
    case 'globalScore':
      editorForm.value
        ?.querySelector<HTMLElement>('[name="globalRateMin"]')
        ?.focus();
      return;
    case 'scoreDifference':
      editorForm.value
        ?.querySelector<HTMLElement>('[name="scoreDifferenceMin"]')
        ?.focus();
      return;
    case 'ratingCount':
      editorForm.value
        ?.querySelector<HTMLElement>('[name="ratingCountMin"]')
        ?.focus();
      return;
    case 'tags': {
      const tagLabel = props.draft.positiveTags.enabled
        ? '正向标签'
        : '反向标签';
      editorForm.value
        ?.querySelector<HTMLElement>(
          `[role="switch"][aria-label="${tagLabel}"]`,
        )
        ?.focus();
      return;
    }
  }
}

watch(
  () => props.errors,
  (errors) => {
    if (advancedFields.some((field) => Boolean(errors[field]))) {
      expandedSections.value = ['advanced'];
    }
  },
  { deep: true },
);

defineExpose({ focusFirstInvalidField });
</script>

<template>
  <form
    ref="editorForm"
    id="query-editor"
    class="query-editor"
    novalidate
    aria-labelledby="query-editor-title"
    @submit.prevent="emit('submit')"
    @keydown.esc.stop.prevent="emit('close')"
  >
    <div class="query-editor__scroll" @wheel="containQueryWheel">
      <div class="query-editor__stages">
        <section
          class="query-stage query-stage--scope"
          aria-labelledby="query-scope-title"
        >
          <header class="query-stage__heading">
            <span class="query-stage-index" aria-hidden="true">1</span>
            <div>
              <h2 id="query-scope-title">作品范围</h2>
            </div>
          </header>

          <div class="query-scope-fields">
            <fieldset class="field query-source-field">
              <legend>数据来源</legend>
              <n-radio-group
                v-model:value="draft.scope"
                class="query-source-switch"
                name="queryDataSource"
                :size="controlSize"
                :theme-overrides="queryRadioThemeOverrides"
                :disabled="disabled"
              >
                <n-radio-button
                  class="query-source-option"
                  value="personal"
                  aria-label="从个人收藏中查询"
                >
                  <span class="query-source-option__label">个人收藏</span>
                </n-radio-button>
                <n-radio-button
                  class="query-source-option"
                  value="global"
                  aria-label="从全站数据中查询"
                >
                  <span class="query-source-option__label">全站数据</span>
                </n-radio-button>
              </n-radio-group>
            </fieldset>

            <div
              v-if="draft.scope === 'personal'"
              class="field field--uid"
              :class="{ 'is-error': Boolean(error('uid')) }"
            >
              <div class="field-label-row">
                <label for="query-user-id">用户 UID</label>
                <n-tooltip
                  :show="uidHelpVisible"
                  placement="top-end"
                  trigger="manual"
                  :animated="false"
                  style="max-width: min(336px, calc(100dvw - 72px));"
                  content-class="workbench-tooltip-content"
                >
                  <template #trigger>
                    <button
                      class="field-help-trigger"
                      type="button"
                      :aria-expanded="uidHelpVisible"
                      aria-label="什么是 UID？进入 Bangumi 个人主页，取网址 /user/ 后的一段"
                      @mouseenter="uidHelpVisible = true"
                      @mouseleave="uidHelpVisible = false"
                      @focus="uidHelpVisible = true"
                      @blur="uidHelpVisible = false"
                      @click.stop="uidHelpVisible = true"
                      @keydown.esc.stop.prevent="uidHelpVisible = false"
                    >
                      <query-icon name="info" :size="16" />
                    </button>
                  </template>
                  进入 Bangumi 个人主页，取网址 /user/
                  后的一段；例如 bgm.tv/user/lucay126 的 UID 是 lucay126
                </n-tooltip>
              </div>
              <n-input
                ref="userInput"
                v-model:value="draft.uid"
                :size="controlSize"
                :theme-overrides="queryInputThemeOverrides"
                placeholder="不是昵称"
                autocomplete="off"
                :clearable="Boolean(draft.uid)"
                :disabled="disabled"
                :status="error('uid') ? 'error' : undefined"
                :input-props="{
                  id: 'query-user-id',
                  name: 'userId',
                  spellcheck: 'false',
                  'aria-invalid': Boolean(error('uid')),
                  'aria-describedby': error('uid')
                    ? `query-user-id-help ${errorId('uid')}`
                    : 'query-user-id-help',
                }"
              />
              <small id="query-user-id-help" class="sr-only">
                UID 是 Bangumi 个人主页地址中 /user/ 后的标识，不是昵称
              </small>
              <small
                v-if="error('uid')"
                :id="errorId('uid')"
                class="query-field-error"
              >
                {{ error('uid') }}
              </small>
            </div>

            <label
              class="field"
              :class="{ 'is-error': Boolean(error('subjectType')) }"
            >
              <span>条目类型</span>
              <n-select
                ref="subjectTypeInput"
                :value="draft.subjectType"
                :options="subjectOptions"
                :size="controlSize"
                :menu-size="controlSize"
                :theme-overrides="querySelectThemeOverrides"
                :status="error('subjectType') ? 'error' : undefined"
                :disabled="disabled"
                :input-props="{
                  name: 'subjectType',
                  'aria-invalid': Boolean(error('subjectType')),
                  'aria-describedby': error('subjectType')
                    ? errorId('subjectType')
                    : undefined,
                }"
                @update:value="updateSubjectType"
              />
              <small
                v-if="error('subjectType')"
                :id="errorId('subjectType')"
                class="query-field-error"
              >
                {{ error('subjectType') }}
              </small>
            </label>

            <fieldset
              v-if="draft.scope === 'personal'"
              ref="collectionField"
              class="field field--collections"
              :class="{ 'is-error': Boolean(error('collectionStatuses')) }"
              :disabled="disabled"
              :aria-invalid="Boolean(error('collectionStatuses'))"
              :aria-describedby="
                error('collectionStatuses')
                  ? errorId('collectionStatuses')
                  : undefined
              "
              :data-query-invalid="
                error('collectionStatuses') ? 'true' : undefined
              "
              tabindex="-1"
            >
              <legend>收藏类型</legend>
              <div class="query-collection-control">
                <n-checkbox-group v-model:value="draft.collectionStatuses">
                  <n-space :size="12" wrap>
                    <n-checkbox
                      v-for="option in collectionOptions"
                      :key="option.value"
                      :size="controlSize"
                      :value="option.value"
                      :label="option.label"
                    />
                  </n-space>
                </n-checkbox-group>
              </div>
              <small
                v-if="error('collectionStatuses')"
                :id="errorId('collectionStatuses')"
                class="query-field-error"
              >
                {{ error('collectionStatuses') }}
              </small>
            </fieldset>
          </div>

          <n-collapse
            v-model:expanded-names="expandedSections"
            class="query-advanced-collapse"
            arrow-placement="right"
          >
            <n-collapse-item
              name="advanced"
              title="更多选项"
              :disabled="disabled"
            >
              <template #header="{ collapsed }">
                <button
                  class="query-advanced-collapse__trigger"
                  type="button"
                  :disabled="disabled"
                  :aria-expanded="!collapsed"
                  aria-controls="query-advanced-options"
                  @click.stop="toggleAdvancedSection"
                  @keydown.enter.prevent.stop="toggleAdvancedSection"
                  @keydown.space.prevent.stop="toggleAdvancedSection"
                >
                  更多选项
                </button>
              </template>
              <div
                id="query-advanced-options"
                class="query-advanced-options"
                aria-label="更多查询选项"
              >
                <div
                  v-for="(group, groupIndex) in visibleAdvancedOptionGroups"
                  :key="groupIndex"
                  class="query-advanced-group"
                >
                  <div
                    v-for="option in group"
                    :key="option.key"
                    class="query-advanced-item"
                    :class="{
                      'has-control':
                        optionHasControl(option.key) &&
                        optionEnabled(option.key),
                    }"
                  >
                    <div class="query-advanced-option">
                      <div class="query-option-title">
                        <strong>{{ optionTitle(option) }}</strong>
                        <n-tooltip
                          v-if="option.help"
                          :show="visibleHelp === option.key"
                          placement="top"
                          trigger="manual"
                          :animated="false"
                          style="max-width: min(336px, calc(100dvw - 72px));"
                          content-class="workbench-tooltip-content"
                        >
                          <template #trigger>
                            <button
                              class="query-option-help"
                              type="button"
                              :aria-expanded="visibleHelp === option.key"
                              :aria-label="`${optionTitle(option)}说明：${option.help}`"
                              @mouseenter="visibleHelp = option.key"
                              @mouseleave="visibleHelp = null"
                              @focus="visibleHelp = option.key"
                              @blur="visibleHelp = null"
                              @click.stop="visibleHelp = option.key"
                              @keydown.esc.stop.prevent="visibleHelp = null"
                            >
                              <query-icon name="info" :size="16" />
                            </button>
                          </template>
                          {{ option.help }}
                        </n-tooltip>
                      </div>
                      <span class="query-advanced-switch">
                        <n-switch
                          :size="controlSize"
                          :value="optionEnabled(option.key)"
                          :aria-label="optionTitle(option)"
                          :disabled="disabled"
                          @update:value="
                            setOptionEnabled(option.key, $event)
                          "
                        />
                      </span>
                    </div>

                    <fieldset
                      v-if="
                        optionHasControl(option.key) &&
                        optionEnabled(option.key)
                      "
                      class="field query-advanced-control"
                      :class="{
                        'is-error': Boolean(optionError(option)),
                      }"
                      :disabled="disabled"
                      :aria-invalid="Boolean(optionError(option))"
                      :aria-describedby="
                        optionError(option) && option.field
                          ? errorId(option.field)
                          : undefined
                      "
                      :data-query-invalid="
                        optionError(option) ? 'true' : undefined
                      "
                      tabindex="-1"
                    >
                      <legend class="sr-only">{{ optionTitle(option) }}</legend>
                      <query-date-range
                        v-if="option.key === 'subjectDate'"
                        :model-value="rangeValue('subjectDate')"
                        condition-key="播出时间"
                        start-label="播出时间起点"
                        end-label="播出时间终点"
                        :control-size="controlSize"
                        :status="optionError(option) ? 'error' : undefined"
                        :disabled="disabled"
                        @update:model-value="
                          updateRange('subjectDate', $event)
                        "
                      />
                      <query-date-range
                        v-else-if="option.key === 'collectionDate'"
                        :model-value="rangeValue('collectionDate')"
                        condition-key="收藏时间"
                        start-label="收藏时间起点"
                        end-label="收藏时间终点"
                        :control-size="controlSize"
                        :status="optionError(option) ? 'error' : undefined"
                        :disabled="disabled"
                        @update:model-value="
                          updateRange('collectionDate', $event)
                        "
                      />
                      <query-numeric-range
                        v-else-if="isNumericOption(option.key)"
                        :model-value="rangeValue(option.key)"
                        :condition-key="option.key"
                        :control-size="controlSize"
                        :error-id="
                          option.field
                            ? errorId(option.field)
                            : `query-error-${option.key}`
                        "
                        v-bind="numericRangeConfig(option.key)"
                        :status="optionError(option) ? 'error' : undefined"
                        :disabled="disabled"
                        @update:model-value="
                          updateRange(option.key, $event)
                        "
                      />
                      <div
                        v-else-if="option.key === 'positiveTags'"
                        class="query-tag-control-row"
                      >
                        <n-dynamic-tags
                          v-model:value="draft.positiveTags.values"
                          class="query-tags"
                          :size="controlSize"
                          :disabled="disabled"
                          :input-props="{
                            size: controlSize,
                            themeOverrides: queryInputThemeOverrides,
                            placeholder: '输入标签后回车',
                            inputProps: {
                              'aria-label': '新增正向标签',
                            },
                          }"
                          :input-style="{ minWidth: '160px' }"
                          aria-label="正向标签"
                          type="primary"
                        >
                          <template #trigger="{ activate, disabled: tagDisabled }">
                            <span
                              class="query-tag-trigger-hit"
                              @click="!tagDisabled && activate()"
                            >
                              <n-button
                                :size="compact ? 'tiny' : 'small'"
                                type="primary"
                                secondary
                                attr-type="button"
                                :disabled="tagDisabled"
                                aria-label="添加正向标签"
                                @click.stop="activate"
                              >
                                <template #icon>
                                  <query-icon name="plus" :size="16" />
                                </template>
                                添加标签
                              </n-button>
                            </span>
                          </template>
                        </n-dynamic-tags>
                      </div>
                      <div v-else class="query-tag-control-row">
                        <n-dynamic-tags
                          v-model:value="draft.negativeTags.values"
                          class="query-tags"
                          :size="controlSize"
                          :disabled="disabled"
                          :input-props="{
                            size: controlSize,
                            themeOverrides: queryInputThemeOverrides,
                            placeholder: '输入标签后回车',
                            inputProps: {
                              'aria-label': '新增反向标签',
                            },
                          }"
                          :input-style="{ minWidth: '160px' }"
                          aria-label="反向标签"
                          type="primary"
                        >
                          <template #trigger="{ activate, disabled: tagDisabled }">
                            <span
                              class="query-tag-trigger-hit"
                              @click="!tagDisabled && activate()"
                            >
                              <n-button
                                :size="compact ? 'tiny' : 'small'"
                                type="primary"
                                secondary
                                attr-type="button"
                                :disabled="tagDisabled"
                                aria-label="添加反向标签"
                                @click.stop="activate"
                              >
                                <template #icon>
                                  <query-icon name="plus" :size="16" />
                                </template>
                                添加标签
                              </n-button>
                            </span>
                          </template>
                        </n-dynamic-tags>
                      </div>
                      <small
                        v-if="
                          showOptionError(option) &&
                          option.field
                        "
                        :id="errorId(option.field)"
                        class="query-field-error"
                      >
                        {{ optionError(option) }}
                      </small>
                    </fieldset>
                    <small
                      v-else-if="
                        showOptionError(option) &&
                        option.field
                      "
                      :id="errorId(option.field)"
                      class="query-field-error"
                    >
                      {{ optionError(option) }}
                    </small>
                  </div>
                </div>
              </div>
            </n-collapse-item>
          </n-collapse>
        </section>

        <section
          class="query-stage query-stage--positions"
          aria-labelledby="query-position-title"
        >
          <header class="query-stage__heading">
            <span class="query-stage-index" aria-hidden="true">2</span>
            <div>
              <div class="query-stage__title-row">
                <h2 id="query-position-title">{{ positionStageTitle }}</h2>
                <n-tooltip
                  :show="visibleHelp === 'positions'"
                  placement="top"
                  trigger="manual"
                  :animated="false"
                  style="max-width: min(336px, calc(100dvw - 72px));"
                  content-class="workbench-tooltip-content"
                >
                  <template #trigger>
                    <button
                      class="query-option-help"
                      type="button"
                      :aria-expanded="visibleHelp === 'positions'"
                      :aria-label="`${positionStageTitle}说明：${positionStageHelp}`"
                      @mouseenter="visibleHelp = 'positions'"
                      @mouseleave="visibleHelp = null"
                      @focus="visibleHelp = 'positions'"
                      @blur="visibleHelp = null"
                      @click.stop="visibleHelp = 'positions'"
                      @keydown.esc.stop.prevent="visibleHelp = null"
                    >
                      <query-icon name="info" :size="16" />
                    </button>
                  </template>
                  {{ positionStageHelp }}
                </n-tooltip>
              </div>
            </div>
          </header>
          <div
            class="field field--positions"
            :class="{ 'is-error': Boolean(error('positionKeys')) }"
          >
            <span id="query-position-control-label" class="query-position-hint">
              {{
                mode === 'ranking'
                  ? '可多选；仅保留同时具备全部所选职位的人物'
                  : '可多选；选择参与共演分析的职位'
              }}
            </span>
            <position-selector
              ref="positionInput"
              v-model="draft.positionKeys"
              :control-size="controlSize"
              :disabled="disabled"
              :error="error('positionKeys')"
              :groups="visibleGroups"
              :phase="catalogPhase"
              :positions="visiblePositions"
              :placeholder="
                mode === 'ranking' ? '选择排行职位' : '选择参与职位'
              "
              @retry="emit('retryCatalog')"
            />
          </div>
        </section>
      </div>

      <p v-if="statusMessage" class="query-request-feedback" role="alert">
        {{ statusMessage }}
      </p>

      <footer class="query-editor__footer">
        <span class="query-editor__status" role="status" aria-live="polite">
          {{ disabled ? '查询中' : '' }}
        </span>
        <n-space class="query-editor__actions" :size="8" justify="end" wrap>
          <n-button
            :size="controlSize"
            attr-type="button"
            :disabled="!dirty || disabled"
            @click="emit('restore')"
          >
            撤销更改
          </n-button>
          <n-button
            :size="controlSize"
            attr-type="button"
            :disabled="!disabled"
            @click="emit('cancel')"
          >
            取消查询
          </n-button>
            <n-button
              v-if="draft.scope === 'personal'"
              :size="controlSize"
              attr-type="button"
            secondary
            :disabled="disabled"
            @click="emit('refresh')"
          >
            刷新收藏并查询
          </n-button>
          <n-button
            :size="controlSize"
            type="primary"
            attr-type="submit"
            :loading="disabled"
            :disabled="disabled"
          >
            {{ submitLabel }}
          </n-button>
        </n-space>
      </footer>
    </div>
  </form>
</template>
