<script setup lang="ts">
import { computed } from 'vue'
import { useWorkbench } from '../composables/useWorkbench'
import RankedPersonList from './RankedPersonList.vue'
import SafeImage from './SafeImage.vue'
import AppIcon from './AppIcon.vue'

withDefaults(defineProps<{ drawer?: boolean }>(), { drawer: false })
const emit = defineEmits<{ close: [] }>()
const workbench = useWorkbench()

const filterOptions = [
	{ label: '全部', value: 'all' as const },
	{ label: '未选', value: 'unselected' as const },
	{ label: '已选', value: 'selected' as const },
]
const sortOptions = [
	{ label: '该职位作品数', value: 'count' },
	{ label: '我的均分', value: 'average' },
	{ label: '人物名', value: 'name' },
]
const selectedScopeCount = computed(() => workbench.selectedScopes.value.length)
</script>

<template>
	<div class="person-picker" :class="{ 'person-picker--drawer': drawer }">
		<header class="picker-heading">
			<div>
				<h2>人物选择</h2>
				<span class="status-line" role="status">{{ workbench.analysisStatus.value }}</span>
			</div>
			<button v-if="drawer" class="icon-button" type="button" aria-label="关闭人物选择" @click="emit('close')">
				<AppIcon name="close" />
			</button>
		</header>

		<section class="selected-tray" aria-labelledby="selected-people-title">
			<div class="picker-section-heading">
				<strong id="selected-people-title">已选人物</strong>
				<span>{{ workbench.selectedPeople.value.length }} 人 · {{ selectedScopeCount }} 个身份</span>
			</div>
			<div class="selected-people-list">
				<article v-for="(item, index) in workbench.selectedPeople.value" :key="item.person.id" class="selected-person-row">
					<span class="identity-marker">{{ String.fromCharCode(65 + index) }}</span>
					<SafeImage :sources="workbench.personImageSources(item.person)" :alt="workbench.personName(item.person)" kind="person" :width="36" :height="36" decorative />
					<span class="selected-person-row__copy">
						<strong>{{ workbench.personName(item.person) }}</strong>
						<small>{{ item.positionIds.map(workbench.positionLabel).join(' · ') }}</small>
					</span>
					<button class="selected-person-row__remove" type="button" :aria-label="`移除${workbench.personName(item.person)}`" @click="workbench.removePerson(item.person.id)">
						<AppIcon name="close" :size="16" />
					</button>
				</article>
				<div v-if="!workbench.selectedPeople.value.length" class="selected-empty">从下方候选中选择至少两个人物。</div>
			</div>
		</section>

		<section class="candidate-browser" aria-labelledby="candidate-title">
			<div class="picker-section-heading">
				<strong id="candidate-title">人物候选</strong>
				<span>{{ workbench.candidatePeople.value.length }} 人</span>
			</div>

			<div class="candidate-controls">
				<label class="field field--compact">
					<span>当前职位</span>
					<n-select v-model:value="workbench.browsePositionId.value" :options="workbench.positions.value" />
				</label>
				<n-input v-model:value="workbench.candidateSearch.value" clearable placeholder="搜索人物名或别名…" aria-label="搜索人物">
					<template #prefix><AppIcon name="search" :size="16" /></template>
				</n-input>
				<div class="candidate-filter" role="group" aria-label="人物选择状态筛选">
					<button
						v-for="option in filterOptions"
						:key="option.value"
						type="button"
						:class="{ 'is-active': workbench.candidateFilter.value === option.value }"
						:aria-pressed="workbench.candidateFilter.value === option.value"
						@click="workbench.candidateFilter.value = option.value"
					>
						{{ option.label }}<span v-if="option.value === 'selected'"> · {{ selectedScopeCount }}</span>
					</button>
				</div>
				<n-select v-model:value="workbench.candidateSort.value" :options="sortOptions" aria-label="人物排序" />
			</div>

			<RankedPersonList :items="workbench.candidatePageItems.value" variant="candidate" @toggle="workbench.toggleScope" />

			<footer class="picker-pagination">
				<n-pagination v-model:page="workbench.candidatePage.value" :page-count="workbench.candidatePageCount.value" :page-slot="5" />
			</footer>
		</section>

		<p class="picker-footnote">本地静态快照 · 图片经 Bangumi API 兼容代理加载，失败时显示降级图标。</p>
	</div>
</template>
