<script setup lang="ts">
import { computed, watch } from 'vue'
import type { RankingMetric } from '../types'
import { useWorkbench } from '../composables/useWorkbench'
import { useMediaQuery } from '../composables/useMediaQuery'
import RankedPersonList from './RankedPersonList.vue'
import PersonInspector from './PersonInspector.vue'
import AppIcon from './AppIcon.vue'

const workbench = useWorkbench()
const isMobile = useMediaQuery('(max-width: 780px)')

const sortOptions: Array<{ label: string; value: RankingMetric }> = [
	{ label: '作品数', value: 'count' },
	{ label: '我的均分', value: 'average' },
	{ label: '综合分', value: 'overall' },
]
const pageSizeOptions = [5, 10, 20, 50]
const rankOffset = computed(() => (workbench.rankingPage.value - 1) * workbench.rankingPageSize.value)
const rankRange = computed(() => ({
	start: workbench.rankingPeople.value.length ? rankOffset.value + 1 : 0,
	end: Math.min(rankOffset.value + workbench.rankingPageSize.value, workbench.rankingPeople.value.length),
}))

const activatePerson = (personId: number) => {
	workbench.focusedPersonId.value = personId
	workbench.focusedWorkSearch.value = ''
	if (isMobile.value) workbench.inspectorDrawerOpen.value = true
}

watch(isMobile, (mobile) => {
	if (!mobile) workbench.inspectorDrawerOpen.value = false
})
</script>

<template>
	<div id="mode-panel-ranking" class="ranking-workbench" role="tabpanel" aria-labelledby="mode-tab-ranking">
		<aside class="ranking-pane surface-panel" aria-labelledby="ranking-list-title">
			<header class="pane-heading">
				<div>
					<span class="section-context">{{ workbench.positionLabel(workbench.query.positionId) }}</span>
					<h1 id="ranking-list-title">人物排行</h1>
				</div>
				<strong class="result-count">{{ workbench.rankingPeople.value.length }} 人</strong>
			</header>
			<div class="ranking-search">
				<n-input
					v-model:value="workbench.rankingSearch.value"
					clearable
					placeholder="搜索人物名、别名或 ID"
					aria-label="搜索排行人物"
					:input-props="{ 'aria-label': '搜索排行人物' }"
				>
					<template #prefix><AppIcon name="search" :size="16" /></template>
				</n-input>
			</div>

			<div class="pane-toolbar" aria-label="排行排序">
				<label>
					<span>排序维度</span>
					<n-select v-model:value="workbench.rankingMetric.value" :options="sortOptions" />
				</label>
				<button
					class="order-button"
					type="button"
					:aria-label="workbench.rankingAscend.value ? '当前升序，切换为降序' : '当前降序，切换为升序'"
					@click="workbench.rankingAscend.value = !workbench.rankingAscend.value"
				>
					<AppIcon class="sort-direction" name="chevron" :class="{ 'is-ascending': workbench.rankingAscend.value }" />
					{{ workbench.rankingAscend.value ? '升序' : '降序' }}
				</button>
			</div>

			<div class="list-columns list-columns--ranking" aria-hidden="true">
				<span>#</span>
				<span>人物</span>
				<span class="list-columns__metrics"><span>作品</span><span>均分</span><span>综合</span></span>
			</div>
			<RankedPersonList
				:items="workbench.rankingPageItems.value"
				variant="ranking"
				:rank-offset="rankOffset"
				empty-title="当前查询没有匹配人物"
				empty-description="请调整 UID、条目类型、职位或收藏范围。"
				@activate="activatePerson"
			/>

			<footer class="pane-pagination">
				<span class="ranking-page-summary">{{ rankRange.start }}—{{ rankRange.end }} / {{ workbench.rankingPeople.value.length }}</span>
				<n-pagination
					v-model:page="workbench.rankingPage.value"
					v-model:page-size="workbench.rankingPageSize.value"
					:page-count="workbench.rankingPageCount.value"
					:page-slot="5"
					:page-sizes="pageSizeOptions"
					show-size-picker
				/>
			</footer>
		</aside>

		<section v-if="!isMobile" id="ranking-inspector" class="ranking-detail surface-panel" tabindex="-1" aria-label="人物详情">
			<PersonInspector />
		</section>

		<n-drawer v-if="isMobile" v-model:show="workbench.inspectorDrawerOpen.value" placement="right" width="min(720px, 94vw)">
			<n-drawer-content body-content-style="padding: 0;">
				<template #header>
					<div class="drawer-custom-heading">
						<strong>人物详情</strong>
						<button class="icon-button" type="button" aria-label="关闭人物详情" @click="workbench.inspectorDrawerOpen.value = false">
							<AppIcon name="close" />
						</button>
					</div>
				</template>
				<div id="ranking-inspector"><PersonInspector /></div>
			</n-drawer-content>
		</n-drawer>
	</div>
</template>
