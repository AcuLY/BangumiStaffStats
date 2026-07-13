<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useWorkbench } from '../composables/useWorkbench'
import AppIcon from './AppIcon.vue'

const workbench = useWorkbench()
const userInput = ref<{ focus: () => void }>()
const editorButton = ref<HTMLButtonElement>()

const subjectOptions = [
	{ label: '动画', value: 2 },
	{ label: '书籍', value: 1 },
	{ label: '音乐', value: 3 },
	{ label: '游戏', value: 4 },
	{ label: '影视', value: 6 },
]

const collectionOptions = [
	{ label: '看过', value: 2 },
	{ label: '在看', value: 3 },
	{ label: '搁置', value: 4 },
	{ label: '抛弃', value: 5 },
]

const subjectLabel = computed(() => subjectOptions.find((item) => item.value === workbench.query.subjectType)?.label ?? '动画')
const collectionLabel = computed(() => workbench.query.collectionTypes
	.map((value) => collectionOptions.find((item) => item.value === value)?.label)
	.filter(Boolean)
	.join(' + ') || '未选择')

const openEditor = async () => {
	workbench.restoreQuery()
	workbench.queryEditing.value = true
	await nextTick()
	userInput.value?.focus()
}

const returnFocus = async () => {
	await nextTick()
	editorButton.value?.focus()
}

const cancelEditor = async () => {
	workbench.restoreQuery()
	workbench.queryEditing.value = false
	await returnFocus()
}

const submitEditor = async () => {
	workbench.applyQuery()
	await returnFocus()
}
</script>

<template>
	<section class="query-workspace" aria-labelledby="query-title">
		<div v-if="!workbench.queryEditing.value" class="query-summary">
			<div class="query-summary__heading">
				<strong id="query-title">查询条件</strong>
				<span role="status">{{ workbench.queryStatus.value }}</span>
			</div>
			<div class="query-summary__items">
				<span class="query-summary__item"><small>用户</small><b>{{ workbench.query.userId }}</b></span>
				<span class="query-summary__item"><small>条目</small><b>{{ subjectLabel }}</b></span>
				<span class="query-summary__item"><small>职位</small><b>{{ workbench.positionLabel(workbench.query.positionId) }}</b></span>
				<span class="query-summary__item"><small>收藏</small><b>{{ collectionLabel }}</b></span>
			</div>
			<button ref="editorButton" class="query-summary__edit" type="button" aria-expanded="false" aria-controls="query-editor" @click="openEditor">
				<AppIcon name="edit" :size="16" />
				编辑查询
			</button>
		</div>

		<form v-else id="query-editor" class="query-editor" @submit.prevent="submitEditor" @keydown.esc.prevent="cancelEditor">
			<div class="query-editor__head">
				<div>
					<h2 id="query-title">编辑查询</h2>
					<p>原型只重放已内置的本地快照，不会请求后端。</p>
				</div>
				<button class="icon-button icon-button--chrome" type="button" aria-label="收起查询编辑器" @click="cancelEditor">
					<AppIcon name="close" />
				</button>
			</div>

			<div class="query-editor__fields">
				<label class="field">
					<span>用户 UID</span>
					<n-input ref="userInput" v-model:value="workbench.queryDraft.userId" placeholder="例如 lucay126" clearable />
				</label>
				<label class="field">
					<span>条目类型</span>
					<n-select v-model:value="workbench.queryDraft.subjectType" :options="subjectOptions" />
				</label>
				<label class="field">
					<span>职位</span>
					<n-select v-model:value="workbench.queryDraft.positionId" :options="workbench.positions.value" />
				</label>
				<fieldset class="field field--collections">
					<legend>收藏类型</legend>
					<n-checkbox-group v-model:value="workbench.queryDraft.collectionTypes">
						<n-space :size="12" wrap>
							<n-checkbox v-for="option in collectionOptions" :key="option.value" :value="option.value" :label="option.label" />
						</n-space>
					</n-checkbox-group>
				</fieldset>
			</div>

			<div class="query-editor__footer">
				<span role="status">条件只筛选项目内置快照，不会请求后端或写入数据。</span>
				<div class="query-editor__actions">
					<n-button type="default" attr-type="button" @click="workbench.restoreQuery">撤销更改</n-button>
					<n-button type="primary" attr-type="submit">应用到原型</n-button>
				</div>
			</div>
		</form>
	</section>
</template>
