<script setup lang="ts">
import { computed, watch } from 'vue'
import type { RankingMetric } from '../types'
import { useWorkbench } from '../composables/useWorkbench'
import { useMediaQuery } from '../composables/useMediaQuery'
import RankedPersonList from './RankedPersonList.vue'
import PersonInspector from './PersonInspector.vue'
import AppIcon from './AppIcon.vue'
import AdaptivePagination from './AdaptivePagination.vue'

const workbench = useWorkbench()
const isMobile = useMediaQuery('(max-width: 780px)')
const controlSize = 'medium' as const
const resultStatisticThemeOverrides = {
	valueFontSize: '20px',
}

const containDrawerWheel = (event: WheelEvent) => {
	if (!event.deltaY) return
	const scrollContainer = event.currentTarget
	if (!(scrollContainer instanceof HTMLElement)) return

	const maxScrollTop = scrollContainer.scrollHeight - scrollContainer.clientHeight
	const canScroll = event.deltaY < 0
		? scrollContainer.scrollTop > 0
		: scrollContainer.scrollTop < maxScrollTop - 1
	if (!canScroll) event.preventDefault()
	event.stopPropagation()
}

const drawerScrollbarProps = {
	containerStyle: { overscrollBehavior: 'contain' },
	onWheel: containDrawerWheel,
}

const sortOptions = computed<Array<{ label: string; value: RankingMetric }>>(() => [
	{ label: '作品数', value: 'count' },
	{ label: '我的均分', value: 'average' },
	{ label: '综合分', value: 'overall' },
	...(workbench.query.isGlobal ? [] : [{ label: '相对偏好', value: 'preference' as const }]),
])
const pageSizeOptions = [5, 10, 20, 50].map((value) => ({ label: `每页 ${value} 人`, value }))
const updateRankingPageSize = (value: number) => {
	workbench.rankingPageSize.value = value
	workbench.rankingPage.value = 1
}
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
		<aside class="ranking-pane" aria-label="人物排行">
			<div class="ranking-controls">
				<div class="ranking-result-stats" role="status" aria-live="polite">
					<n-flex :size="4" align="flex-end" :wrap="true">
						<n-statistic label="共统计到" tabular-nums :theme-overrides="resultStatisticThemeOverrides">
							<n-number-animation :from="0" :to="workbench.rankingPeople.value.length" />
							<template #suffix> 个人物，</template>
						</n-statistic>
						<n-statistic :label="'\u200B'" tabular-nums :theme-overrides="resultStatisticThemeOverrides">
							<n-number-animation :from="0" :to="workbench.queryScopeSubjectIds.value.size" />
							<template #suffix> 个条目</template>
						</n-statistic>
					</n-flex>
				</div>
				<n-input
					class="ranking-search"
					:size="controlSize"
					v-model:value="workbench.rankingSearch.value"
					clearable
					placeholder="搜索人物名、别名或 ID…"
					autocomplete="off"
					aria-label="搜索排行人物"
					:input-props="{ 'aria-label': '搜索排行人物', name: 'rankingSearch', spellcheck: 'false' }"
				>
					<template #prefix><AppIcon name="search" :size="16" /></template>
				</n-input>

				<div class="ranking-sort-field">
					<n-select aria-label="排序维度" :size="controlSize" v-model:value="workbench.rankingMetric.value" :options="sortOptions" />
				</div>
				<n-button
					class="ranking-sort-direction"
					:size="controlSize"
					secondary
					attr-type="button"
					:aria-label="workbench.rankingAscend.value ? '当前升序，切换为降序' : '当前降序，切换为升序'"
					@click="workbench.rankingAscend.value = !workbench.rankingAscend.value"
				>
					<template #icon><AppIcon class="sort-direction" name="chevron" :class="{ 'is-ascending': workbench.rankingAscend.value }" /></template>
					{{ workbench.rankingAscend.value ? '升序' : '降序' }}
				</n-button>
			</div>

			<div class="ranking-list-scroll">
				<div class="list-columns list-columns--ranking" aria-hidden="true">
					<span>#</span>
					<span />
					<span>人物</span>
					<span class="list-columns__metrics"><span>作品</span><span>均分</span><span>综合</span><span>偏好</span></span>
				</div>
				<RankedPersonList
					:items="workbench.rankingPageItems.value"
					variant="ranking"
					:rank-offset="rankOffset"
					empty-title="当前查询没有匹配人物"
					empty-description="请调整 UID、条目类型、职位或收藏范围。"
					@activate="activatePerson"
				/>
			</div>

			<footer>
				<AdaptivePagination
					:page="workbench.rankingPage.value"
					:page-size="workbench.rankingPageSize.value"
					:item-count="workbench.rankingPeople.value.length"
					:page-sizes="pageSizeOptions"
					:summary="`${rankRange.start}—${rankRange.end} / ${workbench.rankingPeople.value.length}`"
					aria-label="人物排行分页"
					@update:page="workbench.rankingPage.value = $event"
					@update:page-size="updateRankingPageSize"
				/>
			</footer>
		</aside>

		<section v-if="!isMobile" id="ranking-inspector" class="ranking-detail surface-panel" tabindex="-1" aria-label="人物详情">
			<PersonInspector />
		</section>

		<n-drawer
			v-if="isMobile"
			v-model:show="workbench.inspectorDrawerOpen.value"
			:block-scroll="true"
			class="ranking-inspector-drawer workbench-translucent-drawer"
			placement="bottom"
			height="min(92dvh, 800px)"
			aria-label="人物详情"
		>
			<!-- Special case: DrawerContent has no edge-to-edge body prop; use its public body-content-style API. -->
			<n-drawer-content
				:native-scrollbar="false"
				:scrollbar-props="drawerScrollbarProps"
				:closable="false"
				body-content-style="padding: 0;"
			>
				<div class="drawer-custom-heading drawer-custom-heading--inspector">
					<strong>人物详情</strong>
					<n-button size="medium" quaternary circle attr-type="button" aria-label="关闭人物详情" @click="workbench.inspectorDrawerOpen.value = false">
						<template #icon><AppIcon name="close" /></template>
					</n-button>
				</div>
				<div id="ranking-inspector"><PersonInspector /></div>
			</n-drawer-content>
		</n-drawer>
	</div>
</template>
