<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { QueryPositionValue, WorkbenchMode } from '../types'
import { useWorkbench } from '../composables/useWorkbench'
import AppIcon from './AppIcon.vue'

const workbench = useWorkbench()
type FocusableControl = { focus: () => void }

const userInput = ref<FocusableControl>()
const subjectTypeInput = ref<FocusableControl>()
const positionInput = ref<FocusableControl>()
const collectionField = ref<HTMLFieldSetElement>()
const editorButton = ref<HTMLButtonElement>()
const moreOptionsOpen = ref(false)

const subjectOptions = [
	{ label: '动画', value: 2 },
	{ label: '书籍（静态快照未载入）', value: 1, disabled: true },
	{ label: '音乐（静态快照未载入）', value: 3, disabled: true },
	{ label: '游戏（静态快照未载入）', value: 4, disabled: true },
	{ label: '影视（静态快照未载入）', value: 6, disabled: true },
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
	{ key: 'isGlobal', title: '全站口径模拟', description: '使用当前静态数据切换到 Bangumi 全站评分口径。' },
	{ key: 'showNSFW', title: '显示 NSFW 条目', description: '包含在 Bangumi 标记为 NSFW 的条目。' },
	{ key: 'date', title: '播出时间范围', description: '按条目播出、出版或发行月份筛选。' },
	{ key: 'rate', title: '分数范围', description: '个人模式使用我的评分，全站模式使用全站评分。' },
	{ key: 'favorite', title: '收藏人数范围', description: '按条目的 Bangumi 收藏人数筛选。' },
	{ key: 'positiveTags', title: '正向标签', description: '逗号表示“且”，单项内“/”表示“或”。' },
	{ key: 'negativeTags', title: '反向标签', description: '逗号分别排除，单项内“+”表示“与”。' },
] as const

type AdvancedOptionKey = typeof advancedOptions[number]['key']
type ConditionKey = 'date' | 'rate' | 'favorite' | 'positiveTags' | 'negativeTags'

const positionOptionsFor = (subjectType: number): Array<{ label: string; value: QueryPositionValue }> => subjectType === 2
	? workbench.positions.value
	: (positionVocabulary[subjectType] ?? []).map((label) => ({ label, value: label }))

const draftPositionOptions = computed(() => positionOptionsFor(workbench.queryDraft.subjectType))
const subjectLabel = computed(() => subjectOptions.find((item) => item.value === workbench.query.subjectType)?.label ?? String(workbench.query.subjectType))
const activeMode = computed<WorkbenchMode>(() => workbench.mode.value)
const positionStageLabel = computed(() => activeMode.value === 'ranking' ? '排行职位' : '参与职位')
const positionStageHint = computed(() => activeMode.value === 'ranking' ? '本次排行使用 1 个职位' : '可选择 1 个或多个职位')
const activeAppliedPositions = computed(() => workbench.query.positionsByMode[activeMode.value])
const activeDraftPositions = computed(() => workbench.queryDraft.positionsByMode[activeMode.value])
type QueryErrorKind = 'userId' | 'subjectType' | 'collections' | 'positions' | 'date' | 'rate' | 'favorite' | ''
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
const rankingDraftPosition = computed<QueryPositionValue | null>({
	get: () => workbench.queryDraft.positionsByMode.ranking[0] ?? null,
	set: (value) => {
		workbench.queryDraft.positionsByMode.ranking = value === null ? [] : [value]
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

const advancedCount = computed(() => Number(workbench.query.showNSFW)
	+ (['date', 'rate', 'favorite', 'positiveTags', 'negativeTags'] as ConditionKey[])
		.filter((key) => workbench.query[key].enabled).length)
const enabledConditions = computed(() => (['date', 'rate', 'favorite', 'positiveTags', 'negativeTags'] as ConditionKey[])
	.filter((key) => workbench.queryDraft[key].enabled))

const positiveTagsText = computed({
	get: () => workbench.queryDraft.positiveTags.value.join(', '),
	set: (value: string) => {
		workbench.queryDraft.positiveTags.value = value.split(',').map((tag) => tag.trim()).filter(Boolean)
	},
})
const negativeTagsText = computed({
	get: () => workbench.queryDraft.negativeTags.value.join(', '),
	set: (value: string) => {
		workbench.queryDraft.negativeTags.value = value.split(',').map((tag) => tag.trim()).filter(Boolean)
	},
})

const optionEnabled = (key: AdvancedOptionKey) => key === 'isGlobal' || key === 'showNSFW'
	? workbench.queryDraft[key]
	: workbench.queryDraft[key].enabled

const toggleOption = (key: AdvancedOptionKey, enabled: boolean) => {
	if (key === 'isGlobal' || key === 'showNSFW') workbench.queryDraft[key] = enabled
	else workbench.queryDraft[key].enabled = enabled
	workbench.clearQueryFeedback()
}

const removeCondition = (key: ConditionKey) => {
	workbench.queryDraft[key].enabled = false
	workbench.clearQueryFeedback()
}

watch(() => workbench.queryDraft.subjectType, (subjectType) => {
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

watch(() => workbench.queryEditing.value, async (editing) => {
	if (editing) return
	await nextTick()
	editorButton.value?.focus()
})

const openEditor = async () => {
	workbench.queryEditing.value = true
	workbench.clearQueryFeedback()
	await nextTick()
	const canAutoFocus = window.matchMedia('(min-width: 781px) and (pointer: fine)').matches
	if (canAutoFocus && !workbench.queryDraft.isGlobal) userInput.value?.focus()
}

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
	else if (queryErrorKind.value) document.querySelector<HTMLInputElement>(`input[name="${queryErrorKind.value}${queryErrorKind.value === 'date' ? 'Start' : 'Min'}"]`)?.focus()
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
	<section class="query-workspace surface-panel" aria-labelledby="query-title">
		<div v-if="!workbench.queryEditing.value" class="query-summary" tabindex="-1">
			<div class="query-summary__title">
				<h1 id="query-title">当前查询</h1>
				<span role="status">{{ workbench.queryStatus.value }}</span>
			</div>
			<div class="query-summary__stages" aria-label="已应用查询">
				<div class="query-summary__stage">
					<span class="query-stage-index" aria-hidden="true">1</span>
					<span class="query-summary__stage-copy">
						<small>作品范围</small>
						<strong>
							{{ workbench.query.isGlobal ? '全站口径' : `个人收藏 · ${workbench.query.userId}` }} · {{ subjectLabel }} · {{ collectionLabel }}<template v-if="advancedCount"> · {{ advancedCount }} 项高级条件</template>
						</strong>
					</span>
				</div>
				<div class="query-summary__stage query-summary__stage--positions">
					<span class="query-stage-index" aria-hidden="true">2</span>
					<span class="query-summary__stage-copy">
						<small>{{ positionStageLabel }}</small>
						<strong>{{ appliedPositionLabels.join(' + ') || '未选择' }}</strong>
					</span>
				</div>
			</div>
			<button ref="editorButton" class="query-summary__edit" type="button" aria-expanded="false" aria-controls="query-editor" @click="openEditor">
				<AppIcon name="edit" :size="16" />
				修改查询
			</button>
		</div>

		<form v-else id="query-editor" class="query-editor" novalidate @submit.prevent="submitEditor" @input="workbench.clearQueryFeedback">
			<div class="query-editor__head">
				<div>
					<span class="section-context">{{ workbench.mode.value === 'ranking' ? '人物排行' : '共同参与分析' }}</span>
					<h1 id="query-title">编辑查询</h1>
				</div>
				<button class="icon-button" type="button" aria-label="收起查询编辑器" :disabled="workbench.queryLoading.value" @click="closeEditor">
					<AppIcon name="close" />
				</button>
			</div>

			<div class="query-editor__stages">
				<section class="query-stage query-stage--scope" aria-labelledby="query-scope-stage-title">
					<header class="query-stage__heading">
						<span class="query-stage-index" aria-hidden="true">1</span>
						<div>
							<h2 id="query-scope-stage-title">作品范围</h2>
							<span>确定参与统计的收藏作品</span>
						</div>
					</header>

					<div class="query-scope-fields">
						<label class="field" :class="{ 'is-error': queryErrorKind === 'userId' }">
							<span>用户 UID <small title="UID 是 Bangumi 个人主页链接的最后一段">（不是昵称）</small></span>
							<n-input ref="userInput" v-model:value="workbench.queryDraft.userId" placeholder="例如 lucay126…" autocomplete="off" clearable :status="queryErrorKind === 'userId' ? 'error' : undefined" :input-props="{ name: 'userId', spellcheck: 'false', 'aria-invalid': queryErrorKind === 'userId', 'aria-describedby': queryErrorKind === 'userId' ? 'query-error-userId' : undefined }" :disabled="workbench.queryDraft.isGlobal || workbench.queryLoading.value" />
							<small v-if="fieldError('userId')" id="query-error-userId" class="query-field-error">{{ fieldError('userId') }}</small>
						</label>
						<label class="field" :class="{ 'is-error': queryErrorKind === 'subjectType' }">
							<span>条目类型</span>
							<n-select ref="subjectTypeInput" v-model:value="workbench.queryDraft.subjectType" :options="subjectOptions" :status="queryErrorKind === 'subjectType' ? 'error' : undefined" :input-props="{ name: 'subjectType', 'aria-invalid': queryErrorKind === 'subjectType', 'aria-describedby': queryErrorKind === 'subjectType' ? 'query-error-subjectType' : undefined }" :disabled="workbench.queryLoading.value" />
							<small v-if="fieldError('subjectType')" id="query-error-subjectType" class="query-field-error">{{ fieldError('subjectType') }}</small>
						</label>
						<fieldset ref="collectionField" class="field field--collections" :class="{ 'is-error': queryErrorKind === 'collections' }" :disabled="workbench.queryDraft.isGlobal || workbench.queryLoading.value" :aria-invalid="queryErrorKind === 'collections'" :aria-describedby="queryErrorKind === 'collections' ? 'query-error-collections' : undefined">
							<legend>收藏类型</legend>
							<n-checkbox-group v-model:value="workbench.queryDraft.collectionTypes" @update:value="workbench.clearQueryFeedback">
								<n-space :size="12" wrap>
									<n-checkbox v-for="option in draftCollectionOptions" :key="option.value" :value="option.value" :label="option.label" />
								</n-space>
							</n-checkbox-group>
							<small v-if="fieldError('collections')" id="query-error-collections" class="query-field-error">{{ fieldError('collections') }}</small>
						</fieldset>
					</div>

					<div class="query-editor__more">
						<n-button
							id="query-more-options"
							attr-type="button"
							:disabled="workbench.queryLoading.value"
							:aria-expanded="moreOptionsOpen"
							aria-controls="query-advanced-options"
							@click="moreOptionsOpen = !moreOptionsOpen"
						>
							更多选项
							<AppIcon class="query-more-options__chevron" name="chevron" :size="15" :class="{ 'is-open': moreOptionsOpen }" />
						</n-button>
					</div>

					<div v-show="moreOptionsOpen" id="query-advanced-options" class="query-advanced-options" aria-label="更多查询选项">
						<div v-for="option in advancedOptions" :key="option.key" class="query-advanced-option">
							<div>
								<strong>{{ option.title }}</strong>
								<p>{{ option.description }}</p>
							</div>
							<n-switch :value="optionEnabled(option.key)" :aria-label="option.title" @update:value="toggleOption(option.key, $event)" />
						</div>
					</div>

					<div v-if="enabledConditions.length" class="query-condition-fields" aria-label="已启用高级条件">
						<fieldset v-for="key in enabledConditions" :key="key" class="field" :class="{ 'is-error': queryErrorKind === key }" :disabled="workbench.queryLoading.value">
							<legend>
								{{ conditionTitle(key) }}
								<n-button text size="tiny" attr-type="button" :aria-label="`关闭${conditionTitle(key)}`" @click="removeCondition(key)">移除</n-button>
							</legend>
							<template v-if="key === 'date'">
								<n-space :wrap="false" align="center">
									<n-input v-model:value="workbench.queryDraft.date.value[0]" autocomplete="off" :status="queryErrorKind === 'date' ? 'error' : undefined" :input-props="{ type: 'month', 'aria-label': '播出时间起点', name: 'dateStart', 'aria-invalid': queryErrorKind === 'date', 'aria-describedby': queryErrorKind === 'date' ? 'query-error-date' : undefined }" placeholder="例如 2020-01…" />
									<span aria-hidden="true">—</span>
									<n-input v-model:value="workbench.queryDraft.date.value[1]" autocomplete="off" :status="queryErrorKind === 'date' ? 'error' : undefined" :input-props="{ type: 'month', 'aria-label': '播出时间终点', name: 'dateEnd', 'aria-invalid': queryErrorKind === 'date', 'aria-describedby': queryErrorKind === 'date' ? 'query-error-date' : undefined }" placeholder="例如 2026-12…" />
								</n-space>
							</template>
							<template v-else-if="key === 'rate'">
								<n-space :wrap="false" align="center">
									<n-input v-model:value="workbench.queryDraft.rate.value[0]" autocomplete="off" :status="queryErrorKind === 'rate' ? 'error' : undefined" :input-props="{ type: 'number', min: 0, max: 10, step: 0.1, 'aria-label': '评分下限', name: 'rateMin', 'aria-invalid': queryErrorKind === 'rate', 'aria-describedby': queryErrorKind === 'rate' ? 'query-error-rate' : undefined }" placeholder="例如 6…" />
									<span aria-hidden="true">—</span>
									<n-input v-model:value="workbench.queryDraft.rate.value[1]" autocomplete="off" :status="queryErrorKind === 'rate' ? 'error' : undefined" :input-props="{ type: 'number', min: 0, max: 10, step: 0.1, 'aria-label': '评分上限', name: 'rateMax', 'aria-invalid': queryErrorKind === 'rate', 'aria-describedby': queryErrorKind === 'rate' ? 'query-error-rate' : undefined }" placeholder="例如 10…" />
								</n-space>
							</template>
							<template v-else-if="key === 'favorite'">
								<n-space :wrap="false" align="center">
									<n-input v-model:value="workbench.queryDraft.favorite.value[0]" autocomplete="off" :status="queryErrorKind === 'favorite' ? 'error' : undefined" :input-props="{ type: 'number', min: 0, step: 1, 'aria-label': '收藏人数下限', name: 'favoriteMin', 'aria-invalid': queryErrorKind === 'favorite', 'aria-describedby': queryErrorKind === 'favorite' ? 'query-error-favorite' : undefined }" placeholder="例如 100…" />
									<span aria-hidden="true">—</span>
									<n-input v-model:value="workbench.queryDraft.favorite.value[1]" autocomplete="off" :status="queryErrorKind === 'favorite' ? 'error' : undefined" :input-props="{ type: 'number', min: 0, step: 1, 'aria-label': '收藏人数上限', name: 'favoriteMax', 'aria-invalid': queryErrorKind === 'favorite', 'aria-describedby': queryErrorKind === 'favorite' ? 'query-error-favorite' : undefined }" placeholder="例如 10000…" />
								</n-space>
							</template>
							<n-input v-else-if="key === 'positiveTags'" v-model:value="positiveTagsText" autocomplete="off" :input-props="{ 'aria-label': '正向标签', name: 'positiveTags' }" placeholder="例如：原创/漫画改, 百合…" />
							<n-input v-else v-model:value="negativeTagsText" autocomplete="off" :input-props="{ 'aria-label': '反向标签', name: 'negativeTags' }" placeholder="例如：原创, 百合+后宫…" />
							<small v-if="fieldError(key)" :id="`query-error-${key}`" class="query-field-error">{{ fieldError(key) }}</small>
						</fieldset>
					</div>
				</section>

				<section class="query-stage query-stage--positions" aria-labelledby="query-position-stage-title">
					<header class="query-stage__heading">
						<span class="query-stage-index" aria-hidden="true">2</span>
						<div>
							<h2 id="query-position-stage-title">{{ positionStageLabel }}</h2>
							<span>{{ positionStageHint }}</span>
						</div>
					</header>
					<label class="field field--positions" :class="{ 'is-error': queryErrorKind === 'positions' }">
						<span>{{ workbench.mode.value === 'ranking' ? '用于生成当前人物排行' : '用于生成候选人物分组' }}</span>
						<n-select
							v-if="workbench.mode.value === 'ranking'"
							ref="positionInput"
							v-model:value="rankingDraftPosition"
							:options="draftPositionOptions"
							:status="queryErrorKind === 'positions' ? 'error' : undefined"
							:input-props="{ name: 'rankingPosition', 'aria-invalid': queryErrorKind === 'positions', 'aria-describedby': queryErrorKind === 'positions' ? 'query-error-positions' : undefined }"
							:disabled="workbench.queryLoading.value"
							placeholder="选择排行职位…"
						/>
						<n-select
							v-else
							ref="positionInput"
							v-model:value="workbench.queryDraft.positionsByMode['co-star']"
							multiple
							max-tag-count="responsive"
							:options="draftPositionOptions"
							:status="queryErrorKind === 'positions' ? 'error' : undefined"
							:input-props="{ name: 'coStarPositions', 'aria-invalid': queryErrorKind === 'positions', 'aria-describedby': queryErrorKind === 'positions' ? 'query-error-positions' : undefined }"
							:disabled="workbench.queryLoading.value"
							placeholder="选择一个或多个参与职位…"
							@update:value="workbench.clearQueryFeedback"
						/>
						<small v-if="fieldError('positions')" id="query-error-positions" class="query-field-error">{{ fieldError('positions') }}</small>
					</label>
					<div class="query-stage__selection-status" role="status">
						<span>{{ activeDraftPositions.length }} 个职位</span>
						<strong>{{ activeDraftPositions.map((value) => draftPositionOptions.find((option) => String(option.value) === String(value))?.label ?? value).join(' + ') || '尚未选择' }}</strong>
					</div>
				</section>
			</div>

			<p v-if="workbench.queryError.value && !queryErrorKind" class="query-error" role="alert">{{ workbench.queryError.value }}</p>

			<div class="query-editor__footer">
				<span role="status" aria-live="polite">{{ workbench.queryDraftStatus.value }}</span>
				<div class="query-editor__actions">
					<n-button attr-type="button" :disabled="!workbench.queryDraftDirty.value || workbench.queryLoading.value" @click="workbench.restoreQuery">撤销更改</n-button>
					<n-button attr-type="button" :disabled="!workbench.queryLoading.value" @click="workbench.cancelQuery">取消查询</n-button>
					<n-button type="primary" attr-type="submit" :loading="workbench.queryLoading.value" :disabled="workbench.queryLoading.value">{{ workbench.queryLoading.value ? '查询中…' : '应用并查询' }}</n-button>
				</div>
			</div>
		</form>
	</section>
</template>
