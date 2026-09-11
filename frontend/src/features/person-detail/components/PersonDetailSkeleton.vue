<script setup lang="ts">
import { NRadioButton, NRadioGroup, NSkeleton } from 'naive-ui';
import { computed } from 'vue';
import SearchSortToolbar from '../../../shared/components/SearchSortToolbar.vue';
import WorkCardsSkeleton from '../../../shared/components/WorkCardsSkeleton.vue';
import { useCompactLayout } from '../../../shared/composables/useCompactLayout';
import StatEvidencePopover from './StatEvidencePopover.vue';

const props = withDefaults(
  defineProps<{
    personal?: boolean;
    hasCharacterCount?: boolean;
    workUnit?: 'series' | 'subject';
    section?: 'works' | 'characters';
    pageSize?: number;
  }>(),
  {
    personal: true,
    hasCharacterCount: false,
    workUnit: 'subject',
    section: 'works',
    pageSize: 5,
  },
);
const compact = useCompactLayout();
const controlSize = computed(() => (compact.value ? 'small' : 'medium'));
const series = computed(() => props.workUnit === 'series');
const metrics = computed(() => [
  series.value ? '参与系列' : '参与作品',
  ...(props.hasCharacterCount ? ['角色数'] : []),
  ...(props.personal ? [series.value ? '已评系列' : '已评分'] : []),
  props.personal ? '全站均分' : '均分',
  ...(props.personal ? ['我的均分'] : []),
  '综合分',
  ...(props.personal
    ? [
        '相对偏好',
        series.value ? '最高均分' : '最高评分',
        series.value ? '最低均分' : '最低评分',
      ]
    : []),
]);
const tagGroups = computed(() => [
  { label: '官方标签', count: 6 },
  { label: '社区标签', count: 8 },
  ...(props.personal ? [{ label: '我的标签', count: 1 }] : []),
]);
const workLabel = computed(() =>
  props.section === 'characters' ? '角色' : series.value ? '系列' : '作品',
);
// Neutral loading silhouettes, not estimated ratings.
const barHeights = [38, 56, 44, 72, 62, 86, 54, 68, 46, 34];
</script>

<template>
  <div
    class="person-detail-skeleton person-inspector person-inspector__identity-pending"
    aria-busy="true"
  >
    <span class="sr-only" role="status" aria-live="polite"
      >正在加载人物详情</span
    >
    <header class="person-profile">
      <div
        class="person-profile__intro detail-skeleton__profile"
        aria-hidden="true"
      >
        <div class="person-profile__portrait detail-skeleton__portrait">
          <n-skeleton class="app-skeleton" width="100%" height="100%" />
        </div>
        <div class="person-profile__copy">
          <div class="person-profile__content detail-skeleton__identity">
            <div class="person-profile__name-row">
              <h2>
                <n-skeleton
                  text
                  class="app-skeleton"
                  width="100%"
                  height="1em"
                  :sharp="false"
                />
              </h2>
            </div>
            <span class="person-profile__career"
              ><n-skeleton
                text
                class="app-skeleton"
                width="96px"
                height="1em"
                :sharp="false"
            /></span>
            <p class="person-profile__secondary-name">
              <n-skeleton
                text
                class="app-skeleton"
                width="70%"
                height="1em"
                :sharp="false"
              />
            </p>
          </div>
          <section class="person-profile__summary person-profile__bio">
            <p>
              <n-skeleton
                text
                class="app-skeleton"
                height="1em"
                :sharp="false"
              /><br /><n-skeleton
                text
                class="app-skeleton"
                width="80%"
                height="1em"
                :sharp="false"
              />
            </p>
          </section>
        </div>
      </div>
      <div
        class="person-profile-metrics profile-metrics--extended metric-grid detail-skeleton__metrics"
        :class="{
          'has-character-count': hasCharacterCount,
          'profile-metrics--global': !personal,
        }"
        aria-label="人物统计"
      >
        <span v-for="label in metrics" :key="label" class="metric-unit">
          <small
            class="metric-unit__label"
            :class="{
              'profile-metric__label':
                label === '综合分' || label === '相对偏好',
            }"
          >
            <span class="profile-metric__label-text">{{ label }}</span>
            <stat-evidence-popover
              v-if="label === '综合分' || label === '相对偏好'"
              :label="`查看${label}计算证据`"
              >正在加载计算证据</stat-evidence-popover
            >
          </small>
          <strong class="metric-unit__value"
            ><n-skeleton
              text
              class="app-skeleton"
              width="36px"
              height="1em"
              :sharp="false"
              aria-hidden="true"
          /></strong>
        </span>
      </div>
    </header>
    <section class="person-inspector__section">
      <header class="person-section-heading">
        <h2>{{ series ? '代表条目标签' : '作品标签' }}</h2>
        <strong class="person-section-heading__meta"
          ><n-skeleton
            text
            class="app-skeleton"
            width="24px"
            height="1em"
            :sharp="false"
            aria-hidden="true"
          />
          个高频标签</strong
        >
      </header>
      <div class="person-tag-groups">
        <div v-for="group in tagGroups" :key="group.label">
          <h4>{{ group.label }}</h4>
          <ul>
            <li
              v-for="index in group.count"
              :key="index"
              class="detail-skeleton__tag-item"
              aria-hidden="true"
            >
              <n-skeleton
                class="app-skeleton detail-skeleton__tag"
                :width="`${index % 3 === 0 ? 76 : 64}px`"
                height="22px"
                round
              />
            </li>
          </ul>
        </div>
      </div>
    </section>
    <section class="person-inspector__section rating-evidence">
      <header class="person-section-heading rating-distribution-panel__heading">
        <h2>{{ series ? '系列均分分布' : '评分分布' }}</h2>
        <div
          v-if="!series || personal"
          class="rating-distribution-panel__controls"
        >
          <n-radio-group
            v-if="!series"
            value="score"
            :size="controlSize"
            disabled
            aria-label="评分图表维度"
            ><n-radio-button value="score">按评分</n-radio-button
            ><n-radio-button value="time">按时间</n-radio-button></n-radio-group
          >
          <n-radio-group
            v-if="personal"
            value="personal"
            :size="controlSize"
            disabled
            aria-label="评分数据来源"
            ><n-radio-button value="personal">我的评分</n-radio-button
            ><n-radio-button value="global"
              >全站评分</n-radio-button
            ></n-radio-group
          >
        </div>
      </header>
      <div
        class="person-score-distribution score-distribution"
        style="--distribution-steps: 4"
        aria-hidden="true"
      >
        <div class="score-distribution__axis">
          <span
            v-for="tick in 5"
            :key="tick"
            :style="{ bottom: `${(tick - 1) * 25}%` }"
            ><n-skeleton
              class="app-skeleton"
              width="16px"
              height="8px"
              :sharp="false"
          /></span>
        </div>
        <div
          v-for="(height, index) in barHeights"
          :key="index"
          class="person-score-bar score-bar"
        >
          <span class="score-bar__track"
            ><n-skeleton
              class="app-skeleton"
              width="min(24px, 72%)"
              :height="`${height}%`"
              :sharp="false" /></span
          ><small>{{ index + 1 }}</small>
        </div>
      </div>
    </section>
    <section
      v-if="personal"
      class="person-inspector__section person-preference"
    >
      <header class="person-section-heading"><h2>相对偏好</h2></header>
      <div class="person-preference__lists">
        <section v-for="label in ['我更偏爱', '我更保守']" :key="label">
          <h3>{{ label }}</h3>
          <ul aria-hidden="true">
            <li v-for="index in 3" :key="index">
              <div class="person-preference-work">
                <n-skeleton
                  class="app-skeleton"
                  width="32px"
                  height="43px"
                  :sharp="false"
                /><span class="person-preference-work__copy"
                  ><strong
                    ><n-skeleton
                      text
                      class="app-skeleton"
                      width="80%"
                      height="1em"
                      :sharp="false" /></strong
                  ><small
                    ><n-skeleton
                      text
                      class="app-skeleton"
                      width="95%"
                      height="1em"
                      :sharp="false" /></small></span
                ><b
                  ><n-skeleton
                    text
                    class="app-skeleton"
                    width="28px"
                    height="1em"
                    :sharp="false"
                /></b>
              </div>
            </li>
          </ul>
        </section>
      </div>
    </section>
    <section class="person-inspector__section person-item-browser">
      <header class="person-section-heading person-item-browser__heading">
        <div class="person-item-browser__heading-copy">
          <h2 v-if="!hasCharacterCount">参与{{ workLabel }}</h2>
          <n-radio-group
            v-else
            :value="section"
            :size="controlSize"
            disabled
            aria-label="浏览参与作品或配音角色"
            ><n-radio-button value="works">{{
              series ? '系列' : '作品'
            }}</n-radio-button
            ><n-radio-button value="characters"
              >角色</n-radio-button
            ></n-radio-group
          >
        </div>
        <n-radio-group
          value="detailed"
          :size="controlSize"
          disabled
          aria-label="内容显示密度"
          ><n-radio-button value="detailed">详细</n-radio-button
          ><n-radio-button value="compact">缩略</n-radio-button></n-radio-group
        >
      </header>
      <search-sort-toolbar
        class="person-item-toolbar work-list-toolbar"
        search=""
        sort="score"
        order="desc"
        :options="[
          {
            label:
              section === 'characters'
                ? '戏份类型'
                : series
                  ? '全站均分'
                  : '全站评分',
            value: 'score',
          },
        ]"
        :placeholder="
          section === 'characters'
            ? '搜索角色'
            : series
              ? '搜索系列或系列内作品'
              : '搜索作品'
        "
        :search-label="`搜索${workLabel}`"
        :sort-label="`${workLabel}排序规则`"
        search-class="person-item-toolbar__search"
        sort-class=""
        disabled
      />
      <div class="person-item-browser__body">
        <work-cards-skeleton
          :count="pageSize"
          :personal="personal"
          :has-character-roles="hasCharacterCount"
          :kind="section === 'characters' ? 'character' : workUnit"
        />
      </div>
    </section>
  </div>
</template>

<style src="../person-detail.css"></style>
<style scoped>
.person-detail-skeleton {
  min-width: 0;
}
.detail-skeleton__portrait {
  overflow: hidden;
}
.detail-skeleton__identity .person-profile__name-row h2 {
  width: 100%;
}
.person-detail-skeleton .app-skeleton {
  max-width: 100%;
}
.person-detail-skeleton .person-tag-groups .detail-skeleton__tag-item {
  padding: 0;
  border: 0;
  background: transparent;
}
.detail-skeleton__tag {
  display: block;
  font-size: 12px;
}
.person-detail-skeleton .score-bar__track .app-skeleton {
  flex: 0 0 auto;
}
</style>
