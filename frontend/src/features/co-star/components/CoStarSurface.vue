<script setup lang="ts">
import {
  computed,
  onMounted,
  shallowRef,
  watch,
} from 'vue';

import SafeImage from '../../../shared/components/SafeImage.vue';
import { subjectImageCandidates } from '../../../shared/media/bangumiImage';
import {
  formatHundredths,
  formatRational,
} from '../../ranking/format';
import {
  coStarInput,
  coStarInputMatchesSelection,
  defaultCoStarView,
  projectCoStarMatrix,
  type CoStarInput,
  type CoStarMatrixCell,
  type CoStarPersonalData,
  type CoStarPreferenceItem,
  type CoStarResource,
  type CoStarTag,
  type CoStarView,
} from '../coStar';
import type { CoStarSelection } from '../selection';
import CoStarParticipants from './CoStarParticipants.vue';
import CoStarIcon from './CoStarIcon.vue';
import CoStarRatings from './CoStarRatings.vue';
import CoStarWorkBrowser from './CoStarWorkBrowser.vue';

const props = withDefaults(
  defineProps<{
    cancel: () => void;
    devicePixelRatio?: number;
    execute: (
      input: Readonly<CoStarInput>,
      view: Readonly<CoStarView>,
    ) => Promise<boolean>;
    executeView: (view: Readonly<CoStarView>) => Promise<boolean>;
    positionLabel: (positionKey: string) => string;
    resource: CoStarResource;
    scope: 'global' | 'personal';
    selection: CoStarSelection;
    workUnit: 'series' | 'subject';
  }>(),
  {
    devicePixelRatio: 1,
  },
);

const lastAttempt = shallowRef<
  | Readonly<{
      input: Readonly<CoStarInput>;
      kind: 'full';
      view: Readonly<CoStarView>;
    }>
  | Readonly<{
      kind: 'view';
      view: Readonly<CoStarView>;
    }>
  | null
>(null);

const people = computed(() => props.selection.people.value);
const workBrowser =
  shallowRef<InstanceType<typeof CoStarWorkBrowser> | null>(null);
const selectionSignature = computed(() =>
  people.value
    .flatMap((person) => [
      String(person.person.id),
      ...person.identities.map((identity) => identity.positionKey),
    ])
    .join('\u0000'),
);
const view = computed<Readonly<CoStarView>>(() => {
  const fallback = defaultCoStarView(props.scope);
  return Object.freeze({
    order: props.resource.view.order ?? fallback.order,
    page: props.resource.view.page ?? fallback.page,
    pageSize: props.resource.view.pageSize ?? fallback.pageSize,
    search: props.resource.view.search ?? fallback.search,
    sort: props.resource.view.sort ?? fallback.sort,
  });
});
const currentPayload = computed(() => {
  const payload = props.resource.payload;
  if (
    !payload ||
    payload.scope !== props.scope ||
    payload.data.workUnit !== props.workUnit ||
    !coStarInputMatchesSelection(
      {
        participants: payload.data.participants.map((participant) => ({
          personId: participant.person.id,
          positionKeys: participant.positionKeys.map(String),
        })),
      },
      people.value,
    )
  ) {
    return null;
  }
  return payload;
});
const data = computed(() => currentPayload.value?.data ?? null);
const personalData = computed<CoStarPersonalData | null>(() => {
  const value = data.value;
  return value && 'preference' in value
    ? (value as CoStarPersonalData)
    : null;
});
const fullPending = computed(() => props.resource.phase === 'pending');
const matrixRows = computed(() => {
  const value = data.value;
  return value?.kind === 'group' ? projectCoStarMatrix(value) : [];
});
const viewError = computed(() =>
  currentPayload.value &&
  lastAttempt.value?.kind === 'view'
    ? props.resource.error
    : null,
);
const statusMessage = computed(() => {
  if (fullPending.value) {
    return `正在加载 ${people.value.length} 人共演分析`;
  }
  if (props.resource.viewPending) {
    return props.workUnit === 'series'
      ? '正在更新共同系列'
      : '正在更新共同作品';
  }
  return props.resource.error ?? props.resource.feedback ?? '';
});
const tagGroups = computed(() => {
  const value = data.value;
  if (!value) {
    return [];
  }
  return [
    {
      key: 'meta',
      label: '条目属性',
      tags: value.tags.meta,
    },
    {
      key: 'community',
      label: '社区标签',
      tags: value.tags.community,
    },
    ...(personalData.value
      ? [
          {
            key: 'personal',
            label: '收藏标签',
            tags: personalData.value.tags.personal,
          },
        ]
      : []),
  ] as readonly Readonly<{
    key: string;
    label: string;
    tags: readonly CoStarTag[];
  }>[];
});
const tagCount = computed(() =>
  tagGroups.value.reduce((count, group) => count + group.tags.length, 0),
);

function primaryName(entity: {
  readonly name: string;
  readonly nameCN: string | null;
}): string {
  return entity.nameCN ?? entity.name;
}

function signedHundredths(value: number): string {
  if (value === 0) {
    return '0.00';
  }
  return `${value > 0 ? '+' : '−'}${(Math.abs(value) / 100).toFixed(2)}`;
}

function itemName(item: CoStarPreferenceItem): string {
  return primaryName(item.unit);
}

function focusPreferenceItem(item: CoStarPreferenceItem): void {
  void workBrowser.value?.focusUnit(itemName(item));
}

function matrixCellLabel(cell: CoStarMatrixCell): string {
  const rowName = primaryName(cell.row.person);
  if (cell.kind === 'diagonal') {
    return `${rowName}参与 ${
      cell.metrics.workCount
    } ${props.workUnit === 'series' ? '个系列' : '部作品'}，均分 ${formatHundredths(
      cell.metrics.average,
    )}`;
  }
  return `${rowName}与${primaryName(cell.column.person)}共同参与 ${
    cell.metrics.workCount
  } ${props.workUnit === 'series' ? '个系列' : '部作品'}，均分 ${formatHundredths(
    cell.metrics.average,
  )}`;
}

function executeView(nextView: Readonly<CoStarView>): Promise<boolean> {
  lastAttempt.value = Object.freeze({ kind: 'view', view: nextView });
  return props.executeView(nextView);
}

function retry(): void {
  if (lastAttempt.value?.kind === 'view') {
    void props.executeView(lastAttempt.value.view);
    return;
  }
  const input = lastAttempt.value?.input ?? coStarInput(people.value);
  void props.execute(input, lastAttempt.value?.view ?? view.value);
}

function ensureAnalysis(): void {
  if (people.value.length < 2 || people.value.length > 10) {
    return;
  }
  if (
    coStarInputMatchesSelection(props.resource.input, people.value) &&
    (props.resource.phase === 'pending' ||
      props.resource.phase === 'error' ||
      (props.resource.phase === 'ready' && currentPayload.value))
  ) {
    return;
  }
  const input = coStarInput(people.value);
  const nextView = Object.freeze({
    ...view.value,
    page: 1,
    search: '',
  });
  lastAttempt.value = Object.freeze({
    input,
    kind: 'full',
    view: nextView,
  });
  void props.execute(input, nextView);
}

watch(selectionSignature, ensureAnalysis);
onMounted(ensureAnalysis);
</script>

<template>
  <article
    class="analysis-dashboard analysis-dashboard--unified co-star-surface surface-panel"
    aria-label="共演分析"
    :data-analysis-mode="people.length > 2 ? 'group' : 'pair'"
    :aria-busy="fullPending ? 'true' : undefined"
  >
    <p class="sr-only" role="status" aria-live="polite">
      {{ statusMessage }}
    </p>

    <div
      v-if="resource.error && currentPayload && !viewError"
      class="co-star-inline-error co-star-inline-error--top"
      role="alert"
    >
      <span>{{ resource.error }}</span>
      <button type="button" @click="retry">重新加载</button>
    </div>

    <template v-if="currentPayload && data">
      <section
        class="analysis-section relationship-hero selected-people-panel"
        aria-label="已选人物概览"
      >
        <co-star-participants
          :device-pixel-ratio="devicePixelRatio"
          :participants="data.participants"
          :position-label="positionLabel"
          :work-unit="data.workUnit"
        />

        <dl
          class="analysis-profile-summary shared-rating-summary shared-rating-summary--below metric-grid co-star-summary-grid"
          :data-metric-count="personalData ? 8 : 4"
          aria-label="多人组合概览"
        >
          <div class="metric-unit">
            <dd class="metric-unit__value">
              {{ data.summary.unionWorkCount }}
            </dd>
            <dt class="metric-unit__label">
              {{
                data.workUnit === 'series'
                  ? '参与系列并集'
                  : '参与作品并集'
              }}
            </dt>
          </div>
          <div class="metric-unit">
            <dd class="metric-unit__value">
              {{ data.summary.commonWorkCount }}
            </dd>
            <dt class="metric-unit__label">
              {{ data.workUnit === 'series' ? '共同系列' : '共同作品' }}
            </dt>
          </div>
          <div class="metric-unit">
            <dd class="metric-unit__value">
              {{ data.summary.ratedWorkCount }}
            </dd>
            <dt class="metric-unit__label">
              {{ data.workUnit === 'series' ? '已评系列' : '已评作品' }}
            </dt>
          </div>
          <div
            class="metric-unit"
            :class="{
              'analysis-profile-summary__metric--primary':
                Boolean(personalData),
            }"
          >
            <dd class="metric-unit__value">
              {{ formatHundredths(data.summary.average) }}
            </dd>
            <dt class="metric-unit__label">
              {{ personalData ? '我的均分' : '均分' }}
            </dt>
          </div>
          <template v-if="personalData">
            <div class="metric-unit">
              <dd class="metric-unit__value">
                {{ personalData.summary.globalRatedWorkCount }}
              </dd>
              <dt class="metric-unit__label">全站已评分</dt>
            </div>
            <div class="metric-unit">
              <dd class="metric-unit__value">
                {{ formatHundredths(personalData.summary.globalAverage) }}
              </dd>
              <dt class="metric-unit__label">全站均分</dt>
            </div>
            <div class="metric-unit">
              <dd class="metric-unit__value">
                {{ formatHundredths(personalData.summary.highest) }}
              </dd>
              <dt class="metric-unit__label">
                {{
                  data.workUnit === 'series'
                    ? '最高均分'
                    : '最高评分'
                }}
              </dt>
            </div>
            <div class="metric-unit">
              <dd class="metric-unit__value">
                {{ formatHundredths(personalData.summary.lowest) }}
              </dd>
              <dt class="metric-unit__label">
                {{
                  data.workUnit === 'series'
                    ? '最低均分'
                    : '最低评分'
                }}
              </dt>
            </div>
          </template>
        </dl>
      </section>

      <section
        v-if="data.summary.commonWorkCount === 0"
        class="analysis-empty analysis-section analysis-empty--zero co-star-common-empty"
      >
        <span class="analysis-empty__icon">
          <co-star-icon name="info" :size="28" />
        </span>
        <h2>没有共同{{ data.workUnit === 'series' ? '系列' : '作品' }}</h2>
      </section>

      <section
        v-if="data.summary.commonWorkCount > 0"
        class="analysis-section analysis-domain co-star-tag-domain"
        aria-labelledby="co-star-tags-title"
      >
        <div class="section-heading co-star-section-heading">
          <div>
            <h2 id="co-star-tags-title">
              {{ data.workUnit === 'series' ? '代表条目标签' : '作品标签' }}
            </h2>
          </div>
          <strong v-if="tagCount" class="section-heading__meta">
            {{ tagCount }} 个高频标签
          </strong>
        </div>
        <div v-if="tagCount" class="tag-groups co-star-tag-groups">
          <div
            v-for="group in tagGroups"
            :key="group.key"
            class="tag-row"
          >
            <strong>{{ group.label }}</strong>
            <div>
              <span v-for="tag in group.tags" :key="tag.name">
                {{ tag.name }} · {{ tag.count }}
              </span>
              <span v-if="!group.tags.length">
                {{ group.key === 'personal' ? '未设置' : '无' }}
              </span>
            </div>
          </div>
        </div>
        <p v-else class="analysis-domain__empty">暂无可用标签</p>
      </section>

      <section
        v-if="
          data.summary.commonWorkCount > 0 ||
          data.kind === 'group'
        "
        class="analysis-section analysis-domain rating-domain"
        aria-label="评分表现"
      >
        <co-star-ratings
          v-if="data.summary.commonWorkCount > 0"
          :datasets="data.ratings.datasets"
          :participants="data.participants"
          :scope="scope"
          :work-unit="data.workUnit"
        />

        <div
          v-if="data.kind === 'group'"
          class="analysis-domain__block co-star-matrix-block"
          :class="{
            'co-star-matrix-block--standalone':
              data.summary.commonWorkCount === 0,
          }"
          aria-labelledby="matrix-title"
        >
          <div class="section-heading section-heading--compact">
            <div><h3 id="matrix-title">组合评分对比</h3></div>
          </div>
          <div
            class="matrix-details matrix-details--direct"
            :class="{
              'matrix-details--scrollable':
                data.participants.length >= 5,
            }"
          >
            <div
              class="co-star-matrix-scroll"
              :tabindex="data.participants.length >= 5 ? 0 : undefined"
            >
              <table
                class="matrix-table co-star-matrix-table"
                :style="{ '--matrix-size': data.participants.length }"
              >
                <thead>
                  <tr>
                    <th scope="col">组合</th>
                    <th
                      v-for="participant in data.participants"
                      :key="participant.person.id"
                      scope="col"
                    >
                      {{ primaryName(participant.person) }}
                      <small>
                        {{
                          participant.positionKeys
                            .map((key) => positionLabel(String(key)))
                            .join(' / ')
                        }}
                      </small>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="row in matrixRows"
                    :key="row.participant.person.id"
                  >
                    <th scope="row">
                      {{ primaryName(row.participant.person) }}
                      <small>
                        {{
                          row.participant.positionKeys
                            .map((key) => positionLabel(String(key)))
                            .join(' / ')
                        }}
                      </small>
                    </th>
                    <td
                      v-for="cell in row.cells"
                      :key="cell.column.person.id"
                      :class="{ 'is-diagonal': cell.kind === 'diagonal' }"
                      :aria-label="matrixCellLabel(cell)"
                    >
                      <b>{{ formatHundredths(cell.metrics.average) }}</b>
                      <small>
                        <template v-if="cell.kind === 'diagonal'">
                          {{ cell.metrics.workCount }}
                          {{ data.workUnit === 'series' ? '个系列' : '部作品' }}
                        </template>
                        <template v-else>
                          共同 {{ cell.metrics.workCount }}
                          {{ data.workUnit === 'series' ? '个' : '部' }}
                        </template>
                      </small>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <section
        v-if="personalData && data.summary.commonWorkCount > 0"
        class="analysis-section analysis-domain preference-domain"
        aria-labelledby="co-star-preference-title"
      >
        <div class="section-heading co-star-section-heading">
          <div>
            <h2 id="co-star-preference-title">相对偏好</h2>
            <p>
              有效证据 {{ personalData.preference.effectiveEvidence }} ·
              可比较 {{ personalData.preference.comparableCount }}
              {{ data.workUnit === 'series' ? '个系列' : '部作品' }}
            </p>
          </div>
          <dl class="co-star-preference-score">
            <div>
              <dt>偏好分</dt>
              <dd>{{ formatRational(personalData.preference.score) }}</dd>
            </div>
            <div>
              <dt>平均差</dt>
              <dd>{{ formatRational(personalData.preference.mean) }}</dd>
            </div>
            <div>
              <dt>证据权重</dt>
              <dd>{{ formatRational(personalData.preference.evidenceWeight) }}</dd>
            </div>
          </dl>
        </div>

        <p
          v-if="personalData.preference.score === null"
          class="preference-model-note"
        >
          共同{{ data.workUnit === 'series' ? '系列' : '作品' }}中没有同时具备我的评分与有效全站评分的{{ data.workUnit === 'series' ? '系列' : '作品' }}
        </p>
        <div class="preference-list co-star-preference-lists">
          <div class="preference-columns">
            <div>
              <h3>我更偏爱</h3>
              <ul>
              <li
                v-for="item in personalData.preference.preferred"
                :key="item.unit.key"
              >
                  <button
                    class="preference-work preference-work--positive"
                    type="button"
                    :aria-label="`在共同${
                      data.workUnit === 'series' ? '系列' : '作品'
                    }中定位${itemName(item)}`"
                    @click="focusPreferenceItem(item)"
                  >
                    <safe-image
                      :sources="
                        subjectImageCandidates(
                          item.unit.id,
                          32,
                          devicePixelRatio,
                        )
                      "
                      :alt="`${itemName(item)}封面`"
                      decorative
                      :width="32"
                    />
                    <span class="preference-work__copy">
                      <strong>{{ itemName(item) }}</strong>
                      <small>
                        {{
                          data.workUnit === 'series'
                            ? '我的均分'
                            : '我的评分'
                        }}
                        {{ formatHundredths(item.personalScore) }} ·
                        {{
                          data.workUnit === 'series'
                            ? '全站均分'
                            : '全站评分'
                        }}
                        {{ formatHundredths(item.globalScore) }}
                      </small>
                    </span>
                    <b>{{ signedHundredths(item.differenceHundredths) }}</b>
                  </button>
              </li>
                <li
                  v-if="!personalData.preference.preferred.length"
                  class="muted-row"
                >
                  没有高于全站{{
                    data.workUnit === 'series'
                      ? '均分的系列'
                      : '评分的作品'
                  }}
                </li>
              </ul>
            </div>
            <div>
              <h3>我更保守</h3>
              <ul>
              <li
                v-for="item in personalData.preference.conservative"
                :key="item.unit.key"
              >
                  <button
                    class="preference-work preference-work--negative"
                    type="button"
                    :aria-label="`在共同${
                      data.workUnit === 'series' ? '系列' : '作品'
                    }中定位${itemName(item)}`"
                    @click="focusPreferenceItem(item)"
                  >
                    <safe-image
                      :sources="
                        subjectImageCandidates(
                          item.unit.id,
                          32,
                          devicePixelRatio,
                        )
                      "
                      :alt="`${itemName(item)}封面`"
                      decorative
                      :width="32"
                    />
                    <span class="preference-work__copy">
                      <strong>{{ itemName(item) }}</strong>
                      <small>
                        {{
                          data.workUnit === 'series'
                            ? '我的均分'
                            : '我的评分'
                        }}
                        {{ formatHundredths(item.personalScore) }} ·
                        {{
                          data.workUnit === 'series'
                            ? '全站均分'
                            : '全站评分'
                        }}
                        {{ formatHundredths(item.globalScore) }}
                      </small>
                    </span>
                    <b>{{ signedHundredths(item.differenceHundredths) }}</b>
                  </button>
              </li>
                <li
                  v-if="!personalData.preference.conservative.length"
                  class="muted-row"
                >
                  没有低于全站{{
                    data.workUnit === 'series'
                      ? '均分的系列'
                      : '评分的作品'
                  }}
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section
        v-if="data.summary.commonWorkCount > 0"
        class="analysis-section shared-works-section"
        aria-labelledby="co-star-common-works-title"
      >
        <co-star-work-browser
          ref="workBrowser"
          :device-pixel-ratio="devicePixelRatio"
          :error="resource.viewPending ? null : viewError"
          :execute-view="executeView"
          :items="data.items"
          :page="currentPayload.pagination.page"
          :page-size="currentPayload.pagination.pageSize"
          :participants="data.participants"
          :pending="resource.viewPending"
          :position-label="positionLabel"
          :retry="retry"
          :scope="scope"
          :total="currentPayload.pagination.total"
          :view="view"
          :work-unit="data.workUnit"
        />
      </section>
    </template>

    <section
      v-else-if="fullPending"
      class="co-star-full-skeleton"
      aria-hidden="true"
    >
      <div class="co-star-participant-skeletons">
        <span v-for="index in people.length" :key="index" />
      </div>
      <span class="co-star-summary-skeleton" />
      <span class="co-star-section-skeleton" />
      <span class="co-star-section-skeleton" />
    </section>

    <section
      v-else
      class="co-star-initial-error"
      :class="{ 'is-error': resource.phase === 'error' }"
    >
      <span class="analysis-empty__icon">
        <co-star-icon
          :name="resource.phase === 'error' ? 'warning' : 'people'"
          :size="28"
        />
      </span>
      <h2>
        {{
          resource.phase === 'error'
            ? '共演分析暂时无法加载'
            : '正在准备共演分析'
        }}
      </h2>
      <p v-if="resource.error" role="alert">{{ resource.error }}</p>
      <div v-if="resource.phase === 'error'" class="co-star-initial-error__actions">
        <button type="button" @click="retry">重新加载</button>
        <button type="button" @click="cancel">取消</button>
      </div>
    </section>
  </article>
</template>

<style src="../co-star-analysis.css"></style>
<style src="../co-star-oracle.css"></style>
