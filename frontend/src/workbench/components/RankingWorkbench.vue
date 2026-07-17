<script setup lang="ts">
import { computed, watch } from 'vue'
import type { RankingMetric } from '../types'
import { useWorkbench } from '../composables/useWorkbench'
import { useMediaQuery } from '../composables/useMediaQuery'
import RankedPersonList from './RankedPersonList.vue'
import PersonInspector from './PersonInspector.vue'
import AppIcon from './AppIcon.vue'
import AdaptivePagination from './AdaptivePagination.vue'
import SortDirectionButton from './SortDirectionButton.vue'

const workbench = useWorkbench()
const isMobile = useMediaQuery('(max-width: 780px)')
const controlSize = computed<'small' | 'medium'>(() => isMobile.value ? 'small' : 'medium')
const controlThemeOverrides = computed(() => isMobile.value
	? { common: { fontSizeSmall: '12px' } } // naive-size-token-exception: keep the native 28px small control height while applying the 12px mobile type spec.
	: undefined)
const selectThemeOverrides = computed(() => isMobile.value
	? {
		peers: {
			InternalSelection: { fontSizeSmall: '12px' }, // naive-size-token-exception: NSelect trigger text does not inherit the provider's common small font size.
			InternalSelectMenu: { optionFontSizeSmall: '12px' }, // naive-size-token-exception: keep expanded menu options aligned with the mobile toolbar type spec.
		},
	}
	: undefined)

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
const pageSizeOptions = [5, 10, 20].map((value) => ({ label: `每页 ${value} 人`, value }))
const inspectorDrawerThemeOverrides = {
	headerPadding: '12px 14px',
}
const updateRankingPageSize = (value: number) => {
	workbench.rankingPageSize.value = value
	workbench.rankingPage.value = 1
}
const rankOffset = computed(() => (workbench.rankingPage.value - 1) * workbench.rankingPageSize.value)
const isVoiceActorQuery = computed(() => workbench.rankingPositionIds.value.includes(102))
const resultStatisticThemeOverrides = computed(() => ({
	valueFontSize: isVoiceActorQuery.value
		? '16px'
		: (isMobile.value ? '18px' : '20px'),
}))
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
			<n-config-provider :theme-overrides="controlThemeOverrides">
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
				<n-input
					class="ranking-search"
					:size="controlSize"
					v-model:value="workbench.rankingSearch.value"
					:clearable="Boolean(workbench.rankingSearch.value)"
					placeholder="搜索人物名、别名或 ID…"
					autocomplete="off"
					aria-label="搜索排行人物"
					:input-props="{ 'aria-label': '搜索排行人物', name: 'rankingSearch', spellcheck: 'false' }"
				>
					<template #prefix><AppIcon name="search" :size="16" /></template>
				</n-input>

				<div class="ranking-sort-field">
					<n-select
						aria-label="排序维度"
						:size="controlSize"
						menu-size="small"
						v-model:value="workbench.rankingMetric.value"
						:options="sortOptions"
						:theme-overrides="selectThemeOverrides"
						:consistent-menu-width="false"
					/>
				</div>
				<SortDirectionButton
					class="ranking-sort-direction"
					:size="controlSize"
					:order="workbench.rankingAscend.value ? 'asc' : 'desc'"
					context-label="人物排行排序方向"
					@update:order="workbench.rankingAscend.value = $event === 'asc'"
				/>
				</div>
			</n-config-provider>

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
				closable
				header-style="background: transparent;"
				body-content-style="padding: 0;"
			>
				<template #header>
					<span class="ranking-inspector-drawer__title">人物详情</span>
				</template>
				<div id="ranking-inspector"><PersonInspector /></div>
			</n-drawer-content>
		</n-drawer>
	</div>
</template>
