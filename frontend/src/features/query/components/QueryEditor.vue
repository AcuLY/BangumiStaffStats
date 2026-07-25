<script setup lang="ts">
import {
  NButton,
  NCheckbox,
  NCheckboxGroup,
  NInput,
  NRadioButton,
  NRadioGroup,
  NSpace,
  NSwitch,
} from 'naive-ui';
import { computed, ref, watch } from 'vue';

import type {
  CatalogGroup,
  CatalogPosition,
  CatalogSubjectType,
  SubjectType,
} from '../../../api/adapters/catalog';
import type { CatalogPhase } from '../../catalog/store';
import type {
  QueryDraft,
  QueryField,
  QueryFieldErrors,
  QueryMode,
} from '../model';
import PositionSelector from './PositionSelector.vue';

const props = defineProps<{
  catalogPhase: CatalogPhase;
  disabled?: boolean;
  draft: QueryDraft;
  errors: QueryFieldErrors;
  groups: readonly CatalogGroup[];
  mergeSeriesAvailable: boolean;
  mode: QueryMode;
  positions: readonly CatalogPosition[];
  statusMessage?: string | null;
  subjectTypes: readonly CatalogSubjectType[];
  targetWindow: Window;
}>();

const emit = defineEmits<{
  cancel: [];
  close: [];
  refresh: [];
  retryCatalog: [];
  restore: [];
  submit: [];
}>();

const advancedOpen = ref(false);
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

function error(field: QueryField): string | undefined {
  return props.errors[field];
}

function updateSubjectType(value: string): void {
  if (!['book', 'anime', 'music', 'game', 'real'].includes(value)) {
    return;
  }
  props.draft.subjectType = value as SubjectType;
  props.draft.positionKeys = props.draft.positionKeys.filter((key) =>
    props.positions.some(
      (position) =>
        position.key === key && position.subjectType === props.draft.subjectType,
    ),
  );
}

watch(
  () => props.errors,
  (errors) => {
    if (advancedFields.some((field) => Boolean(errors[field]))) {
      advancedOpen.value = true;
    }
  },
  { deep: true },
);

</script>

<template>
  <form
    id="query-editor"
    class="query-editor"
    novalidate
    aria-labelledby="query-editor-title"
    @submit.prevent="emit('submit')"
    @keydown.esc.stop.prevent="emit('close')"
  >
    <div class="query-editor__scroll">
      <div class="query-editor__stages">
        <section class="query-stage query-stage--scope" aria-labelledby="query-scope-title">
          <header class="query-stage__heading">
            <span class="query-stage-index" aria-hidden="true">1</span>
            <h2 id="query-scope-title">作品范围</h2>
          </header>

          <div class="query-scope-fields">
            <fieldset class="query-field query-source-field">
              <legend>数据来源</legend>
              <n-radio-group
                v-model:value="draft.scope"
                class="query-source-switch"
                name="queryDataSource"
                :disabled="disabled"
              >
                <n-radio-button value="personal">个人收藏</n-radio-button>
                <n-radio-button value="global">全站数据</n-radio-button>
              </n-radio-group>
            </fieldset>

            <label v-if="draft.scope === 'personal'" class="query-field">
              <span>用户 UID</span>
              <n-input
                v-model:value="draft.uid"
                placeholder="不是昵称"
                autocomplete="off"
                clearable
                :disabled="disabled"
                :status="error('uid') ? 'error' : undefined"
                :input-props="{
                  name: 'userId',
                  spellcheck: 'false',
                  'aria-invalid': Boolean(error('uid')),
                  'aria-describedby': error('uid') ? 'query-error-uid' : undefined,
                }"
              />
              <small
                v-if="error('uid')"
                id="query-error-uid"
                class="query-field-error"
              >
                {{ error('uid') }}
              </small>
            </label>

            <label class="query-field">
              <span>条目类型</span>
              <select
                class="query-native-select"
                name="subjectType"
                :value="draft.subjectType"
                :disabled="disabled"
                :aria-invalid="Boolean(error('subjectType'))"
                :aria-describedby="
                  error('subjectType') ? 'query-error-subject-type' : undefined
                "
                :data-query-invalid="error('subjectType') ? 'true' : undefined"
                :data-query-primary-field="
                  draft.scope === 'global' ? '' : undefined
                "
                @change="updateSubjectType(($event.target as HTMLSelectElement).value)"
              >
                <option
                  v-for="subject in subjectTypes"
                  :key="subject.key"
                  :value="subject.key"
                >
                  {{ subject.label }}
                </option>
              </select>
              <small
                v-if="error('subjectType')"
                id="query-error-subject-type"
                class="query-field-error"
              >
                {{ error('subjectType') }}
              </small>
            </label>

            <fieldset
              v-if="draft.scope === 'personal'"
              class="query-field query-collections"
              :disabled="disabled"
              :aria-invalid="Boolean(error('collectionStatuses'))"
              :aria-describedby="
                error('collectionStatuses')
                  ? 'query-error-collection-statuses'
                  : undefined
              "
              :data-query-invalid="
                error('collectionStatuses') ? 'true' : undefined
              "
              tabindex="-1"
            >
              <legend>收藏类型</legend>
              <n-checkbox-group v-model:value="draft.collectionStatuses">
                <n-space :size="12" wrap>
                  <n-checkbox
                    v-for="option in collectionOptions"
                    :key="option.value"
                    :value="option.value"
                    :label="option.label"
                  />
                </n-space>
              </n-checkbox-group>
              <small
                v-if="error('collectionStatuses')"
                id="query-error-collection-statuses"
                class="query-field-error"
              >
                {{ error('collectionStatuses') }}
              </small>
            </fieldset>
          </div>

          <section class="query-advanced">
            <button
              class="query-advanced__trigger"
              type="button"
              :aria-expanded="advancedOpen"
              aria-controls="query-advanced-panel"
              :disabled="disabled"
              @click="advancedOpen = !advancedOpen"
            >
              <span>更多选项</span>
              <span aria-hidden="true">{{ advancedOpen ? '−' : '+' }}</span>
            </button>
            <div
              v-if="advancedOpen"
              id="query-advanced-panel"
              class="query-advanced-grid"
            >
                <label class="query-option-toggle">
                  <span>显示 NSFW 条目</span>
                  <n-switch v-model:value="draft.includeNSFW" :disabled="disabled" />
                </label>
                <label
                  v-if="mergeSeriesAvailable"
                  class="query-option-toggle"
                  :aria-invalid="Boolean(error('mergeSeries'))"
                  :aria-describedby="
                    error('mergeSeries') ? 'query-error-merge-series' : undefined
                  "
                  :data-query-invalid="
                    error('mergeSeries') ? 'true' : undefined
                  "
                  tabindex="-1"
                >
                  <span>合并续作</span>
                  <n-switch v-model:value="draft.mergeSeries" :disabled="disabled" />
                  <small
                    v-if="error('mergeSeries')"
                    id="query-error-merge-series"
                    class="query-field-error"
                  >
                    {{ error('mergeSeries') }}
                  </small>
                </label>

                <fieldset
                  class="query-option"
                  :aria-invalid="Boolean(error('subjectDate'))"
                  :aria-describedby="
                    error('subjectDate') ? 'query-error-subject-date' : undefined
                  "
                  :data-query-invalid="
                    error('subjectDate') ? 'true' : undefined
                  "
                  tabindex="-1"
                >
                  <label class="query-option-toggle">
                    <span>播出时间范围</span>
                    <n-switch v-model:value="draft.subjectDate.enabled" :disabled="disabled" />
                  </label>
                  <div v-if="draft.subjectDate.enabled" class="query-range">
                    <input
                      v-model="draft.subjectDate.min"
                      type="month"
                      aria-label="播出时间起点"
                      :disabled="disabled"
                    />
                    <span aria-hidden="true">至</span>
                    <input
                      v-model="draft.subjectDate.max"
                      type="month"
                      aria-label="播出时间终点"
                      :disabled="disabled"
                    />
                  </div>
                  <small
                    v-if="error('subjectDate')"
                    id="query-error-subject-date"
                    class="query-field-error"
                  >
                    {{ error('subjectDate') }}
                  </small>
                </fieldset>

                <fieldset
                  v-if="draft.scope === 'personal'"
                  class="query-option"
                  :aria-invalid="Boolean(error('collectionUpdatedAt'))"
                  :aria-describedby="
                    error('collectionUpdatedAt')
                      ? 'query-error-collection-updated-at'
                      : undefined
                  "
                  :data-query-invalid="
                    error('collectionUpdatedAt') ? 'true' : undefined
                  "
                  tabindex="-1"
                >
                  <label class="query-option-toggle">
                    <span>收藏时间范围</span>
                    <n-switch
                      v-model:value="draft.collectionUpdatedAt.enabled"
                      :disabled="disabled"
                    />
                  </label>
                  <div v-if="draft.collectionUpdatedAt.enabled" class="query-range">
                    <input
                      v-model="draft.collectionUpdatedAt.min"
                      type="month"
                      aria-label="收藏时间起点"
                      :disabled="disabled"
                    />
                    <span aria-hidden="true">至</span>
                    <input
                      v-model="draft.collectionUpdatedAt.max"
                      type="month"
                      aria-label="收藏时间终点"
                      :disabled="disabled"
                    />
                  </div>
                  <small
                    v-if="error('collectionUpdatedAt')"
                    id="query-error-collection-updated-at"
                    class="query-field-error"
                  >
                    {{ error('collectionUpdatedAt') }}
                  </small>
                </fieldset>

                <fieldset
                  v-if="draft.scope === 'personal'"
                  class="query-option"
                  :aria-invalid="Boolean(error('personalScore'))"
                  :aria-describedby="
                    error('personalScore')
                      ? 'query-error-personal-score'
                      : undefined
                  "
                  :data-query-invalid="
                    error('personalScore') ? 'true' : undefined
                  "
                  tabindex="-1"
                >
                  <label class="query-option-toggle">
                    <span>我的评分范围</span>
                    <n-switch v-model:value="draft.personalScore.enabled" :disabled="disabled" />
                  </label>
                  <div v-if="draft.personalScore.enabled" class="query-range">
                    <input
                      v-model="draft.personalScore.min"
                      type="number"
                      min="0"
                      max="10"
                      step="0.5"
                      placeholder="最低"
                      aria-label="我的评分下限"
                      :disabled="disabled"
                    />
                    <span aria-hidden="true">至</span>
                    <input
                      v-model="draft.personalScore.max"
                      type="number"
                      min="0"
                      max="10"
                      step="0.5"
                      placeholder="最高"
                      aria-label="我的评分上限"
                      :disabled="disabled"
                    />
                  </div>
                  <small
                    v-if="error('personalScore')"
                    id="query-error-personal-score"
                    class="query-field-error"
                  >
                    {{ error('personalScore') }}
                  </small>
                </fieldset>

                <fieldset
                  class="query-option"
                  :aria-invalid="Boolean(error('globalScore'))"
                  :aria-describedby="
                    error('globalScore') ? 'query-error-global-score' : undefined
                  "
                  :data-query-invalid="
                    error('globalScore') ? 'true' : undefined
                  "
                  tabindex="-1"
                >
                  <label class="query-option-toggle">
                    <span>{{ draft.scope === 'global' ? '评分范围' : '全站评分范围' }}</span>
                    <n-switch v-model:value="draft.globalScore.enabled" :disabled="disabled" />
                  </label>
                  <div v-if="draft.globalScore.enabled" class="query-range">
                    <input
                      v-model="draft.globalScore.min"
                      type="number"
                      min="0"
                      max="10"
                      step="0.5"
                      placeholder="最低"
                      aria-label="全站评分下限"
                      :disabled="disabled"
                    />
                    <span aria-hidden="true">至</span>
                    <input
                      v-model="draft.globalScore.max"
                      type="number"
                      min="0"
                      max="10"
                      step="0.5"
                      placeholder="最高"
                      aria-label="全站评分上限"
                      :disabled="disabled"
                    />
                  </div>
                  <small
                    v-if="error('globalScore')"
                    id="query-error-global-score"
                    class="query-field-error"
                  >
                    {{ error('globalScore') }}
                  </small>
                </fieldset>

                <fieldset
                  v-if="draft.scope === 'personal'"
                  class="query-option"
                  :aria-invalid="Boolean(error('scoreDifference'))"
                  :aria-describedby="
                    error('scoreDifference')
                      ? 'query-error-score-difference'
                      : undefined
                  "
                  :data-query-invalid="
                    error('scoreDifference') ? 'true' : undefined
                  "
                  tabindex="-1"
                >
                  <label class="query-option-toggle">
                    <span>我的评分与全站评分差范围</span>
                    <n-switch
                      v-model:value="draft.scoreDifference.enabled"
                      :disabled="disabled"
                    />
                  </label>
                  <div v-if="draft.scoreDifference.enabled" class="query-range">
                    <input
                      v-model="draft.scoreDifference.min"
                      type="number"
                      min="-10"
                      max="10"
                      step="0.5"
                      placeholder="最低"
                      aria-label="评分差下限"
                      :disabled="disabled"
                    />
                    <span aria-hidden="true">至</span>
                    <input
                      v-model="draft.scoreDifference.max"
                      type="number"
                      min="-10"
                      max="10"
                      step="0.5"
                      placeholder="最高"
                      aria-label="评分差上限"
                      :disabled="disabled"
                    />
                  </div>
                  <small
                    v-if="error('scoreDifference')"
                    id="query-error-score-difference"
                    class="query-field-error"
                  >
                    {{ error('scoreDifference') }}
                  </small>
                </fieldset>

                <fieldset
                  class="query-option"
                  :aria-invalid="Boolean(error('ratingCount'))"
                  :aria-describedby="
                    error('ratingCount') ? 'query-error-rating-count' : undefined
                  "
                  :data-query-invalid="
                    error('ratingCount') ? 'true' : undefined
                  "
                  tabindex="-1"
                >
                  <label class="query-option-toggle">
                    <span>评分人数范围</span>
                    <n-switch v-model:value="draft.ratingCount.enabled" :disabled="disabled" />
                  </label>
                  <div v-if="draft.ratingCount.enabled" class="query-range">
                    <input
                      v-model="draft.ratingCount.min"
                      type="number"
                      min="0"
                      step="1"
                      placeholder="最少"
                      aria-label="评分人数下限"
                      :disabled="disabled"
                    />
                    <span aria-hidden="true">至</span>
                    <input
                      v-model="draft.ratingCount.max"
                      type="number"
                      min="0"
                      step="1"
                      placeholder="最多"
                      aria-label="评分人数上限"
                      :disabled="disabled"
                    />
                  </div>
                  <small
                    v-if="error('ratingCount')"
                    id="query-error-rating-count"
                    class="query-field-error"
                  >
                    {{ error('ratingCount') }}
                  </small>
                </fieldset>

                <fieldset
                  class="query-option"
                  :aria-invalid="Boolean(error('tags'))"
                  :aria-describedby="error('tags') ? 'query-error-tags' : undefined"
                  :data-query-invalid="error('tags') ? 'true' : undefined"
                  tabindex="-1"
                >
                  <label class="query-option-toggle">
                    <span>正向标签</span>
                    <n-switch
                      v-model:value="draft.positiveTags.enabled"
                      :disabled="disabled"
                    />
                  </label>
                  <n-input
                    v-if="draft.positiveTags.enabled"
                    :value="draft.positiveTags.values.join('，')"
                    placeholder="标签之间用逗号分隔"
                    aria-label="正向标签"
                    :input-props="{
                      'aria-invalid': Boolean(error('tags')),
                      'aria-describedby': error('tags')
                        ? 'query-error-tags'
                        : undefined,
                    }"
                    :disabled="disabled"
                    @update:value="draft.positiveTags.values = $event.split(/[，,]/)"
                  />
                </fieldset>

                <fieldset
                  class="query-option"
                  :aria-invalid="Boolean(error('tags'))"
                  :aria-describedby="error('tags') ? 'query-error-tags' : undefined"
                  tabindex="-1"
                >
                  <label class="query-option-toggle">
                    <span>反向标签</span>
                    <n-switch
                      v-model:value="draft.negativeTags.enabled"
                      :disabled="disabled"
                    />
                  </label>
                  <n-input
                    v-if="draft.negativeTags.enabled"
                    :value="draft.negativeTags.values.join('，')"
                    placeholder="标签之间用逗号分隔"
                    aria-label="反向标签"
                    :input-props="{
                      'aria-invalid': Boolean(error('tags')),
                      'aria-describedby': error('tags')
                        ? 'query-error-tags'
                        : undefined,
                    }"
                    :disabled="disabled"
                    @update:value="draft.negativeTags.values = $event.split(/[，,]/)"
                  />
                  <small
                    v-if="error('tags')"
                    id="query-error-tags"
                    class="query-field-error"
                  >
                    {{ error('tags') }}
                  </small>
                </fieldset>
            </div>
          </section>
        </section>

        <section class="query-stage query-stage--positions" aria-labelledby="query-position-title">
          <header class="query-stage__heading">
            <span class="query-stage-index" aria-hidden="true">2</span>
            <div>
              <h2 id="query-position-title">{{ positionStageTitle }}</h2>
              <p>
                {{
                  mode === 'ranking'
                    ? '可多选；仅保留同时具备全部所选职位的人物'
                    : '可多选；选择参与共演分析的职位'
                }}
              </p>
            </div>
          </header>
          <position-selector
            v-model="draft.positionKeys"
            :disabled="disabled"
            :error="error('positionKeys')"
            :groups="visibleGroups"
            :phase="catalogPhase"
            :positions="visiblePositions"
            :subject-type="draft.subjectType"
            :target-window="targetWindow"
            @retry="emit('retryCatalog')"
          />
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
          <n-button attr-type="button" :disabled="disabled" @click="emit('restore')">
            撤销更改
          </n-button>
          <n-button attr-type="button" :disabled="!disabled" @click="emit('cancel')">
            取消查询
          </n-button>
          <n-button
            v-if="draft.scope === 'personal'"
            attr-type="button"
            secondary
            :disabled="disabled"
            @click="emit('refresh')"
          >
            刷新收藏并查询
          </n-button>
          <n-button type="primary" attr-type="submit" :loading="disabled">
            应用并查询
          </n-button>
        </n-space>
      </footer>
    </div>
  </form>
</template>
