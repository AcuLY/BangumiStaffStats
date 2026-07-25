<script setup lang="ts">
import { computed, nextTick } from 'vue';

import AppIcon from '../../../shared/components/AppIcon.vue';
import SafeImage from '../../../shared/components/SafeImage.vue';
import { subjectImageCandidates } from '../../../shared/media/bangumiImage';
import {
  formatHundredths,
  formatSignedHundredths,
  primaryEntityName,
  rationalDecimal,
  updatePersonDetailView,
  type PersonDetailPayload,
  type PersonDetailView,
  type PersonPositionLabelResolver,
} from '../model';
import PersonItemBrowser from './PersonItemBrowser.vue';
import PersonProfile from './PersonProfile.vue';
import RatingEvidence from './RatingEvidence.vue';
import StatEvidencePopover from './StatEvidencePopover.vue';

interface PersonDetailResource {
  readonly acceptedQuery: Readonly<{
    positionKeys: readonly unknown[];
  }> | null;
  readonly error: string | null;
  readonly feedback: string | null;
  readonly input: Readonly<{ personId: number }>;
  readonly payload: PersonDetailPayload | null;
  readonly phase: 'error' | 'idle' | 'pending' | 'ready';
  readonly view: Readonly<PersonDetailView>;
  readonly viewPending: boolean;
}

const props = withDefaults(
  defineProps<{
    devicePixelRatio?: number;
    executeView: (view: Readonly<PersonDetailView>) => Promise<boolean>;
    positionLabel: PersonPositionLabelResolver;
    resource: PersonDetailResource;
    retry: (personId: number) => Promise<boolean>;
  }>(),
  {
    devicePixelRatio: 1,
  },
);

const payload = computed(() => props.resource.payload);
const acceptedPositionKeys = computed(() =>
  (props.resource.acceptedQuery?.positionKeys ?? []).map(String),
);
const workUnitLabel = computed(() =>
  payload.value?.summary.workUnit === 'series' ? '系列' : '作品',
);
const tagGroups = computed(() => {
  if (!payload.value) {
    return [];
  }
  return [
    { key: 'meta', label: '条目类型', values: payload.value.tags.meta },
    {
      key: 'community',
      label: '社区标签',
      values: payload.value.tags.community,
    },
    ...('personal' in payload.value.tags
      ? [
          {
            key: 'personal',
            label: '收藏标签',
            values: payload.value.tags.personal ?? [],
          },
        ]
      : []),
  ];
});
const tagCount = computed(() =>
  tagGroups.value.reduce((count, group) => count + group.values.length, 0),
);

function extremaLabel(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return '—';
  }
  return payload.value?.summary.workUnit === 'series'
    ? formatHundredths(value)
    : String(Math.round(value / 100));
}

function preferenceImageSources(
  unit: NonNullable<
    PersonDetailPayload['preference']
  >['preferred'][number]['unit'],
): readonly string[] {
  return unit.kind === 'subject'
    ? subjectImageCandidates(unit.id, 32, props.devicePixelRatio)
    : [];
}

async function focusPreference(
  unit: NonNullable<
    PersonDetailPayload['preference']
  >['preferred'][number]['unit'],
): Promise<void> {
  await props.executeView(
    updatePersonDetailView(props.resource.view, {
      search: primaryEntityName(unit),
      section: 'works',
      sort:
        props.resource.view.section === 'characters'
          ? 'globalScore'
          : props.resource.view.sort,
    }),
  );
  await nextTick();
  document
    .querySelector<HTMLInputElement>(
      'input[aria-label="搜索参与作品"], input[aria-label="搜索参与系列或系列内作品"]',
    )
    ?.focus();
}
</script>

<template>
  <article class="person-inspector">
    <div
      v-if="resource.phase === 'pending' && !payload"
      class="person-inspector__identity-pending"
      aria-busy="true"
      aria-live="polite"
    >
      <span class="sr-only">正在加载人物详情</span>
      <div class="person-profile-skeleton" aria-hidden="true">
        <i />
        <span>
          <b />
          <b />
          <b />
        </span>
      </div>
      <div class="person-metrics-skeleton" aria-hidden="true">
        <i v-for="index in 4" :key="index" />
      </div>
      <div class="person-section-skeleton" aria-hidden="true">
        <i v-for="index in 5" :key="index" />
      </div>
    </div>

    <section
      v-else-if="!payload && resource.error"
      class="person-inspector__state"
      role="alert"
    >
      <span class="state-icon">
        <app-icon name="refresh" :size="24" />
      </span>
      <h2>人物详情加载失败</h2>
      <p>{{ resource.error }}</p>
      <button
        class="app-primary-action"
        type="button"
        @click="retry(resource.input.personId)"
      >
        重试
      </button>
    </section>

    <template v-else-if="payload">
      <person-profile
        :device-pixel-ratio="devicePixelRatio"
        :payload="payload"
        :position-label="positionLabel"
        :position-keys="acceptedPositionKeys"
      >
        <template #metrics>
          <div
            class="person-profile-metrics profile-metrics--extended metric-grid"
            :class="{
              'has-character-count':
                payload.summary.characterCount !== undefined,
              'profile-metrics--global': payload.scope === 'global',
            }"
            aria-label="人物统计"
          >
            <span class="metric-unit">
              <small class="metric-unit__label">
                {{ payload.summary.workUnit === 'series' ? '参与系列' : '参与作品' }}
              </small>
              <strong class="metric-unit__value">
                {{ payload.summary.workCount }}
              </strong>
            </span>
            <span
              v-if="payload.summary.characterCount !== undefined"
              class="metric-unit"
            >
              <small class="metric-unit__label">角色数</small>
              <strong class="metric-unit__value">
                {{ payload.summary.characterCount }}
              </strong>
            </span>
            <span v-if="payload.scope === 'personal'" class="metric-unit">
              <small class="metric-unit__label">
                {{ payload.summary.workUnit === 'series' ? '已评系列' : '已评分' }}
              </small>
              <strong class="metric-unit__value">
                {{ payload.metrics.ratedWorkCount }}
              </strong>
            </span>
            <span class="metric-unit">
              <small class="metric-unit__label">
                {{ payload.scope === 'personal' ? '全站均分' : '均分' }}
              </small>
              <strong class="metric-unit__value">
                {{
                  formatHundredths(
                    payload.scope === 'personal'
                      ? payload.metrics.globalAverage
                      : payload.metrics.average,
                  )
                }}
              </strong>
            </span>
            <span
              v-if="payload.scope === 'personal'"
              class="metric-unit profile-metric--primary"
            >
              <small class="metric-unit__label">我的均分</small>
              <strong class="metric-unit__value">
                {{ formatHundredths(payload.metrics.average) }}
              </strong>
            </span>
            <span class="metric-unit profile-metric--primary">
              <small
                class="person-metric-label profile-metric__label metric-unit__label"
              >
                <span class="profile-metric__label-text">综合分</span>
                <stat-evidence-popover label="查看综合分计算证据">
                  <strong>综合分证据</strong>
                  <dl>
                    <div>
                      <dt>当前均分</dt>
                      <dd>{{ formatHundredths(payload.metrics.average) }}</dd>
                    </div>
                    <div>
                      <dt>有效评分{{ workUnitLabel }}</dt>
                      <dd>{{ payload.metrics.ratedWorkCount }}</dd>
                    </div>
                    <div>
                      <dt>中性统计单元</dt>
                      <dd>5 个 × 5.00 分</dd>
                    </div>
                    <div>
                      <dt>分母</dt>
                      <dd>
                        {{ payload.metrics.ratedWorkCount }} + 5 =
                        {{ payload.metrics.ratedWorkCount + 5 }}
                      </dd>
                    </div>
                    <div>
                      <dt>最终综合分</dt>
                      <dd>{{ formatHundredths(payload.metrics.overall) }}</dd>
                    </div>
                  </dl>
                </stat-evidence-popover>
              </small>
              <strong class="metric-unit__value">
                {{ formatHundredths(payload.metrics.overall) }}
              </strong>
            </span>
            <span
              v-if="payload.scope === 'personal'"
              class="metric-unit profile-metric--primary"
            >
              <small
                class="person-metric-label profile-metric__label metric-unit__label"
              >
                <span class="profile-metric__label-text">相对偏好</span>
                <stat-evidence-popover label="查看相对偏好计算证据">
                  <strong>相对偏好证据</strong>
                  <dl>
                    <div>
                      <dt>平均差异</dt>
                      <dd>{{ rationalDecimal(payload.preference?.mean, true) }}</dd>
                    </div>
                    <div>
                      <dt>可比作品</dt>
                      <dd>{{ payload.preference?.comparableCount ?? 0 }}</dd>
                    </div>
                    <div>
                      <dt>可比系列</dt>
                      <dd>{{ payload.preference?.comparableSeriesCount ?? 0 }}</dd>
                    </div>
                    <div>
                      <dt>有效统计单元</dt>
                      <dd>{{ payload.preference?.effectiveEvidence ?? 0 }}</dd>
                    </div>
                    <div>
                      <dt>样本权重</dt>
                      <dd>
                        {{ rationalDecimal(payload.preference?.evidenceWeight) }}
                      </dd>
                    </div>
                    <div>
                      <dt>最终相对偏好</dt>
                      <dd>{{ rationalDecimal(payload.preference?.score, true) }}</dd>
                    </div>
                  </dl>
                </stat-evidence-popover>
              </small>
              <strong class="metric-unit__value">
                {{ rationalDecimal(payload.preference?.score, true) }}
              </strong>
            </span>
            <template v-if="payload.scope === 'personal'">
              <span class="metric-unit">
                <small class="metric-unit__label">
                  {{ payload.summary.workUnit === 'series' ? '最高均分' : '最高评分' }}
                </small>
                <strong class="metric-unit__value">
                  {{ extremaLabel(payload.metrics.highest) }}
                </strong>
              </span>
              <span class="metric-unit">
                <small class="metric-unit__label">
                  {{ payload.summary.workUnit === 'series' ? '最低均分' : '最低评分' }}
                </small>
                <strong class="metric-unit__value">
                  {{ extremaLabel(payload.metrics.lowest) }}
                </strong>
              </span>
            </template>
          </div>
        </template>
      </person-profile>

      <p
        v-if="resource.feedback"
        class="person-inspector__notice"
        role="status"
      >
        {{ resource.feedback }}
      </p>
      <p
        v-if="resource.error"
        class="person-inspector__inline-error"
        role="alert"
      >
        {{ resource.error }}
      </p>

      <section
        class="person-inspector__section"
        aria-labelledby="person-tags-title"
      >
        <header class="person-section-heading">
          <h2 id="person-tags-title">
            {{ payload.summary.workUnit === 'series' ? '代表条目标签' : '作品标签' }}
          </h2>
          <strong v-if="tagCount" class="person-section-heading__meta">
            {{ tagCount }} 个高频标签
          </strong>
        </header>
        <div v-if="tagCount" class="person-tag-groups">
          <div v-for="group in tagGroups" :key="group.key">
            <h4>
              {{
                group.key === 'meta'
                  ? '条目属性'
                  : group.key === 'community'
                    ? '社区标签'
                    : '收藏标签'
              }}
            </h4>
            <ul>
              <li v-for="tag in group.values" :key="tag.name">
                <span>{{ tag.name }} · {{ tag.count }}</span>
              </li>
              <li v-if="!group.values.length">
                <span>{{ group.key === 'personal' ? '未设置' : '无' }}</span>
              </li>
            </ul>
          </div>
        </div>
        <p v-else class="person-section-empty">暂无可用标签</p>
      </section>

      <rating-evidence :payload="payload" />

      <section
        v-if="payload.preference"
        class="person-inspector__section person-preference"
        aria-labelledby="person-preference-title"
      >
        <header class="person-section-heading">
          <h2 id="person-preference-title">相对偏好</h2>
        </header>
        <p
          v-if="payload.preference.score === null"
          class="person-preference__empty"
        >
          没有同时具备我的评分与有效全站评分的{{ workUnitLabel }}
        </p>
        <div class="person-preference__lists">
          <section>
            <h3>我更偏爱</h3>
            <ul>
              <li
                v-for="evidence in payload.preference.preferred"
                :key="evidence.unit.key"
              >
                <button
                  class="person-preference-work person-preference-work--positive"
                  type="button"
                  :aria-label="`在参与${workUnitLabel}中定位${primaryEntityName(evidence.unit)}`"
                  @click="focusPreference(evidence.unit)"
                >
                  <safe-image
                    :sources="preferenceImageSources(evidence.unit)"
                    :alt="primaryEntityName(evidence.unit)"
                    decorative
                    :width="32"
                  />
                  <span class="person-preference-work__copy">
                    <strong>{{ primaryEntityName(evidence.unit) }}</strong>
                    <small>
                      我的{{ payload.summary.workUnit === 'series' ? '均分' : '评分' }}
                      {{ formatHundredths(evidence.personalScore) }} ·
                      全站{{ payload.summary.workUnit === 'series' ? '均分' : '评分' }}
                      {{ formatHundredths(evidence.globalScore) }}
                    </small>
                  </span>
                  <b>
                    {{ formatSignedHundredths(evidence.differenceHundredths) }}
                  </b>
                </button>
              </li>
              <li
                v-if="!payload.preference.preferred.length"
                class="person-preference__muted-row"
              >
                没有高于全站{{ payload.summary.workUnit === 'series' ? '均分的系列' : '评分的作品' }}
              </li>
            </ul>
          </section>
          <section>
            <h3>我更保守</h3>
            <ul>
              <li
                v-for="evidence in payload.preference.conservative"
                :key="evidence.unit.key"
              >
                <button
                  class="person-preference-work person-preference-work--negative"
                  type="button"
                  :aria-label="`在参与${workUnitLabel}中定位${primaryEntityName(evidence.unit)}`"
                  @click="focusPreference(evidence.unit)"
                >
                  <safe-image
                    :sources="preferenceImageSources(evidence.unit)"
                    :alt="primaryEntityName(evidence.unit)"
                    decorative
                    :width="32"
                  />
                  <span class="person-preference-work__copy">
                    <strong>{{ primaryEntityName(evidence.unit) }}</strong>
                    <small>
                      我的{{ payload.summary.workUnit === 'series' ? '均分' : '评分' }}
                      {{ formatHundredths(evidence.personalScore) }} ·
                      全站{{ payload.summary.workUnit === 'series' ? '均分' : '评分' }}
                      {{ formatHundredths(evidence.globalScore) }}
                    </small>
                  </span>
                  <b>
                    {{ formatSignedHundredths(evidence.differenceHundredths) }}
                  </b>
                </button>
              </li>
              <li
                v-if="!payload.preference.conservative.length"
                class="person-preference__muted-row"
              >
                没有低于全站{{ payload.summary.workUnit === 'series' ? '均分的系列' : '评分的作品' }}
              </li>
            </ul>
          </section>
        </div>
      </section>

      <person-item-browser
        :device-pixel-ratio="devicePixelRatio"
        :payload="payload"
        :pending="resource.viewPending"
        :position-label="positionLabel"
        :view="resource.view"
        @view="executeView"
      />
    </template>
  </article>
</template>
