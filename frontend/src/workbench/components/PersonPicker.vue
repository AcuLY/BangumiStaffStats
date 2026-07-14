<script setup lang="ts">
import { computed, ref } from 'vue'
import { useWorkbench } from '../composables/useWorkbench'
import SafeImage from './SafeImage.vue'
import AppIcon from './AppIcon.vue'

const props = withDefaults(defineProps<{ drawer?: boolean }>(), { drawer: false })
const emit = defineEmits<{ close: [] }>()
const workbench = useWorkbench()
const selectedTrayCollapsed = ref(props.drawer)

const selectedScopeCount = computed(() => workbench.selectedScopes.value.length)
const candidatePositionLabel = computed(() => workbench.positionLabel(workbench.candidatePositionId.value))
const candidatePositionCount = computed(() => workbench.candidatePositionOptions.value
	.find((option) => option.value === workbench.candidatePositionId.value)?.count ?? 0)
const candidatePositionSelectOptions = computed(() => workbench.candidatePositionOptions.value.map((option) => ({
	label: `${option.label} · ${option.count} 人`,
	value: option.value,
})))

const currentPositionRanking = computed(() => [...workbench.peopleById.value.values()]
	.map((person) => {
		const subjectIds = workbench.positionSubjectIds(person, workbench.candidatePositionId.value)
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
const selectionSlot = (index: number) => String(index + 1)

const availablePositionOptions = (item: typeof workbench.selectedPeople.value[number]) =>
	workbench.positions.value.filter((position) =>
		workbench.coStarPositionIds.value.includes(position.value)
		&&
		!item.positionIds.includes(position.value)
		&& workbench.positionSubjectIds(item.person, position.value)
			.some((id) => workbench.queryScopeSubjectIds.value.has(Number(id))))

const addIdentity = (personId: number, positionId: number | null) => {
	if (positionId !== null && !workbench.isScopeSelected(personId, positionId)) {
		workbench.toggleScope(personId, positionId)
	}
}

const otherSelectedIdentityLabels = (personId: number) => workbench.selectedScopes.value
	.filter((scope) => scope.personId === personId && scope.positionId !== workbench.candidatePositionId.value)
	.map((scope) => workbench.positionLabel(scope.positionId))
</script>

<template>
	<div class="person-picker" :class="{ 'person-picker--drawer': drawer }">
		<header class="picker-heading">
			<div>
				<h2>人物选择</h2>
			</div>
			<n-button v-if="drawer" class="drawer-close-button" quaternary circle attr-type="button" aria-label="关闭人物选择" title="关闭人物选择" @click="emit('close')">
				<AppIcon name="close" />
			</n-button>
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
					<span class="selected-person-row__portrait">
						<SafeImage :sources="workbench.personImageSources(item.person)" :alt="workbench.personName(item.person)" kind="person" :width="36" :height="44" decorative />
						<span class="identity-marker">{{ selectionSlot(index) }}</span>
					</span>
					<span class="selected-person-row__copy">
						<strong>{{ workbench.personName(item.person) }}</strong>
						<span class="selected-person-row__positions">
							<span v-for="positionId in item.positionIds" :key="positionId" class="selected-identity-chip">
								{{ workbench.positionLabel(positionId) }}
								<n-button
									class="selected-identity-remove"
									quaternary
									circle
									size="tiny"
									attr-type="button"
									:aria-label="`移除${workbench.personName(item.person)}的${workbench.positionLabel(positionId)}身份`"
									@click="workbench.toggleScope(item.person.id, positionId)"
								>
									<AppIcon name="close" :size="12" />
								</n-button>
							</span>
							<n-select
								v-if="availablePositionOptions(item).length"
								class="position-add-select"
								size="small"
								:value="null"
								:options="availablePositionOptions(item)"
								placeholder="＋ 添加身份…"
								:aria-label="`为${workbench.personName(item.person)}添加身份`"
								@update:value="addIdentity(item.person.id, $event)"
							/>
						</span>
					</span>
					<n-button class="selected-person-row__remove" quaternary circle attr-type="button" :aria-label="`移除${workbench.personName(item.person)}的全部身份`" :title="`移除${workbench.personName(item.person)}`" @click="workbench.removePerson(item.person.id)">
						<AppIcon name="close" :size="16" />
					</n-button>
				</article>
				<div v-if="!workbench.selectedPeople.value.length" class="selected-empty">从下方候选中选择至少两个人物。</div>
			</div>
		</section>

		<section class="candidate-browser" aria-labelledby="candidate-title">
			<div class="picker-section-heading">
				<strong id="candidate-title">候选人物</strong>
				<span>{{ candidatePositionLabel }} · {{ candidatePositionCount }} 人</span>
			</div>

			<div v-if="workbench.candidatePositionOptions.value.length > 1" class="candidate-position-browser">
				<span class="candidate-position-browser__label">浏览职位</span>
				<n-select
					v-model:value="workbench.candidatePositionId.value"
					:options="candidatePositionSelectOptions"
					aria-label="浏览已应用职位"
					:input-props="{ name: 'candidatePosition' }"
				/>
			</div>

			<div
				id="candidate-position-results"
				class="candidate-position-results"
				role="region"
				:aria-label="`${candidatePositionLabel}候选人物`"
			>
				<n-input class="candidate-search" v-model:value="workbench.candidateSearch.value" clearable autocomplete="off" placeholder="筛选当前结果…" :aria-label="`搜索${candidatePositionLabel}候选人物`" :input-props="{ name: 'candidateSearch', spellcheck: 'false' }">
					<template #prefix><AppIcon name="search" :size="16" /></template>
				</n-input>

				<div class="candidate-result-summary" role="status" aria-live="polite">
					<span>第 {{ workbench.candidatePage.value }} / {{ workbench.candidatePageCount.value }} 页</span>
				</div>

				<div class="person-list person-list--candidate">
				<button
					v-for="person in workbench.candidatePageItems.value"
					:key="`candidate-${person.id}`"
					class="person-row person-row--candidate"
					type="button"
					:class="{ 'is-selected': workbench.isScopeSelected(person.id, person.activePositionId) }"
					:aria-pressed="workbench.isScopeSelected(person.id, person.activePositionId)"
					:aria-label="`${workbench.isScopeSelected(person.id, person.activePositionId) ? '移除' : '选择'}${workbench.personName(person)}的${person.activePositionLabel}身份`"
					@click="workbench.toggleScope(person.id, person.activePositionId)"
				>
					<span class="candidate-row__portrait">
						<SafeImage
							class="person-row__avatar"
							:sources="workbench.personImageSources(person)"
							:alt="workbench.personName(person)"
							kind="person"
							decorative
							:width="36"
							:height="44"
						/>
						<span v-if="workbench.isScopeSelected(person.id, person.activePositionId)" class="candidate-row__selected-state" aria-hidden="true">
							<AppIcon name="check" :size="11" />
						</span>
					</span>
					<span class="person-row__identity candidate-row__identity">
						<strong>{{ workbench.personName(person) }}</strong>
						<small>
							<span class="candidate-rank">#{{ candidateRankById.get(person.id) ?? '—' }}</span>
						</small>
						<span v-if="otherSelectedIdentityLabels(person.id).length" class="candidate-other-positions">
							已选其他身份：{{ otherSelectedIdentityLabels(person.id).join(' / ') }}
						</span>
					</span>
					<span class="candidate-row__metrics">
						<span><strong>{{ person.activeSubjectCount }}</strong><small>作品</small></span>
					</span>
				</button>

				<div v-if="!workbench.candidatePageItems.value.length" class="person-list__empty">
					<AppIcon name="search" :size="22" />
					<strong>没有匹配的人物</strong>
					<span>换一个搜索词。</span>
				</div>
				</div>

				<footer class="picker-pagination">
					<n-pagination v-model:page="workbench.candidatePage.value" size="small" :page-count="workbench.candidatePageCount.value" :page-slot="3" />
				</footer>
			</div>
		</section>

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
	padding: 0 var(--space-3);
	border: 1px solid var(--border);
	border-radius: var(--radius-control);
	background: var(--surface-sunken);
	color: var(--text-2);
	font: inherit;
	font-size: var(--text-control);
	cursor: pointer;
}

.selected-tray-toggle:hover {
	background: var(--hover);
}

.selected-tray-toggle[aria-expanded='true'] svg {
	transform: rotate(180deg);
}

.selected-person-row {
	grid-template-columns: 36px minmax(0, 1fr) 36px;
	align-items: center;
	gap: var(--space-2);
	min-height: 56px;
	padding-block: 6px;
}

.selected-person-row__portrait {
	position: relative;
	display: block;
	width: 36px;
	height: 44px;
}

.selected-person-row__portrait .identity-marker {
	position: absolute;
	top: -4px;
	left: -8px;
	z-index: 2;
	width: 22px;
	height: 22px;
	box-shadow: 0 1px 3px color-mix(in oklab, var(--text-1) 18%, transparent);
}

.selected-person-row__copy {
	gap: 4px;
}

.selected-person-row__positions {
	display: flex;
	flex-wrap: wrap;
	gap: var(--space-1);
}

.selected-identity-chip {
	display: inline-flex;
	align-items: center;
	min-height: 24px;
	padding-left: 7px;
	border: 1px solid var(--border);
	border-radius: 6px;
	background: var(--surface-sunken);
	color: var(--text-2);
	font-size: var(--text-control);
}

.selected-identity-remove {
	position: relative;
	width: 24px;
	min-width: 24px;
	height: 24px;
	min-height: 24px;
	color: var(--text-3);
}

.selected-identity-remove::before {
	position: absolute;
	inset: -8px;
	content: "";
}

.selected-identity-remove:hover {
	color: var(--error);
}

.position-add-select {
	width: 112px;
}

.selected-person-row__remove {
	width: 36px;
	min-width: 36px;
	height: 36px;
	min-height: 36px;
}

@media (max-width: 780px) {
	.selected-person-row {
		grid-template-columns: 36px minmax(0, 1fr) 44px;
	}

	.selected-person-row__remove {
		width: 44px;
		min-width: 44px;
		height: 44px;
		min-height: 44px;
	}
}

.candidate-result-summary span {
	color: var(--text-3);
	font-size: var(--text-caption);
}

.candidate-result-summary {
	display: flex;
	align-items: baseline;
	justify-content: flex-end;
	gap: var(--space-3);
	margin: var(--space-2) 0 var(--space-1);
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
	gap: var(--space-1);
}

.candidate-rank,
.candidate-other-positions {
	color: var(--text-3);
}

.candidate-other-positions {
	margin-top: 2px;
	font-size: var(--text-caption);
}

.candidate-row__metrics {
	display: flex;
	align-items: center;
	gap: var(--space-2);
	text-align: right;
}

.candidate-row__metrics > span {
	display: grid;
	min-width: 36px;
}

.candidate-row__metrics strong {
	font-size: var(--text-control);
}

.candidate-row__metrics small {
	color: var(--text-3);
	font-size: var(--text-caption);
}

.picker-pagination {
	justify-content: center;
	width: 100%;
	min-width: 0;
	padding: 8px 0 0;
	overflow: visible;
}

.picker-pagination :deep(.n-pagination) {
	max-width: 100%;
}

.person-row--candidate {
	width: 100%;
	min-height: 56px;
	margin-inline: 0;
	padding: 6px var(--space-3);
	border-radius: var(--radius-control);
}

.candidate-position-results {
	container: candidate-results / inline-size;
}

@container candidate-results (min-width: 560px) {
	.person-list--candidate {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-1) var(--space-2);
	}

	.person-list--candidate .person-list__empty {
		grid-column: 1 / -1;
	}
}

.person-picker--drawer .candidate-browser {
	padding-bottom: max(var(--section-pad), env(safe-area-inset-bottom));
}

@media (max-width: 420px) {
	.candidate-row__metrics {
		gap: var(--space-1);
	}

	.candidate-row__metrics > span {
		min-width: 32px;
	}
}
</style>
