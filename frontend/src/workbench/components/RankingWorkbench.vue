<script setup lang="ts">
import { computed, watch } from 'vue'
import type { RankingMetric } from '../types'
import { useWorkbench } from '../composables/useWorkbench'
import { useWorkbenchControlSize } from '../composables/useWorkbenchControlSize'
import RankedPersonList from './RankedPersonList.vue'
import RankingListColumns from './RankingListColumns.vue'
import PersonInspector from './PersonInspector.vue'
import AdaptivePagination from './AdaptivePagination.vue'
import WorkListToolbar from './WorkListToolbar.vue'
import AppIcon from './AppIcon.vue'
import {
	getResultStatisticThemeOverrides,
	inspectorDrawerThemeOverrides,
	shellScrollbarThemeOverrides,
} from '../naiveThemeOverrides'

const workbench = useWorkbench()
const { controlSize, isMobile } = useWorkbenchControlSize()

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
	themeOverrides: shellScrollbarThemeOverrides,
	onWheel: containDrawerWheel,
}

const sortOptions = computed<Array<{ label: string; value: RankingMetric }>>(() => [
	{ label: '作品数', value: 'count' },
	{ label: '我的均分', value: 'average' },
	{ label: '综合分', value: 'overall' },
	...(workbench.query.isGlobal ? [] : [{ label: '相对偏好', value: 'preference' as const }]),
])
const pageSizeOptions = [5, 10, 20].map((value) => ({ label: `每页 ${value} 人`, value }))
const updateRankingPageSize = (value: number) => {
	workbench.rankingPageSize.value = value
	workbench.rankingPage.value = 1
}
const updateRankingMetric = (value: string) => {
	workbench.rankingMetric.value = value as RankingMetric
}
const rankOffset = computed(() => (workbench.rankingPage.value - 1) * workbench.rankingPageSize.value)
const isVoiceActorQuery = computed(() => workbench.rankingPositionIds.value.includes(102))
const resultStatisticThemeOverrides = computed(() => (
	getResultStatisticThemeOverrides(isVoiceActorQuery.value, isMobile.value)
))
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
					<n-flex
						class="ranking-result-stats__line"
						:size="isVoiceActorQuery ? 2 : 4"
						align="flex-end"
						:wrap="false"
					>
						<n-statistic label="共统计到" tabular-nums :theme-overrides="resultStatisticThemeOverrides">
							<n-number-animation :from="0" :to="workbench.rankingPeople.value.length" />
							<template #suffix> 个人物，</template>
						</n-statistic>
						<n-statistic :label="'\u200B'" tabular-nums :theme-overrides="resultStatisticThemeOverrides">
							<n-number-animation :from="0" :to="workbench.queryScopeSubjectIds.value.size" />
							<template #suffix> 个条目<template v-if="isVoiceActorQuery">，</template></template>
						</n-statistic>
						<n-statistic v-if="isVoiceActorQuery" :label="'\u200B'" tabular-nums :theme-overrides="resultStatisticThemeOverrides">
							<n-number-animation :from="0" :to="workbench.rankingCharacterCount.value" />
							<template #suffix> 个角色</template>
						</n-statistic>
					</n-flex>
				</div>
				<div class="ranking-toolbar">
					<WorkListToolbar
						:search="workbench.rankingSearch.value"
						:sort="workbench.rankingMetric.value"
						:order="workbench.rankingAscend.value ? 'asc' : 'desc'"
						:sort-options="sortOptions"
						search-placeholder="搜索人物或 ID"
						search-aria-label="搜索排行人物"
						sort-aria-label="人物排序规则"
						order-aria-label="人物排行排序方向"
						search-name="rankingSearch"
						@update:search="workbench.rankingSearch.value = $event"
						@update:sort="updateRankingMetric"
						@update:order="workbench.rankingAscend.value = $event === 'asc'"
					/>
				</div>
			</div>

			<div class="ranking-list-scroll">
				<RankingListColumns />
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
			show-mask="transparent"
			class="ranking-inspector-drawer workbench-translucent-drawer"
			:theme-overrides="inspectorDrawerThemeOverrides"
			style="border-radius: 0;"
			placement="bottom"
			height="calc(100dvh - var(--workbench-header-bar-height))"
			aria-label="人物详情"
		>
			<!-- Special case: DrawerContent has no edge-to-edge body prop; use its public body-content-style API. -->
			<n-drawer-content
				:native-scrollbar="false"
				:scrollbar-props="drawerScrollbarProps"
				:closable="false"
				header-style="background: transparent;"
				body-content-style="padding: 0;"
			>
				<template #header>
					<span class="ranking-inspector-drawer__header">
						<span class="ranking-inspector-drawer__title">人物详情</span>
						<span class="ranking-inspector-drawer__close-hit" @click="workbench.inspectorDrawerOpen.value = false">
							<n-button
								class="ranking-inspector-drawer__close"
								:size="controlSize"
								quaternary
								circle
								attr-type="button"
								aria-label="关闭人物详情"
								title="关闭人物详情"
								@click.stop="workbench.inspectorDrawerOpen.value = false"
							>
								<AppIcon name="close" :size="16" />
							</n-button>
						</span>
					</span>
				</template>
				<div id="ranking-inspector"><PersonInspector /></div>
			</n-drawer-content>
		</n-drawer>
	</div>
</template>
