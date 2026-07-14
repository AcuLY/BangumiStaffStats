<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useWorkbench } from '../composables/useWorkbench'
import AppIcon from './AppIcon.vue'

const workbench = useWorkbench()
const userInput = ref<{ focus: () => void }>()
const editorButton = ref<HTMLButtonElement>()
const moreOptionsOpen = ref(false)

const focusMoreOptionsButton = () => {
	document.getElementById('query-more-options')?.focus()
}

const subjectOptions = [
	{ label: '动画', value: 2 },
	{ label: '书籍', value: 1 },
	{ label: '音乐', value: 3 },
	{ label: '游戏', value: 4 },
	{ label: '影视', value: 6 },
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
	{ key: 'isGlobal', title: '全站口径模拟', description: '仍使用本地静态快照，但改用 Bangumi 全站评分口径；UID 与收藏类型会暂时停用。' },
	{ key: 'showNSFW', title: '显示 NSFW 条目', description: '开启后不再过滤在 Bangumi 标记为 NSFW 的条目。' },
	{ key: 'date', title: '播出时间范围', description: '按条目播出、出版或发行的月份筛选，端点可留空。' },
	{ key: 'rate', title: '分数范围', description: '个人模式按我的评分，全站模式按全站评分；范围为 0–10。' },
	{ key: 'favorite', title: '收藏人数范围', description: '按照条目的收藏人数筛选，端点可留空。' },
	{ key: 'positiveTags', title: '正向标签', description: '仅保留匹配项；逗号表示“且”，单项内“/”表示“或”。' },
	{ key: 'negativeTags', title: '反向标签', description: '排除匹配项；逗号表示分别排除，单项内“+”表示“与”。' },
] as const

type AdvancedOptionKey = typeof advancedOptions[number]['key']
type ConditionKey = 'date' | 'rate' | 'favorite' | 'positiveTags' | 'negativeTags'

const positionOptionsFor = (subjectType: number) => subjectType === 2
	? workbench.positions.value
	: (positionVocabulary[subjectType] ?? []).map((label) => ({ label, value: label }))

const draftPositionOptions = computed(() => positionOptionsFor(workbench.queryDraft.subjectType))
const subjectLabel = computed(() => subjectOptions.find((item) => item.value === workbench.query.subjectType)?.label ?? String(workbench.query.subjectType))
const appliedPositionLabel = computed(() => positionOptionsFor(workbench.query.subjectType)
	.find((item) => String(item.value) === String(workbench.query.position))?.label ?? String(workbench.query.position || '未选择'))

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
	? '不适用'
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
	if (!options.some((option) => String(option.value) === String(workbench.queryDraft.position))) {
		workbench.queryDraft.position = options[0]?.value ?? ''
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
	if (!workbench.queryDraft.isGlobal) userInput.value?.focus()
}

const closeEditor = async () => {
	if (workbench.queryLoading.value) return
	workbench.queryEditing.value = false
}

const submitEditor = () => {
	const accepted = workbench.applyQuery()
	if (!accepted && workbench.queryError.value.includes('UID')) nextTick(() => userInput.value?.focus())
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
	<section class="query-workspace" aria-labelledby="query-title">
		<div v-if="!workbench.queryEditing.value" class="query-summary" tabindex="-1">
			<div class="query-summary__heading">
				<strong id="query-title">查询条件</strong>
				<span role="status">{{ workbench.queryStatus.value }}</span>
			</div>
			<div class="query-summary__items" aria-label="已应用查询范围">
				<span class="query-summary__item"><small>数据来源</small><b>{{ workbench.query.isGlobal ? '本地快照 · 全站口径' : '个人收藏' }}</b></span>
				<span class="query-summary__item"><small>用户 UID</small><b>{{ workbench.query.isGlobal ? '—' : workbench.query.userId }}</b></span>
				<span class="query-summary__item"><small>条目类型</small><b>{{ subjectLabel }}</b></span>
				<span class="query-summary__item"><small>职位</small><b>{{ appliedPositionLabel }}</b></span>
				<span class="query-summary__item"><small>收藏状态</small><b>{{ collectionLabel }}</b></span>
				<span class="query-summary__item"><small>高级条件</small><b>{{ advancedCount ? `${advancedCount} 项已启用` : '未启用' }}</b></span>
				<span class="query-summary__item"><small>应用范围</small><b>{{ workbench.queryScopeCount.value }} 部</b></span>
			</div>
			<button ref="editorButton" class="query-summary__edit" type="button" aria-expanded="false" aria-controls="query-editor" @click="openEditor">
				<AppIcon name="edit" :size="16" />
				编辑查询
			</button>
		</div>

		<form v-else id="query-editor" class="query-editor" novalidate @submit.prevent="submitEditor" @keydown.esc.prevent="closeEditor" @input="workbench.clearQueryFeedback">
			<div class="query-editor__head">
				<div>
					<h2 id="query-title">编辑查询条件</h2>
					<p>当前原型只重放内置静态快照，不会请求后端或写入数据。</p>
				</div>
				<button class="icon-button icon-button--chrome" type="button" aria-label="收起查询编辑器" :disabled="workbench.queryLoading.value" @click="closeEditor">
					<AppIcon name="close" />
				</button>
			</div>

			<div class="query-editor__fields">
				<label class="field">
					<span>用户 UID <small title="UID 是 Bangumi 个人主页链接的最后一段；全站模式下无需填写。">（不是昵称）</small></span>
					<n-input ref="userInput" v-model:value="workbench.queryDraft.userId" placeholder="例如 lucay126" autocomplete="off" clearable :disabled="workbench.queryDraft.isGlobal || workbench.queryLoading.value" />
				</label>
				<label class="field">
					<span>条目类型</span>
					<n-select v-model:value="workbench.queryDraft.subjectType" :options="subjectOptions" :disabled="workbench.queryLoading.value" />
				</label>
				<label class="field">
					<span>职位</span>
					<n-select v-model:value="workbench.queryDraft.position" :options="draftPositionOptions" :disabled="workbench.queryLoading.value" />
				</label>
				<fieldset class="field field--collections" :disabled="workbench.queryDraft.isGlobal || workbench.queryLoading.value">
					<legend>收藏类型</legend>
					<n-checkbox-group v-model:value="workbench.queryDraft.collectionTypes">
						<n-space :size="12" wrap>
							<n-checkbox v-for="option in draftCollectionOptions" :key="option.value" :value="option.value" :label="option.label" />
						</n-space>
					</n-checkbox-group>
				</fieldset>
			</div>

			<n-card v-if="workbench.queryDraft.isGlobal" size="small" role="note" style="margin-top: 12px">
				<strong>全站口径模拟</strong> · 仍只筛选本地静态快照 · UID、收藏类型已停用
			</n-card>

			<div v-if="enabledConditions.length" class="query-editor__fields" aria-label="已启用高级条件">
				<fieldset v-for="key in enabledConditions" :key="key" class="field" :disabled="workbench.queryLoading.value">
					<legend>
						{{ conditionTitle(key) }}
						<n-button text size="tiny" attr-type="button" :aria-label="`关闭${conditionTitle(key)}`" @click="removeCondition(key)">移除</n-button>
					</legend>
					<template v-if="key === 'date'">
						<n-space :wrap="false" align="center">
							<n-input v-model:value="workbench.queryDraft.date.value[0]" :input-props="{ 'aria-label': '播出时间起点' }" placeholder="YYYY-MM" />
							<span aria-hidden="true">—</span>
							<n-input v-model:value="workbench.queryDraft.date.value[1]" :input-props="{ 'aria-label': '播出时间终点' }" placeholder="YYYY-MM" />
						</n-space>
					</template>
					<template v-else-if="key === 'rate'">
						<n-space :wrap="false" align="center">
							<n-input v-model:value="workbench.queryDraft.rate.value[0]" :input-props="{ 'aria-label': '评分下限' }" placeholder="0" />
							<span aria-hidden="true">—</span>
							<n-input v-model:value="workbench.queryDraft.rate.value[1]" :input-props="{ 'aria-label': '评分上限' }" placeholder="10" />
						</n-space>
					</template>
					<template v-else-if="key === 'favorite'">
						<n-space :wrap="false" align="center">
							<n-input v-model:value="workbench.queryDraft.favorite.value[0]" :input-props="{ 'aria-label': '收藏人数下限' }" placeholder="0" />
							<span aria-hidden="true">—</span>
							<n-input v-model:value="workbench.queryDraft.favorite.value[1]" :input-props="{ 'aria-label': '收藏人数上限' }" placeholder="不限" />
						</n-space>
					</template>
					<n-input v-else-if="key === 'positiveTags'" v-model:value="positiveTagsText" :input-props="{ 'aria-label': '正向标签' }" placeholder="例如：原创/漫画改, 百合" />
					<n-input v-else v-model:value="negativeTagsText" :input-props="{ 'aria-label': '反向标签' }" placeholder="例如：原创, 百合+后宫" />
				</fieldset>
			</div>

			<n-card v-if="workbench.queryError.value" size="small" role="alert" style="margin-top: 12px">
				{{ workbench.queryError.value }}
			</n-card>

			<div class="query-editor__footer">
				<span role="status" aria-live="polite">{{ workbench.queryDraftStatus.value }}</span>
				<div class="query-editor__actions">
					<n-button id="query-more-options" attr-type="button" :disabled="workbench.queryLoading.value" @click="moreOptionsOpen = true">更多选项</n-button>
					<n-button attr-type="button" :disabled="!workbench.queryDraftDirty.value || workbench.queryLoading.value" @click="workbench.restoreQuery">撤销更改</n-button>
					<n-button attr-type="button" :disabled="!workbench.queryLoading.value" @click="workbench.cancelQuery">取消查询</n-button>
					<n-button type="primary" attr-type="submit" :loading="workbench.queryLoading.value" :disabled="workbench.queryLoading.value">{{ workbench.queryLoading.value ? '查询中' : '查询' }}</n-button>
				</div>
			</div>
		</form>

		<n-drawer v-model:show="moreOptionsOpen" :width="390" placement="right" @after-leave="focusMoreOptionsButton">
			<n-drawer-content title="更多选项" closable>
				<n-list bordered>
					<n-list-item v-for="option in advancedOptions" :key="option.key">
						<template #suffix>
							<n-switch :value="optionEnabled(option.key)" :aria-label="option.title" @update:value="toggleOption(option.key, $event)" />
						</template>
						<div>
							<strong>{{ option.title }}</strong>
							<p>{{ option.description }}</p>
						</div>
					</n-list-item>
				</n-list>
			</n-drawer-content>
		</n-drawer>
	</section>
</template>
