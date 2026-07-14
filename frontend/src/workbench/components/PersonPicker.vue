<script setup lang="ts">
import { computed, ref } from 'vue'
import { useWorkbench } from '../composables/useWorkbench'
import SafeImage from './SafeImage.vue'
import AppIcon from './AppIcon.vue'

const props = withDefaults(defineProps<{ drawer?: boolean }>(), { drawer: false })
const emit = defineEmits<{ close: [] }>()
const workbench = useWorkbench()
const selectedTrayCollapsed = ref(props.drawer)
const candidatePageSize = computed(() => Math.max(1, Number(workbench.snapshot.value?.meta.ui?.pageSize || 8)))

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
const currentPositionSelectedCount = computed(() => new Set(
	workbench.selectedScopes.value
		.filter((scope) => scope.positionId === workbench.browsePositionId.value)
		.map((scope) => scope.personId),
).size)

const currentPositionRanking = computed(() => [...workbench.peopleById.value.values()]
	.map((person) => {
		const subjectIds = workbench.positionSubjectIds(person, workbench.browsePositionId.value)
			.filter((id) => workbench.queryScopeSubjectIds.value.has(Number(id)))
		if (!subjectIds.length) return null
		const rates = subjectIds
			.map((id) => Number(workbench.subjectsById.value.get(Number(id))?.collection?.rate || 0))
			.filter((rate) => rate > 0)
		return {
			personId: person.id,
			count: subjectIds.length,
			average: rates.length ? rates.reduce((sum, rate) => sum + rate, 0) / rates.length : 0,
		}
	})
	.filter((item): item is { personId: number; count: number; average: number } => Boolean(item))
	.sort((a, b) => b.count - a.count || b.average - a.average || a.personId - b.personId))

const candidateRankById = computed(() => new Map(
	currentPositionRanking.value.map((item, index) => [item.personId, index + 1]),
))
const currentPositionTotal = computed(() => currentPositionRanking.value.length)
const candidateRangeStart = computed(() => workbench.candidatePeople.value.length
	? (workbench.candidatePage.value - 1) * candidatePageSize.value + 1
	: 0)
const candidateRangeEnd = computed(() => Math.min(
	candidateRangeStart.value + workbench.candidatePageItems.value.length - 1,
	workbench.candidatePeople.value.length,
))

const selectionSlot = (index: number) => index < 26
	? String.fromCharCode(65 + index)
	: String(index + 1)

const availablePositionOptions = (item: typeof workbench.selectedPeople.value[number]) =>
	workbench.positions.value.filter((position) =>
		!item.positionIds.includes(position.value)
		&& workbench.positionSubjectIds(item.person, position.value)
			.some((id) => workbench.queryScopeSubjectIds.value.has(Number(id))))

const addIdentity = (personId: number, positionId: number | null) => {
	if (positionId !== null && !workbench.isScopeSelected(personId, positionId)) {
		workbench.toggleScope(personId, positionId)
	}
}

const otherSelectedIdentityLabels = (personId: number) => workbench.selectedScopes.value
	.filter((scope) => scope.personId === personId && scope.positionId !== workbench.browsePositionId.value)
	.map((scope) => workbench.positionLabel(scope.positionId))

const formatScore = (value: number) => Number.isFinite(value) && value > 0
	? value.toFixed(2)
	: '—'
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
			<button
				v-if="drawer"
				class="selected-tray-toggle"
				type="button"
				:aria-expanded="!selectedTrayCollapsed"
				aria-controls="selected-people-list"
				@click="selectedTrayCollapsed = !selectedTrayCollapsed"
			>
				{{ selectedTrayCollapsed
					? `展开已选（${workbench.selectedPeople.value.length} 人 · ${selectedScopeCount} 身份）`
					: '收起已选人物' }}
				<AppIcon name="chevron" :size="16" aria-hidden="true" />
			</button>
			<div v-show="!selectedTrayCollapsed" id="selected-people-list" class="selected-people-list">
				<article v-for="(item, index) in workbench.selectedPeople.value" :key="item.person.id" class="selected-person-row">
					<span class="identity-marker">{{ selectionSlot(index) }}</span>
					<SafeImage :sources="workbench.personImageSources(item.person)" :alt="workbench.personName(item.person)" kind="person" :width="36" :height="36" decorative />
					<span class="selected-person-row__copy">
						<strong>{{ workbench.personName(item.person) }}</strong>
						<span class="selected-person-row__positions">
							<span v-for="positionId in item.positionIds" :key="positionId" class="selected-identity-chip">
								{{ workbench.positionLabel(positionId) }}
								<button
									type="button"
									:aria-label="`移除${workbench.personName(item.person)}的${workbench.positionLabel(positionId)}身份`"
									@click="workbench.toggleScope(item.person.id, positionId)"
								>
									<AppIcon name="close" :size="12" />
								</button>
							</span>
							<n-select
								v-if="availablePositionOptions(item).length"
								class="position-add-select"
								size="small"
								:value="null"
								:options="availablePositionOptions(item)"
								placeholder="＋ 添加身份"
								:aria-label="`为${workbench.personName(item.person)}添加身份`"
								@update:value="addIdentity(item.person.id, $event)"
							/>
						</span>
					</span>
					<button class="selected-person-row__remove" type="button" :aria-label="`移除${workbench.personName(item.person)}的全部身份`" @click="workbench.removePerson(item.person.id)">
						<AppIcon name="close" :size="16" />
					</button>
				</article>
				<div v-if="!workbench.selectedPeople.value.length" class="selected-empty">从下方候选中选择至少两个人物。</div>
			</div>
		</section>

		<section class="candidate-browser" aria-labelledby="candidate-title">
			<div class="picker-section-heading">
				<strong id="candidate-title">{{ workbench.positionLabel(workbench.browsePositionId.value) }}人物排行</strong>
				<span>{{ currentPositionTotal }} 人</span>
			</div>

			<div class="candidate-controls">
				<label class="field field--compact">
					<span class="position-browser-heading">
						<span>浏览职位</span>
						<small>本职位已选 {{ currentPositionSelectedCount }} 人</small>
					</span>
					<n-select v-model:value="workbench.browsePositionId.value" :options="workbench.positions.value" />
					<small class="position-browser-help">支持多职位 · 作品自动去重</small>
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
						{{ option.label }}<span v-if="option.value === 'selected'"> · {{ currentPositionSelectedCount }}</span>
					</button>
				</div>
				<n-select v-model:value="workbench.candidateSort.value" :options="sortOptions" aria-label="人物排序" />
			</div>

			<div class="candidate-result-summary">
				<strong>候选结果</strong>
				<span>{{ workbench.candidatePeople.value.length }} 人 · 第 {{ workbench.candidatePage.value }} / {{ workbench.candidatePageCount.value }} 页</span>
			</div>

			<div class="person-list person-list--candidate">
				<article
					v-for="person in workbench.candidatePageItems.value"
					:key="`candidate-${person.id}`"
					class="person-row person-row--candidate"
					:class="{ 'is-selected': workbench.isScopeSelected(person.id, person.activePositionId) }"
				>
					<button
						class="person-row__select"
						type="button"
						:aria-pressed="workbench.isScopeSelected(person.id, person.activePositionId)"
						:aria-label="`${workbench.isScopeSelected(person.id, person.activePositionId) ? '移除' : '选择'}${workbench.personName(person)}的${person.activePositionLabel}身份`"
						@click="workbench.toggleScope(person.id, person.activePositionId)"
					>
						<span class="person-row__select-glyph">
							<AppIcon :name="workbench.isScopeSelected(person.id, person.activePositionId) ? 'check' : 'plus'" :size="18" />
						</span>
					</button>
					<SafeImage
						class="person-row__avatar"
						:sources="workbench.personImageSources(person)"
						:alt="workbench.personName(person)"
						kind="person"
						decorative
						:width="42"
						:height="42"
					/>
					<span class="person-row__identity candidate-row__identity">
						<strong>{{ workbench.personName(person) }}</strong>
						<small>
							<span class="candidate-position">{{ person.activePositionLabel }}</span>
							<span class="candidate-rank">#{{ candidateRankById.get(person.id) ?? '—' }}</span>
						</small>
						<span v-if="otherSelectedIdentityLabels(person.id).length" class="candidate-other-positions">
							已选其他身份：{{ otherSelectedIdentityLabels(person.id).join(' / ') }}
						</span>
					</span>
					<span class="candidate-row__metrics">
						<span><strong>{{ person.activeSubjectCount }}</strong><small>作品</small></span>
						<span><strong>{{ formatScore(person.activeAverage) }}</strong><small>均分</small></span>
					</span>
				</article>

				<div v-if="!workbench.candidatePageItems.value.length" class="person-list__empty">
					<AppIcon name="search" :size="22" />
					<strong>没有匹配的人物</strong>
					<span>换一个搜索词或筛选条件。</span>
				</div>
			</div>

			<footer class="picker-pagination">
				<span class="candidate-range">{{ candidateRangeStart }}—{{ candidateRangeEnd }} / {{ workbench.candidatePeople.value.length }}</span>
				<n-pagination v-model:page="workbench.candidatePage.value" :page-count="workbench.candidatePageCount.value" :page-slot="5" />
			</footer>
		</section>

		<p class="picker-footnote">本地静态快照 · 图片经 Bangumi API 兼容代理加载，失败时显示降级图标。</p>
	</div>
</template>

<style scoped>
.selected-tray-toggle {
	display: flex;
	align-items: center;
	justify-content: space-between;
	width: 100%;
	min-height: 44px;
	margin-bottom: 8px;
	padding: 0 10px;
	border: 1px solid var(--border);
	border-radius: var(--radius-control);
	background: var(--surface-sunken);
	color: var(--text-2);
	font: inherit;
	font-size: 12px;
	cursor: pointer;
}

.selected-tray-toggle[aria-expanded='true'] svg {
	transform: rotate(180deg);
}

.selected-person-row {
	align-items: start;
	padding-block: 8px;
}

.selected-person-row > .identity-marker,
.selected-person-row > .safe-image,
.selected-person-row > .selected-person-row__remove {
	margin-top: 2px;
}

.selected-person-row__copy {
	gap: 6px;
}

.selected-person-row__positions {
	display: flex;
	flex-wrap: wrap;
	gap: 5px;
}

.selected-identity-chip {
	display: inline-flex;
	align-items: center;
	min-height: 28px;
	padding-left: 8px;
	border: 1px solid var(--border);
	border-radius: 6px;
	background: var(--surface-sunken);
	color: var(--text-2);
	font-size: 12px;
}

.selected-identity-chip button {
	display: grid;
	place-items: center;
	width: 28px;
	height: 28px;
	padding: 0;
	border: 0;
	background: transparent;
	color: var(--text-3);
	cursor: pointer;
}

.selected-identity-chip button:hover {
	color: var(--error);
}

.position-add-select {
	width: 112px;
}

.position-browser-heading {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.position-browser-heading small,
.position-browser-help,
.candidate-result-summary span,
.candidate-range {
	color: var(--text-3);
	font-size: 12px;
}

.position-browser-help {
	display: block;
	margin-top: 6px;
}

.candidate-result-summary {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	gap: 12px;
	margin: 14px 0 8px;
}

.candidate-result-summary strong {
	font-size: 16px;
}

.candidate-row__identity {
	display: grid;
	min-width: 0;
}

.candidate-row__identity strong,
.candidate-row__identity small,
.candidate-other-positions {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.candidate-row__identity small {
	display: flex;
	gap: 5px;
}

.candidate-position {
	color: var(--primary-text);
}

.candidate-rank,
.candidate-other-positions {
	color: var(--text-3);
}

.candidate-other-positions {
	margin-top: 2px;
	font-size: 11px;
}

.candidate-row__metrics {
	display: flex;
	align-items: center;
	gap: 9px;
	text-align: right;
}

.candidate-row__metrics > span {
	display: grid;
	min-width: 36px;
}

.candidate-row__metrics strong {
	font-size: 12px;
}

.candidate-row__metrics small {
	color: var(--text-3);
	font-size: 10px;
}

.picker-pagination {
	justify-content: space-between;
	gap: 8px;
}

@media (max-width: 420px) {
	.candidate-row__metrics {
		gap: 5px;
	}

	.candidate-row__metrics > span {
		min-width: 32px;
	}
}
</style>
