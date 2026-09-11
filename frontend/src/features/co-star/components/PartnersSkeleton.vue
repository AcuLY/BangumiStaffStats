<script setup lang="ts">
import { NSelect, NSkeleton } from 'naive-ui';
import { computed } from 'vue';

import SearchSortToolbar from '../../../shared/components/SearchSortToolbar.vue';
import type { SelectedPerson } from '../model';
import CoStarParticipants from './CoStarParticipants.vue';
import RankingListSkeleton from '../../ranking/components/RankingListSkeleton.vue';

const props = withDefaults(defineProps<{
  source: SelectedPerson;
  scope: 'global' | 'personal';
  workUnit: 'series' | 'subject';
  pageSize?: number;
  positionLabel: (key: string) => string;
  positionKeys?: readonly string[];
  section?: 'full' | 'summary' | 'rows';
}>(), { pageSize: 20, positionKeys: () => [], section: 'full' });

const personal = computed(() => props.scope === 'personal');
const positionControlWidth = computed(() => `calc(${Math.max(4, ...props.positionKeys.map(
  key => Array.from(props.positionLabel(key)).reduce((width, character) => width + (/^[\x20-\x7e]$/.test(character) ? 0.5 : 1), 0),
))}ic + 40px)`);
const leaderLabels = computed(() => [props.workUnit === 'series' ? '系列数最高' : '合作数最高', '均分最高', '综合分最高', ...(personal.value ? ['偏好分最高'] : [])]);
</script>

<template>
  <article v-if="section === 'full'" class="partners-surface single-cooperation surface-panel" :class="{ 'is-personal': personal }" aria-busy="true" aria-label="合作人物分析">
    <span class="sr-only" role="status">正在加载合作人物分析</span>
    <section class="single-cooperation__selection">
      <div class="single-cooperation__selection-content">
        <co-star-participants
          :participants="[{ person: source.person, positionKeys: source.identities.map(identity => identity.positionKey), metrics: { workCount: null, average: null } }]"
          :position-label="positionLabel"
          :work-unit="workUnit"
          :work-label="workUnit === 'series' ? '参与系列' : personal ? '收藏作品' : '参与作品'"
          :partner-count="null"
          pending
        />
        <div class="single-cooperation__profile-copy">
          <partners-skeleton :source="source" :scope="scope" :work-unit="workUnit" :position-label="positionLabel" section="summary" />
        </div>
      </div>
    </section>
    <section class="single-cooperation__workspace">
      <div class="single-cooperation__partners">
        <div class="single-cooperation__heading">
          <div class="single-cooperation__heading-title">
            <h2>合作人物</h2>
          </div>
        </div>
        <search-sort-toolbar
          class="ranking-toolbar partners-toolbar"
          :style="{
            '--search-sort-controls-grow': 0,
            '--search-sort-search-basis': '8rem',
            '--search-sort-filter-width': positionControlWidth,
          }"
          search=""
          sort="count"
          order="desc"
          :options="[{ label: workUnit === 'series' ? '系列数' : '作品数', value: 'count' }]"
          search-label="搜索合作人物"
          sort-label="合作人物排序规则"
          search-icon
          disabled
        >
          <template #filters="{ size }">
            <n-select v-if="positionKeys.length > 1" class="ranking-sort-control partners-position-control" value="all" :options="[{ label: '全部职位', value: 'all' }]" :size="size" :menu-size="size" disabled aria-label="按合作职位筛选" />
          </template>
        </search-sort-toolbar>
        <div class="partners-results-boundary ranked-person-results">
        <partners-skeleton :source="source" :scope="scope" :work-unit="workUnit" :position-label="positionLabel" :page-size="pageSize" section="rows" />
        </div>
      </div>
    </section>
  </article>
  <div v-else-if="section === 'summary'" class="single-cooperation__summary-grid partners-summary-skeleton" aria-hidden="true">
    <div v-for="label in leaderLabels" :key="label" class="single-cooperation__leader partners-leader-placeholder">
      <b><n-skeleton class="app-skeleton" width="36px" height="1lh" :sharp="false" /></b>
      <small>{{ label }}</small>
      <span class="single-cooperation__leader-person">
        <span class="single-cooperation__leader-avatar">
          <n-skeleton class="app-skeleton" width="100%" height="100%" :sharp="false" />
        </span>
        <strong><n-skeleton class="app-skeleton" width="78%" height="1lh" :sharp="false" /></strong>
      </span>
    </div>
  </div>
  <div v-else class="partners-row-skeletons">
    <ranking-list-skeleton :page-size="pageSize" :personal="personal" :work-unit="workUnit" show-positions />
  </div>
</template>

<style src="../partners.css"></style>
