<script setup lang="ts">
import { joinDisplayText } from '../../../shared/text/separators';

import '../co-star-oracle.css';
import { NCheckbox, NRadioButton, NRadioGroup, NSkeleton } from 'naive-ui';
import { computed } from 'vue';
import CoStarParticipants from './CoStarParticipants.vue';

import WorkCardsSkeleton from '../../../shared/components/WorkCardsSkeleton.vue';
import { useCompactLayout } from '../../../shared/composables/useCompactLayout';
import SearchSortToolbar from '../../../shared/components/SearchSortToolbar.vue';
import { coStarSortOptions, defaultCoStarView } from '../coStar';
import type { SelectedPerson } from '../model';

const props = withDefaults(defineProps<{
  people: readonly SelectedPerson[];
  scope: 'global' | 'personal';
  workUnit: 'series' | 'subject';
  pageSize?: number;
  positionLabel: (key: string) => string;
}>(), { pageSize: 5 });

const compactLayout = useCompactLayout();
const controlSize = computed(() => compactLayout.value ? 'small' : 'medium');
const personal = computed(() => props.scope === 'personal');
const series = computed(() => props.workUnit === 'series');
const commonLabel = computed(() => series.value ? '共同系列' : '共同作品');
const sortOptions = computed(() => [...coStarSortOptions(props.scope, props.workUnit)]);
const view = computed(() => defaultCoStarView(props.scope));
const metricLabels = computed(() => [
  series.value ? '参与系列并集' : '参与作品并集',
  commonLabel.value,
  series.value ? '已评系列' : '已评作品',
  personal.value ? '我的均分' : '均分',
  ...(personal.value ? ['全站已评分', '全站均分', series.value ? '最高均分' : '最高评分', series.value ? '最低均分' : '最低评分'] : []),
]);
const tagLabels = computed(() => ['官方标签', '社区标签', ...(personal.value ? ['我的标签'] : [])]);
const name = (person: SelectedPerson) => person.person.nameCN ?? person.person.name;
// Fixed visual placeholders; heights do not represent rating counts.
const chartColumnHeights = [38, 56, 44, 72, 62, 86, 54, 68, 46, 34];
</script>

<template>
  <article class="analysis-dashboard analysis-dashboard--unified co-star-surface surface-panel co-star-full-skeleton" :data-analysis-mode="people.length === 0 ? 'pending' : people.length > 2 ? 'group' : 'pair'" aria-busy="true" aria-label="共演分析">
    <span class="sr-only" role="status">{{ people.length ? `正在加载 ${people.length} 人共演分析` : '正在加载共演分析' }}</span>
    <section class="analysis-section relationship-hero selected-people-panel" :aria-label="people.length ? '已选人物概览' : '共演统计'">
      <co-star-participants
        v-if="people.length"
        :participants="people.map(person => ({ person: person.person, positionKeys: person.identities.map(identity => identity.positionKey), metrics: { workCount: null, average: null } }))"
        :position-label="positionLabel"
        :work-unit="workUnit"
        pending
      />
      <dl class="analysis-profile-summary shared-rating-summary shared-rating-summary--below metric-grid co-star-summary-grid" :data-metric-count="metricLabels.length" aria-label="多人组合概览">
        <div v-for="label in metricLabels" :key="label" class="metric-unit">
          <dd class="metric-unit__value"><n-skeleton class="app-skeleton" width="44px" height="1lh" :sharp="false" aria-hidden="true" /></dd>
          <dt class="metric-unit__label">{{ label }}</dt>
        </div>
      </dl>
    </section>
    <section class="analysis-section analysis-domain co-star-tag-domain">
      <div class="section-heading co-star-section-heading">
        <h2>{{ series ? '代表条目标签' : '作品标签' }}</h2>
        <n-skeleton class="app-skeleton" width="90px" height="16px" :sharp="false" aria-hidden="true" />
      </div>
      <div class="tag-groups co-star-tag-groups">
        <div v-for="label in tagLabels" :key="label" class="tag-row">
          <strong>{{ label }}</strong>
          <div class="co-star-loading-tags" aria-hidden="true">
            <n-skeleton v-for="index in label === '我的标签' ? 2 : 5" :key="index" class="app-skeleton" :width="`${index % 2 ? 76 : 60}px`" height="22px" round />
          </div>
        </div>
      </div>
    </section>
    <section class="analysis-section analysis-domain rating-domain" aria-label="评分表现">
      <div class="analysis-domain__block rating-distribution-panel">
        <div class="section-heading co-star-section-heading rating-distribution-panel__heading">
          <h2>{{ series ? '系列均分分布' : '评分分布' }}</h2>
          <div v-if="!series || personal" class="rating-distribution-panel__controls">
            <n-radio-group v-if="!series" value="score" :size="controlSize" disabled aria-label="评分图表维度">
              <n-radio-button value="score">按评分</n-radio-button><n-radio-button value="time">按时间</n-radio-button>
            </n-radio-group>
            <n-radio-group v-if="personal" value="personal" :size="controlSize" disabled aria-label="评分数据来源">
              <n-radio-button value="personal">我的评分</n-radio-button><n-radio-button value="global">全站评分</n-radio-button>
            </n-radio-group>
          </div>
        </div>
        <div class="distribution-legend" role="group" aria-label="评分对比系列">
          <span>
            <n-checkbox :size="controlSize" checked disabled>
              <span class="distribution-legend__checkbox-label"><b>{{ commonLabel }}</b></span>
            </n-checkbox>
          </span>
          <span v-for="(person, index) in people" :key="person.person.id">
            <n-checkbox :size="controlSize" checked disabled>
              <span class="distribution-legend__checkbox-label"><b>{{ joinDisplayText([String(index + 1).padStart(2, '0'), name(person)], ' · ') }}</b></span>
            </n-checkbox>
          </span>
        </div>
        <div class="co-star-loading-chart" aria-hidden="true">
          <div class="co-star-loading-chart__axis">
            <n-skeleton v-for="tick in 3" :key="tick" class="app-skeleton" width="16px" height="10px" :sharp="false" />
          </div>
          <div class="co-star-loading-chart__columns">
            <div v-for="(height, index) in chartColumnHeights" :key="index" class="co-star-loading-chart__column">
              <div class="co-star-loading-chart__bar">
                <n-skeleton class="app-skeleton" width="min(24px, 70%)" :height="`${height}%`" :sharp="false" />
              </div>
              <small>{{ index + 1 }}</small>
            </div>
          </div>
        </div>
      </div>
      <div v-if="people.length > 2" class="analysis-domain__block co-star-matrix-block">
        <div class="section-heading section-heading--compact"><h3>组合评分对比</h3></div>
        <div class="matrix-details matrix-details--direct" :class="{ 'matrix-details--scrollable': people.length >= 5 }">
          <div class="co-star-matrix-scroll">
            <table class="matrix-table co-star-matrix-table" :style="{ '--matrix-size': people.length }" aria-label="组合评分正在加载">
              <thead><tr><th scope="col">组合</th><th v-for="person in people" :key="person.person.id" scope="col">{{ name(person) }}<small>{{ joinDisplayText(person.identities.map(identity => positionLabel(identity.positionKey)), ' / ') }}</small></th></tr></thead>
              <tbody><tr v-for="person in people" :key="person.person.id">
                <th scope="row">{{ name(person) }}<small>{{ joinDisplayText(person.identities.map(identity => positionLabel(identity.positionKey)), ' / ') }}</small></th>
                <td v-for="other in people" :key="other.person.id" :class="{ 'is-diagonal': person.person.id === other.person.id }">
                  <n-skeleton class="app-skeleton" width="36px" height="18px" :sharp="false" aria-hidden="true" />
                  <n-skeleton class="app-skeleton co-star-loading-matrix-count" width="48px" height="12px" :sharp="false" aria-hidden="true" />
                </td>
              </tr></tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
    <section v-if="personal" class="analysis-section analysis-domain preference-domain">
      <div class="section-heading co-star-section-heading">
        <div><h2>相对偏好</h2><n-skeleton class="app-skeleton" width="160px" height="16px" :sharp="false" aria-hidden="true" /></div>
        <dl class="co-star-preference-score">
          <div v-for="label in ['偏好分', '平均差', '证据权重']" :key="label">
            <dt>{{ label }}</dt><dd><n-skeleton class="app-skeleton" width="40px" height="24px" :sharp="false" aria-hidden="true" /></dd>
          </div>
        </dl>
      </div>
      <div class="preference-list co-star-preference-lists">
        <div class="preference-columns">
          <div v-for="label in ['我更偏爱', '我更保守']" :key="label"><h3>{{ label }}</h3>
            <ul aria-hidden="true"><li v-for="index in 3" :key="index"><div class="preference-work co-star-loading-preference">
              <n-skeleton class="app-skeleton" width="32px" height="42px" :sharp="false" />
              <span class="preference-work__copy"><n-skeleton class="app-skeleton" width="85%" height="16px" :sharp="false" /><n-skeleton class="app-skeleton" width="70%" height="12px" :sharp="false" /></span>
              <n-skeleton class="app-skeleton" width="32px" height="16px" :sharp="false" />
            </div></li></ul>
          </div>
        </div>
      </div>
    </section>
    <section class="analysis-section shared-works-section">
      <div class="subject-work-browser co-star-work-browser">
        <div class="section-heading co-star-section-heading subject-work-browser__heading">
          <div class="subject-work-browser__heading-copy"><h2>{{ commonLabel }}</h2><n-skeleton class="app-skeleton" width="120px" height="14px" :sharp="false" aria-hidden="true" /></div>
          <div class="subject-work-browser__density-toggle"><n-radio-group value="detailed" :size="controlSize" disabled aria-label="共同作品显示密度"><n-radio-button value="detailed">详细</n-radio-button><n-radio-button value="compact">缩略</n-radio-button></n-radio-group></div>
        </div>
        <search-sort-toolbar
          class="work-list-toolbar co-star-work-toolbar"
          search=""
          :sort="view.sort"
          :order="view.order"
          :options="sortOptions"
          :placeholder="series ? '搜索系列或系列内作品' : '搜索作品'"
          search-label="搜索共同作品"
          search-class=""
          sort-label="共同作品排序依据"
          sort-class=""
          search-icon
          disabled
        />
        <work-cards-skeleton class="co-star-work-skeletons" :count="pageSize" :personal="personal" :kind="workUnit" :participant-count="people.length" />
      </div>
    </section>
  </article>
</template>

<style src="../co-star-analysis.css"></style>

<style scoped>
.co-star-loading-tags .app-skeleton {
  font-size: var(--text-caption, 12px);
}
</style>
