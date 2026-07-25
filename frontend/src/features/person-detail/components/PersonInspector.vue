<script setup lang="ts">
import { computed } from 'vue';

import AppIcon from '../../../shared/components/AppIcon.vue';
import {
  formatHundredths,
  formatSignedHundredths,
  primaryEntityName,
  rationalDecimal,
  type PersonDetailPayload,
  type PersonDetailView,
  type PersonPositionLabelResolver,
} from '../model';
import PersonItemBrowser from './PersonItemBrowser.vue';
import PersonProfile from './PersonProfile.vue';
import RatingEvidence from './RatingEvidence.vue';
import StatEvidencePopover from './StatEvidencePopover.vue';

interface PersonDetailResource {
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
            label: '我的标签',
            values: payload.value.tags.personal ?? [],
          },
        ]
      : []),
  ].filter((group) => group.values.length > 0);
});
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
      />

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
        aria-labelledby="person-metrics-title"
      >
        <header class="person-section-heading">
          <div>
            <h3 id="person-metrics-title">参与概览</h3>
            <p>
              数据范围：{{ payload.scope === 'personal' ? '个人收藏' : '全站' }}
            </p>
          </div>
        </header>
        <div class="person-profile-metrics">
          <span>
            <strong>{{ payload.summary.workCount }}</strong>
            <small>{{ workUnitLabel }}数</small>
          </span>
          <span v-if="payload.summary.characterCount !== undefined">
            <strong>{{ payload.summary.characterCount }}</strong>
            <small>角色数</small>
          </span>
          <span>
            <strong>{{ payload.metrics.ratedWorkCount }}</strong>
            <small>有效评分{{ workUnitLabel }}</small>
          </span>
          <span class="is-primary">
            <strong>{{ formatHundredths(payload.metrics.average) }}</strong>
            <small>
              {{ payload.scope === 'personal' ? '我的均分' : '平均分' }}
            </small>
          </span>
          <span>
            <strong>{{ formatHundredths(payload.metrics.overall) }}</strong>
            <small class="person-metric-label">
              综合分
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
          </span>
          <template v-if="payload.scope === 'personal'">
            <span>
              <strong>{{ formatHundredths(payload.metrics.globalAverage) }}</strong>
              <small>全站均分</small>
            </span>
            <span>
              <strong>{{ formatHundredths(payload.metrics.highest) }}</strong>
              <small>我的最高分</small>
            </span>
            <span>
              <strong>{{ formatHundredths(payload.metrics.lowest) }}</strong>
              <small>我的最低分</small>
            </span>
          </template>
        </div>
      </section>

      <section
        v-if="tagGroups.length"
        class="person-inspector__section"
        aria-labelledby="person-tags-title"
      >
        <header class="person-section-heading">
          <div>
            <h3 id="person-tags-title">标签画像</h3>
            <p>标签和计数由当前查询结果提供</p>
          </div>
        </header>
        <div class="person-tag-groups">
          <div v-for="group in tagGroups" :key="group.key">
            <h4>{{ group.label }}</h4>
            <ul>
              <li v-for="tag in group.values" :key="tag.name">
                <span>{{ tag.name }}</span>
                <small>{{ tag.count }}</small>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <rating-evidence :payload="payload" />

      <section
        v-if="payload.preference"
        class="person-inspector__section person-preference"
        aria-labelledby="person-preference-title"
      >
        <header class="person-section-heading">
          <div>
            <h3 id="person-preference-title" class="person-heading-with-info">
              相对偏好
              <stat-evidence-popover label="查看相对偏好计算证据">
                <strong>相对偏好证据</strong>
                <dl>
                  <div>
                    <dt>平均差异</dt>
                    <dd>{{ rationalDecimal(payload.preference.mean, true) }}</dd>
                  </div>
                  <div>
                    <dt>可比作品</dt>
                    <dd>{{ payload.preference.comparableCount }}</dd>
                  </div>
                  <div>
                    <dt>可比系列</dt>
                    <dd>{{ payload.preference.comparableSeriesCount }}</dd>
                  </div>
                  <div>
                    <dt>有效统计单元</dt>
                    <dd>{{ payload.preference.effectiveEvidence }}</dd>
                  </div>
                  <div>
                    <dt>样本权重</dt>
                    <dd>{{ rationalDecimal(payload.preference.evidenceWeight) }}</dd>
                  </div>
                  <div>
                    <dt>最终相对偏好</dt>
                    <dd>{{ rationalDecimal(payload.preference.score, true) }}</dd>
                  </div>
                </dl>
              </stat-evidence-popover>
            </h3>
            <p>
              基于 {{ payload.preference.comparableCount }} 个可比作品 ·
              {{ payload.preference.comparableSeriesCount }} 个系列
            </p>
          </div>
          <strong class="person-preference__score">
            {{ rationalDecimal(payload.preference.score, true) }}
          </strong>
        </header>
        <dl class="person-preference__evidence">
          <div>
            <dt>有效证据</dt>
            <dd>{{ payload.preference.effectiveEvidence }}</dd>
          </div>
          <div>
            <dt>平均差异</dt>
            <dd>{{ rationalDecimal(payload.preference.mean, true) }}</dd>
          </div>
          <div>
            <dt>证据权重</dt>
            <dd>{{ rationalDecimal(payload.preference.evidenceWeight) }}</dd>
          </div>
        </dl>
        <div class="person-preference__lists">
          <section v-if="payload.preference.preferred.length">
            <h4>更偏爱的{{ workUnitLabel }}</h4>
            <ul>
              <li
                v-for="evidence in payload.preference.preferred"
                :key="evidence.unit.key"
              >
                <span>{{ primaryEntityName(evidence.unit) }}</span>
                <strong>{{ formatSignedHundredths(evidence.differenceHundredths) }}</strong>
              </li>
            </ul>
          </section>
          <section v-if="payload.preference.conservative.length">
            <h4>评价更保守的{{ workUnitLabel }}</h4>
            <ul>
              <li
                v-for="evidence in payload.preference.conservative"
                :key="evidence.unit.key"
              >
                <span>{{ primaryEntityName(evidence.unit) }}</span>
                <strong>{{ formatSignedHundredths(evidence.differenceHundredths) }}</strong>
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
