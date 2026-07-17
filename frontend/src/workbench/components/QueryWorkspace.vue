<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { QueryPositionValue, WorkbenchMode } from '../types'
import { useWorkbench } from '../composables/useWorkbench'
import { useMediaQuery } from '../composables/useMediaQuery'
import AppIcon from './AppIcon.vue'

const workbench = useWorkbench()
const isMobile = useMediaQuery('(max-width: 780px)')
const controlSize = computed<'medium' | 'large'>(() => isMobile.value ? 'large' : 'medium')
const scopeControlSize = 'medium' as const
const collectionControlSize = 'medium' as const
const dynamicTagInputSize = 'small' as const
type FocusableControl = { focus: () => void }

const userInput = ref<FocusableControl>()
const subjectTypeInput = ref<FocusableControl>()
const positionInput = ref<FocusableControl>()
const dateStartInput = ref<FocusableControl>()
const collectionField = ref<HTMLFieldSetElement>()
const editorButton = ref<HTMLButtonElement>()
const queryOverlayTop = ref(0)
const expandedQuerySections = ref<string[]>([])

const containQueryWheel = (event: WheelEvent) => {
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

const toggleAdvancedSection = () => {
	expandedQuerySections.value = expandedQuerySections.value.includes('advanced') ? [] : ['advanced']
}

const subjectOptions = [
	{ label: '动画', value: 2 },
	{ label: '书籍', value: 1, disabled: true },
	{ label: '音乐', value: 3, disabled: true },
	{ label: '游戏', value: 4, disabled: true },
	{ label: '影视', value: 6, disabled: true },
]

const positionVocabulary: Record<number, string[]> = {
	1: ['作者', '出版社', '连载杂志', '文库', '插图', '人物原案', '脚本', '原作', '作画', '译者', '客串', '出品方', '文库品牌'],
	3: ['艺术家', '作曲', '编曲', '作词', '厂牌', '原作', '录音', '插图', '脚本', '制作人', '出版方', '乐器', '声乐', '母带制作', '混音'],
	4: ['声优（仅主役）', '声优', '开发', '发行', '游戏设计师', '剧本', '美工', '音乐', '关卡设计', '人物设定', '原画', '动画制作', '原作', '导演', '程序'],
	6: ['原作', '导演', '编剧', '音乐', '执行制片人', '制片人/制作人', '监制', '剪辑', '摄影', '主演', '配角', '制作', '出品'],
}

const collectionVocabulary: Record<number, [string, string]> = {
	1: ['看过', '在看'],
	2: ['看过', '在看'],
	3: ['听过', '在听'],
	4: ['玩过', '在玩'],
	6: ['看过', '在看'],
}

const advancedOptions = [
	{ key: 'showNSFW', title: '显示 NSFW 条目' },
	{ key: 'mergeSeries', title: '合并续作' },
	{ key: 'date', title: '播出时间范围' },
	{ key: 'rate', title: '分数范围' },
	{ key: 'favorite', title: '收藏人数范围' },
	{ key: 'positiveTags', title: '正向标签' },
	{ key: 'negativeTags', title: '反向标签' },
] as const

type AdvancedOptionKey = typeof advancedOptions[number]['key']
type ConditionKey = 'date' | 'rate' | 'favorite' | 'positiveTags' | 'negativeTags'
const visibleAdvancedOptions = computed(() => advancedOptions.filter((option) =>
	option.key !== 'mergeSeries' || workbench.queryDraft.subjectType === 2))

const positionOptionsFor = (subjectType: number): Array<{ label: string; value: QueryPositionValue }> => subjectType === 2
	? workbench.positions.value
	: (positionVocabulary[subjectType] ?? []).map((label) => ({ label, value: label }))

const draftPositionOptions = computed(() => positionOptionsFor(workbench.queryDraft.subjectType))
const subjectLabel = computed(() => subjectOptions.find((item) => item.value === workbench.query.subjectType)?.label ?? String(workbench.query.subjectType))
const activeMode = computed<WorkbenchMode>(() => workbench.mode.value)
const positionStageLabel = computed(() => activeMode.value === 'ranking' ? '排行职位' : '参与职位')
const activeAppliedPositions = computed(() => workbench.query.positionsByMode[activeMode.value])
type QueryErrorKind = 'userId' | 'subjectType' | 'collections' | 'positions' | 'date' | 'rate' | 'favorite' | ''
const advancedErrorKinds: QueryErrorKind[] = ['date', 'rate', 'favorite']
const queryErrorKind = computed<QueryErrorKind>(() => {
	const message = workbench.queryError.value
	if (!message) return ''
	if (message.includes('UID')) return 'userId'
	if (message.includes('条目类型')) return 'subjectType'
	if (message.includes('职位') || message.includes('身份')) return 'positions'
	if (message.includes('收藏类型')) return 'collections'
	if (message.includes('播出时间')) return 'date'
	if (message.includes('评分')) return 'rate'
	if (message.includes('收藏人数')) return 'favorite'
	return ''
})
const fieldError = (kind: string) => queryErrorKind.value === kind ? workbench.queryError.value : ''
const appliedPositionLabels = computed(() => activeAppliedPositions.value.map((value) =>
	positionOptionsFor(workbench.query.subjectType)
		.find((item) => String(item.value) === String(value))?.label ?? String(value)))
const draftPositions = computed<QueryPositionValue[]>({
	get: () => workbench.queryDraft.positionsByMode[activeMode.value],
	set: (value) => {
		workbench.queryDraft.positionsByMode[activeMode.value] = [...value]
		workbench.clearQueryFeedback()
	},
})

const collectionOptionsFor = (subjectType: number) => {
	const [done, doing] = collectionVocabulary[subjectType] ?? collectionVocabulary[2]
	return [
		{ label: done, value: 2 },
		{ label: doing, value: 3 },
		{ label: '搁置', value: 4 },
		{ label: '抛弃', value: 5 },
	]
}
const draftCollectionOptions = computed(() => collectionOptionsFor(workbench.queryDraft.subjectType))
const collectionLabel = computed(() => workbench.query.isGlobal
	? '全站口径'
	: workbench.query.collectionTypes
		.map((value) => collectionOptionsFor(workbench.query.subjectType).find((item) => item.value === value)?.label)
		.filter(Boolean)
		.join(' + ') || '未选择')

const summarizeRange = (label: string, [minimum, maximum]: [string, string]) => {
	const bounds = minimum && maximum
		? `${minimum}–${maximum}`
		: minimum ? `≥ ${minimum}` : maximum ? `≤ ${maximum}` : '不限'
	return `${label} ${bounds}`
}

const summarizeTags = (label: string, tags: string[]) => `${label} ${tags.length ? tags.join('、') : '未填写'}`

const appliedQuerySummary = computed(() => {
	const query = workbench.query
	const parts = [
		appliedPositionLabels.value.join(' + ') || '未选择职位',
		query.isGlobal ? '全站数据' : query.userId,
		subjectLabel.value,
	]

	if (!query.isGlobal) parts.push(collectionLabel.value)
	if (query.showNSFW) parts.push('含 NSFW')
	if (query.mergeSeries) parts.push('合并续作')
	if (query.date.enabled) parts.push(summarizeRange('播出时间', query.date.value))
	if (query.rate.enabled) parts.push(summarizeRange('评分', query.rate.value))
	if (query.favorite.enabled) parts.push(summarizeRange('收藏人数', query.favorite.value))
	if (query.positiveTags.enabled) parts.push(summarizeTags('正向标签', query.positiveTags.value))
	if (query.negativeTags.enabled) parts.push(summarizeTags('反向标签', query.negativeTags.value))

	return parts.join(' · ')
})

const draftDataSource = computed<'personal' | 'global'>({
	get: () => workbench.queryDraft.isGlobal ? 'global' : 'personal',
	set: (value) => {
		workbench.queryDraft.isGlobal = value === 'global'
		workbench.clearQueryFeedback()
	},
})

const numericRangeValue = (key: 'rate' | 'favorite', index: 0 | 1) => computed<number | null>({
	get: () => {
		const value = workbench.queryDraft[key].value[index]
		return value === '' ? null : Number(value)
	},
	set: (value) => {
		workbench.queryDraft[key].value[index] = value === null ? '' : String(value)
		workbench.clearQueryFeedback()
	},
})

const rateMin = numericRangeValue('rate', 0)
const rateMax = numericRangeValue('rate', 1)
const favoriteMin = numericRangeValue('favorite', 0)
const favoriteMax = numericRangeValue('favorite', 1)

const dateRangeValue = (index: 0 | 1) => computed<string | null>({
	get: () => workbench.queryDraft.date.value[index] || null,
	set: (value) => {
		workbench.queryDraft.date.value[index] = value ?? ''
		workbench.clearQueryFeedback()
	},
})

const dateStart = dateRangeValue(0)
const dateEnd = dateRangeValue(1)

const optionHasControl = (key: AdvancedOptionKey): key is ConditionKey =>
	key !== 'showNSFW' && key !== 'mergeSeries'

const optionEnabled = (key: AdvancedOptionKey) => optionHasControl(key)
	? workbench.queryDraft[key].enabled
	: workbench.queryDraft[key]

const toggleOption = (key: AdvancedOptionKey, enabled: boolean) => {
	if (!optionHasControl(key)) workbench.queryDraft[key] = enabled
	else workbench.queryDraft[key].enabled = enabled
	workbench.clearQueryFeedback()
}

watch(() => workbench.queryDraft.subjectType, (subjectType) => {
	if (subjectType !== 2) workbench.queryDraft.mergeSeries = false
	const options = positionOptionsFor(subjectType)
	const valid = new Set(options.map((option) => String(option.value)))
	for (const queryMode of ['ranking', 'co-star'] as WorkbenchMode[]) {
		const retained = workbench.queryDraft.positionsByMode[queryMode]
			.filter((value) => valid.has(String(value)))
		workbench.queryDraft.positionsByMode[queryMode] = retained.length
			? retained
			: options[0]?.value === undefined ? [] : [options[0].value]
	}
	workbench.clearQueryFeedback()
})

const syncQueryOverlayTop = () => {
	const bottom = editorButton.value?.getBoundingClientRect().bottom
	if (bottom !== undefined) queryOverlayTop.value = Math.ceil(bottom)
}

watch(() => workbench.queryEditing.value, async (editing) => {
	await nextTick()
	if (editing) syncQueryOverlayTop()
	else editorButton.value?.focus()
})

const openEditor = async () => {
	syncQueryOverlayTop()
	workbench.queryEditing.value = true
	workbench.clearQueryFeedback()
	await nextTick()
	const canAutoFocus = window.matchMedia('(min-width: 781px) and (pointer: fine)').matches
	if (canAutoFocus && !workbench.queryDraft.isGlobal) userInput.value?.focus()
}

onMounted(() => window.addEventListener('resize', syncQueryOverlayTop))
onBeforeUnmount(() => {
	window.removeEventListener('resize', syncQueryOverlayTop)
})

const closeEditor = () => {
	if (workbench.queryLoading.value) return
	workbench.queryEditing.value = false
}

const focusFirstInvalidField = async () => {
	await nextTick()
	if (queryErrorKind.value === 'userId') userInput.value?.focus()
	else if (queryErrorKind.value === 'subjectType') subjectTypeInput.value?.focus()
	else if (queryErrorKind.value === 'positions') positionInput.value?.focus()
	else if (queryErrorKind.value === 'collections') collectionField.value?.querySelector<HTMLElement>('[role="checkbox"]')?.focus()
	else if (queryErrorKind.value) {
		if (advancedErrorKinds.includes(queryErrorKind.value) && !expandedQuerySections.value.includes('advanced')) {
			expandedQuerySections.value = ['advanced']
			await nextTick()
		}
		if (queryErrorKind.value === 'date') dateStartInput.value?.focus()
		else document.querySelector<HTMLInputElement>(`input[name="${queryErrorKind.value}Min"]`)?.focus()
	}
}

const submitEditor = () => {
	const accepted = workbench.applyQuery()
	if (!accepted) focusFirstInvalidField()
}

const conditionTitle = (key: ConditionKey) => ({
	date: '播出时间',
	rate: '评分',
	favorite: '收藏人数',
	positiveTags: '正向标签',
	negativeTags: '反向标签',
})[key]
</script>

<template>
	<section class="query-workspace" :aria-labelledby="workbench.queryEditing.value ? 'query-editor-title' : 'query-title'">
		<h1 v-if="!workbench.queryEditing.value" id="query-title" class="sr-only">当前查询</h1>
		<button
			ref="editorButton"
			class="query-summary header-edit-card"
			:class="{ 'is-editing': workbench.queryEditing.value }"
			type="button"
			:aria-label="workbench.queryEditing.value ? '收起查询条件' : `编辑查询条件：${appliedQuerySummary}`"
			:aria-expanded="workbench.queryEditing.value"
			aria-controls="query-editor"
			@click="workbench.queryEditing.value ? closeEditor() : openEditor()"
		>
			<template v-if="workbench.queryEditing.value">
				<span id="query-editor-title" class="query-editor__title" role="heading" aria-level="2">编辑查询</span>
				<span class="query-editor__collapse header-edit-card__action" aria-hidden="true">
					<AppIcon name="chevron" :size="18" />
				</span>
			</template>
			<template v-else>
				<span class="query-summary__stages">
					<span class="query-summary__stage">
						<span class="query-summary__stage-copy">
							<strong class="mobile-header-context-summary">{{ appliedQuerySummary }}</strong>
						</span>
					</span>
				</span>
				<span class="query-summary__action header-edit-card__action" aria-hidden="true">
					<AppIcon name="edit" :size="18" />
				</span>
			</template>
		</button>

		<Teleport to="body">
		<Transition name="query-panel">
		<div v-if="workbench.queryEditing.value" class="query-editor-overlay" :style="{ '--query-overlay-top': `${queryOverlayTop}px` }">
		<form id="query-editor" class="query-editor" novalidate aria-labelledby="query-editor-title" @submit.prevent="submitEditor" @input="workbench.clearQueryFeedback" @keydown.esc.stop.prevent="closeEditor">
			<div class="query-editor__scroll" @wheel="containQueryWheel">
				<div class="query-editor__stages">
				<section class="query-stage query-stage--scope" aria-labelledby="query-scope-stage-title">
					<header class="query-stage__heading">
						<span class="query-stage-index" aria-hidden="true">1</span>
						<div>
							<h2 id="query-scope-stage-title">作品范围</h2>
						</div>
					</header>

					<div class="query-scope-fields">
						<fieldset class="field field--source query-source-field">
							<legend>数据来源</legend>
							<n-radio-group class="query-source-switch" v-model:value="draftDataSource" name="queryDataSource" :size="scopeControlSize" :disabled="workbench.queryLoading.value">
								<n-radio-button class="query-source-option" value="personal" aria-label="从个人收藏中查询"><span class="query-source-option__label">个人收藏</span></n-radio-button>
								<n-radio-button class="query-source-option" value="global" aria-label="从全站数据中查询"><span class="query-source-option__label">全站数据</span></n-radio-button>
							</n-radio-group>
						</fieldset>
						<div v-if="!workbench.queryDraft.isGlobal" class="field field--uid" :class="{ 'is-error': queryErrorKind === 'userId' }">
							<div class="field-label-row">
								<label for="query-user-id">用户 UID</label>
								<n-tooltip placement="top" trigger="hover">
									<template #trigger>
										<button class="field-help-button" type="button" aria-label="什么是用户 UID" title="什么是用户 UID">
											<AppIcon name="info" :size="16" />
										</button>
									</template>
									UID 是 Bangumi 个人主页地址中 /user/ 后的标识，不是昵称。
								</n-tooltip>
							</div>
							<n-input ref="userInput" v-model:value="workbench.queryDraft.userId" :size="scopeControlSize" placeholder="例如 lucay126" autocomplete="off" clearable :status="queryErrorKind === 'userId' ? 'error' : undefined" :input-props="{ id: 'query-user-id', name: 'userId', spellcheck: 'false', 'aria-invalid': queryErrorKind === 'userId', 'aria-describedby': queryErrorKind === 'userId' ? 'query-user-id-help query-error-userId' : 'query-user-id-help' }" :disabled="workbench.queryLoading.value" />
							<small id="query-user-id-help" class="sr-only">UID 是 Bangumi 个人主页地址中 /user/ 后的标识，不是昵称。</small>
							<small v-if="fieldError('userId')" id="query-error-userId" class="query-field-error">{{ fieldError('userId') }}</small>
						</div>
						<label class="field" :class="{ 'is-error': queryErrorKind === 'subjectType' }">
							<span>条目类型</span>
							<n-select ref="subjectTypeInput" v-model:value="workbench.queryDraft.subjectType" :size="scopeControlSize" :options="subjectOptions" :status="queryErrorKind === 'subjectType' ? 'error' : undefined" :input-props="{ name: 'subjectType', 'aria-invalid': queryErrorKind === 'subjectType', 'aria-describedby': queryErrorKind === 'subjectType' ? 'query-error-subjectType' : undefined }" :disabled="workbench.queryLoading.value" />
							<small v-if="fieldError('subjectType')" id="query-error-subjectType" class="query-field-error">{{ fieldError('subjectType') }}</small>
						</label>
						<fieldset v-if="!workbench.queryDraft.isGlobal" ref="collectionField" class="field field--collections" :class="{ 'is-error': queryErrorKind === 'collections' }" :disabled="workbench.queryLoading.value" :aria-invalid="queryErrorKind === 'collections'" :aria-describedby="queryErrorKind === 'collections' ? 'query-error-collections' : undefined">
							<legend>收藏类型</legend>
							<div class="query-collection-control">
								<n-checkbox-group v-model:value="workbench.queryDraft.collectionTypes" @update:value="workbench.clearQueryFeedback">
									<n-space :size="12" wrap>
										<n-checkbox v-for="option in draftCollectionOptions" :key="option.value" :size="collectionControlSize" :value="option.value" :label="option.label" />
									</n-space>
								</n-checkbox-group>
							</div>
							<small v-if="fieldError('collections')" id="query-error-collections" class="query-field-error">{{ fieldError('collections') }}</small>
						</fieldset>
					</div>

					<n-collapse v-model:expanded-names="expandedQuerySections" class="query-advanced-collapse" arrow-placement="right">
						<n-collapse-item name="advanced" title="更多选项" :disabled="workbench.queryLoading.value">
							<template #header="{ collapsed }">
								<button
									class="query-advanced-collapse__trigger"
									type="button"
									:disabled="workbench.queryLoading.value"
									:aria-expanded="!collapsed"
									aria-controls="query-advanced-options"
									@click.stop="toggleAdvancedSection"
									@keydown.enter.prevent.stop="toggleAdvancedSection"
									@keydown.space.prevent.stop="toggleAdvancedSection"
								>
									更多选项
								</button>
							</template>
							<div id="query-advanced-options" class="query-advanced-options" aria-label="更多查询选项">
								<div v-for="option in visibleAdvancedOptions" :key="option.key" class="query-advanced-item" :class="{ 'has-control': optionHasControl(option.key) && optionEnabled(option.key) }">
									<div class="query-advanced-option">
										<strong>{{ option.title }}</strong>
										<span class="query-advanced-switch">
											<n-switch
												:size="scopeControlSize"
												:value="optionEnabled(option.key)"
												:aria-label="option.title"
												:disabled="workbench.queryLoading.value"
												@update:value="toggleOption(option.key, $event)"
											/>
										</span>
									</div>
									<fieldset v-if="optionHasControl(option.key) && optionEnabled(option.key)" class="field query-advanced-control" :class="{ 'is-error': queryErrorKind === option.key }" :disabled="workbench.queryLoading.value">
										<legend class="sr-only">{{ conditionTitle(option.key) }}</legend>
										<template v-if="option.key === 'date'">
											<div class="query-range-control">
												<label class="query-range-field">
													<span class="sr-only">播出时间起点</span>
													<n-date-picker
														ref="dateStartInput"
														class="query-month-picker"
														v-model:formatted-value="dateStart"
														type="month"
														format="yyyy-MM"
														value-format="yyyy-MM"
														:size="scopeControlSize"
														:status="queryErrorKind === 'date' ? 'error' : undefined"
														:disabled="workbench.queryLoading.value"
														placeholder="最早时间"
														clearable
														update-value-on-close
													/>
												</label>
												<span class="query-range-control__separator" aria-hidden="true">—</span>
												<label class="query-range-field">
													<span class="sr-only">播出时间终点</span>
													<n-date-picker
														class="query-month-picker"
														v-model:formatted-value="dateEnd"
														type="month"
														format="yyyy-MM"
														value-format="yyyy-MM"
														:size="scopeControlSize"
														:status="queryErrorKind === 'date' ? 'error' : undefined"
														:disabled="workbench.queryLoading.value"
														placeholder="最晚时间"
														clearable
														update-value-on-close
													/>
												</label>
											</div>
										</template>
										<template v-else-if="option.key === 'rate'">
											<div class="query-range-control">
												<n-input-number
													v-model:value="rateMin"
													:size="scopeControlSize"
													:min="0"
													:max="10"
													:step="0.5"
													:status="queryErrorKind === 'rate' ? 'error' : undefined"
													:disabled="workbench.queryLoading.value"
													:input-props="{ name: 'rateMin', inputmode: 'decimal', 'aria-label': '评分下限', 'aria-invalid': queryErrorKind === 'rate', 'aria-describedby': queryErrorKind === 'rate' ? 'query-error-rate' : undefined }"
													placeholder="最低分"
													clearable
													button-placement="both"
												/>
												<span class="query-range-control__separator" aria-hidden="true">—</span>
												<n-input-number
													v-model:value="rateMax"
													:size="scopeControlSize"
													:min="0"
													:max="10"
													:step="0.5"
													:status="queryErrorKind === 'rate' ? 'error' : undefined"
													:disabled="workbench.queryLoading.value"
													:input-props="{ name: 'rateMax', inputmode: 'decimal', 'aria-label': '评分上限', 'aria-invalid': queryErrorKind === 'rate', 'aria-describedby': queryErrorKind === 'rate' ? 'query-error-rate' : undefined }"
													placeholder="最高分"
													clearable
													button-placement="both"
												/>
											</div>
										</template>
										<template v-else-if="option.key === 'favorite'">
											<div class="query-range-control">
												<n-input-number
													v-model:value="favoriteMin"
													:size="scopeControlSize"
													:min="0"
													:step="100"
													:status="queryErrorKind === 'favorite' ? 'error' : undefined"
													:disabled="workbench.queryLoading.value"
													:input-props="{ name: 'favoriteMin', inputmode: 'numeric', 'aria-label': '收藏人数下限', 'aria-invalid': queryErrorKind === 'favorite', 'aria-describedby': queryErrorKind === 'favorite' ? 'query-error-favorite' : undefined }"
													placeholder="最低收藏数"
													clearable
													button-placement="both"
												/>
												<span class="query-range-control__separator" aria-hidden="true">—</span>
												<n-input-number
													v-model:value="favoriteMax"
													:size="scopeControlSize"
													:min="0"
													:step="100"
													:status="queryErrorKind === 'favorite' ? 'error' : undefined"
													:disabled="workbench.queryLoading.value"
													:input-props="{ name: 'favoriteMax', inputmode: 'numeric', 'aria-label': '收藏人数上限', 'aria-invalid': queryErrorKind === 'favorite', 'aria-describedby': queryErrorKind === 'favorite' ? 'query-error-favorite' : undefined }"
													placeholder="最高收藏数"
													clearable
													button-placement="both"
												/>
											</div>
										</template>
									<n-dynamic-tags
										v-else-if="option.key === 'positiveTags'"
										v-model:value="workbench.queryDraft.positiveTags.value"
										:size="scopeControlSize"
										:disabled="workbench.queryLoading.value"
										:input-props="{ placeholder: '输入标签后回车', inputProps: { 'aria-label': '新增正向标签' } }"
										:input-style="{ minWidth: '160px' }"
										aria-label="正向标签"
										type="primary"
										round
									>
										<template #trigger="{ activate, disabled }">
											<n-button
												:size="dynamicTagInputSize"
												type="primary"
												secondary
												attr-type="button"
												:disabled="disabled"
												aria-label="添加正向标签"
												@click="activate"
											>
												<template #icon><AppIcon name="plus" :size="16" /></template>
												添加标签
											</n-button>
										</template>
									</n-dynamic-tags>
									<n-dynamic-tags
										v-else
										v-model:value="workbench.queryDraft.negativeTags.value"
										:size="scopeControlSize"
										:disabled="workbench.queryLoading.value"
										:input-props="{ placeholder: '输入标签后回车', inputProps: { 'aria-label': '新增反向标签' } }"
										:input-style="{ minWidth: '160px' }"
										aria-label="反向标签"
										type="primary"
										round
									>
										<template #trigger="{ activate, disabled }">
											<n-button
												:size="dynamicTagInputSize"
												type="primary"
												secondary
												attr-type="button"
												:disabled="disabled"
												aria-label="添加反向标签"
												@click="activate"
											>
												<template #icon><AppIcon name="plus" :size="16" /></template>
												添加标签
											</n-button>
										</template>
									</n-dynamic-tags>
										<small v-if="fieldError(option.key)" :id="`query-error-${option.key}`" class="query-field-error">{{ fieldError(option.key) }}</small>
									</fieldset>
							</div>
						</div>
						</n-collapse-item>
					</n-collapse>
				</section>

				<section class="query-stage query-stage--positions" aria-labelledby="query-position-stage-title">
					<header class="query-stage__heading">
						<span class="query-stage-index" aria-hidden="true">2</span>
						<div>
							<h2 id="query-position-stage-title">{{ positionStageLabel }}</h2>
						</div>
					</header>
					<div class="field field--positions" :class="{ 'is-error': queryErrorKind === 'positions' }">
						<span id="query-position-control-label">{{ workbench.mode.value === 'ranking' ? '可多选；仅保留同时具备全部所选职位的人物' : '可多选；选择参与共同分析的职位' }}</span>
						<n-select
							ref="positionInput"
							v-model:value="draftPositions"
							:size="controlSize"
							:options="draftPositionOptions"
							multiple
							filterable
							max-tag-count="responsive"
							:status="queryErrorKind === 'positions' ? 'error' : undefined"
							:input-props="{ name: `${workbench.mode.value}Positions`, 'aria-labelledby': 'query-position-control-label', 'aria-invalid': queryErrorKind === 'positions', 'aria-describedby': queryErrorKind === 'positions' ? 'query-error-positions' : undefined }"
							:disabled="workbench.queryLoading.value"
							:placeholder="workbench.mode.value === 'ranking' ? '选择排行职位…' : '选择参与职位…'"
						/>
						<small v-if="fieldError('positions')" id="query-error-positions" class="query-field-error">{{ fieldError('positions') }}</small>
					</div>
				</section>
				</div>

				<p v-if="workbench.queryError.value && !queryErrorKind" class="query-error" role="alert">{{ workbench.queryError.value }}</p>

				<div class="query-editor__footer">
					<span role="status" aria-live="polite">{{ workbench.queryDraftStatus.value }}</span>
					<n-space class="query-editor__actions" :size="8" justify="end" wrap>
						<n-button :size="controlSize" attr-type="button" :disabled="!workbench.queryDraftDirty.value || workbench.queryLoading.value" @click="workbench.restoreQuery">撤销更改</n-button>
						<n-button :size="controlSize" attr-type="button" :disabled="!workbench.queryLoading.value" @click="workbench.cancelQuery">取消查询</n-button>
						<n-button :size="controlSize" type="primary" attr-type="submit" :loading="workbench.queryLoading.value" :disabled="workbench.queryLoading.value">{{ workbench.queryLoading.value ? '查询中…' : '应用并查询' }}</n-button>
					</n-space>
				</div>
			</div>
		</form>
		</div>
		</Transition>
		</Teleport>
	</section>
</template>
