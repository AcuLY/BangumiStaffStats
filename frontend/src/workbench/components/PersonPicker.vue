<script setup lang="ts">
import { computed, ref } from 'vue'
import { useWorkbench } from '../composables/useWorkbench'
import SafeImage from './SafeImage.vue'
import AppIcon from './AppIcon.vue'
import AdaptivePagination from './AdaptivePagination.vue'

const props = withDefaults(defineProps<{ drawer?: boolean }>(), { drawer: false })
const emit = defineEmits<{ close: [] }>()
const workbench = useWorkbench()
const selectedTrayExpandedNames = ref<Array<string | number>>(props.drawer ? [] : ['selected-people'])
const controlSize = computed<'small' | 'medium'>(() => props.drawer ? 'small' : 'medium')

const selectedScopeCount = computed(() => workbench.selectedScopes.value.length)
const candidatePageSizeOptions = [5, 10, 20, 50].map((value) => ({ label: `每页 ${value} 人`, value }))
const updateCandidatePageSize = (value: number) => {
	workbench.candidatePageSize.value = value
	workbench.candidatePage.value = 1
}
const candidateRange = computed(() => {
	const start = (workbench.candidatePage.value - 1) * workbench.candidatePageSize.value
	return {
		start: workbench.candidatePeople.value.length ? start + 1 : 0,
		end: Math.min(start + workbench.candidatePageSize.value, workbench.candidatePeople.value.length),
	}
})
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
const selectedPersonNeedsFullRow = (item: typeof workbench.selectedPeople.value[number]) => {
	const personNameLength = Array.from(String(workbench.personName(item.person)).trim()).length
	const positionLabelLength = item.positionIds.reduce(
		(total, positionId) => total + Array.from(String(workbench.positionLabel(positionId)).trim()).length,
		0,
	)
	return personNameLength > 8 || item.positionIds.length > 2 || positionLabelLength > 12
}

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
		<header v-if="drawer" class="picker-heading">
			<div>
				<h2>人物选择</h2>
			</div>
			<n-button size="large" quaternary circle attr-type="button" aria-label="关闭人物选择" title="关闭人物选择" @click="emit('close')">
				<AppIcon name="close" />
			</n-button>
		</header>

		<section class="selected-tray" aria-label="已选人物">
			<n-collapse
				v-model:expanded-names="selectedTrayExpandedNames"
				display-directive="show"
			>
				<n-collapse-item name="selected-people">
					<template #header>已选人物</template>
					<template #header-extra>{{ workbench.selectedPeople.value.length }} 人 · {{ selectedScopeCount }} 个身份</template>
					<div id="selected-people-list" class="selected-people-list">
						<article
							v-for="(item, index) in workbench.selectedPeople.value"
							:key="item.person.id"
							class="selected-person-row"
							:class="{ 'selected-person-row--full': selectedPersonNeedsFullRow(item) }"
						>
							<span class="identity-marker" aria-hidden="true">{{ selectionSlot(index) }}</span>
							<span class="selected-person-row__copy">
								<strong>{{ workbench.personName(item.person) }}</strong>
								<span class="selected-person-row__positions">
									<n-tag v-for="positionId in item.positionIds" :key="positionId" :size="controlSize" closable @close="workbench.toggleScope(item.person.id, positionId)">
										{{ workbench.positionLabel(positionId) }}
									</n-tag>
									<span v-if="availablePositionOptions(item).length" class="position-add-select">
										<n-select
											:size="controlSize"
											:value="null"
											:options="availablePositionOptions(item)"
											placeholder="＋ 添加身份…"
											:aria-label="`为${workbench.personName(item.person)}添加身份`"
											@update:value="addIdentity(item.person.id, $event)"
										/>
									</span>
								</span>
							</span>
							<n-button class="selected-person-row__remove" :size="controlSize" type="error" quaternary circle attr-type="button" :aria-label="`移除${workbench.personName(item.person)}的全部身份`" :title="`移除${workbench.personName(item.person)}`" @click="workbench.removePerson(item.person.id)">
								<AppIcon name="close" :size="16" />
							</n-button>
						</article>
						<div v-if="!workbench.selectedPeople.value.length" class="selected-empty">从下方候选中选择至少两个人物。</div>
					</div>
				</n-collapse-item>
			</n-collapse>
		</section>

		<section class="candidate-browser" aria-labelledby="candidate-title">
			<div class="picker-section-heading">
				<strong id="candidate-title">候选人物</strong>
				<span>{{ candidatePositionLabel }} · {{ candidateRange.start }}—{{ candidateRange.end }} / {{ candidatePositionCount }}</span>
			</div>

			<div v-if="workbench.candidatePositionOptions.value.length > 1" class="candidate-position-browser">
				<span class="candidate-position-browser__label">浏览职位</span>
				<n-select
					:size="controlSize"
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
				<div class="candidate-search">
					<n-input :size="controlSize" v-model:value="workbench.candidateSearch.value" :clearable="Boolean(workbench.candidateSearch.value)" autocomplete="off" placeholder="筛选当前结果…" :aria-label="`搜索${candidatePositionLabel}候选人物`" :input-props="{ name: 'candidateSearch', spellcheck: 'false' }">
						<template #prefix><AppIcon name="search" :size="16" /></template>
					</n-input>
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
						<strong :title="workbench.personName(person)">{{ workbench.personName(person) }}</strong>
						<small class="candidate-row__meta">
							<span class="candidate-rank">#{{ candidateRankById.get(person.id) ?? '—' }}</span>
							<span aria-hidden="true">·</span>
							<span class="candidate-work-count"><strong>{{ person.activeSubjectCount }}</strong> 部</span>
						</small>
						<span
							v-if="otherSelectedIdentityLabels(person.id).length"
							class="candidate-other-positions"
							:title="`已选其他身份：${otherSelectedIdentityLabels(person.id).join(' / ')}`"
						>
							已选其他身份：{{ otherSelectedIdentityLabels(person.id).join(' / ') }}
						</span>
					</span>
					</button>

				<div v-if="!workbench.candidatePageItems.value.length" class="person-list__empty">
					<AppIcon name="search" :size="22" />
					<strong>没有匹配的人物</strong>
					<span>换一个搜索词。</span>
				</div>
				</div>

				<footer>
					<AdaptivePagination
						:page="workbench.candidatePage.value"
						:page-size="workbench.candidatePageSize.value"
						:item-count="workbench.candidatePeople.value.length"
						:page-sizes="candidatePageSizeOptions"
						aria-label="候选人物分页"
						@update:page="workbench.candidatePage.value = $event"
						@update:page-size="updateCandidatePageSize"
					/>
				</footer>
			</div>
		</section>

	</div>
</template>

<style scoped>
.selected-person-row {
	grid-template-columns: 20px minmax(0, 1fr) 36px;
	align-items: center;
	gap: var(--space-2);
	min-height: 52px;
	padding-block: var(--space-1);
}

.person-picker--drawer .selected-person-row--full {
	grid-column: 1 / -1;
}

.selected-person-row > .identity-marker {
	width: 20px;
	height: 20px;
	border: 0;
	border-radius: 0;
	background: transparent;
	color: var(--text-3);
	font-size: var(--text-caption);
}

.selected-person-row__copy {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: var(--space-1) var(--space-2);
}

.selected-person-row__copy > strong {
	overflow: visible;
	text-overflow: clip;
	white-space: normal;
	overflow-wrap: anywhere;
}

.selected-person-row__positions {
	display: flex;
	flex-wrap: wrap;
	gap: var(--space-1);
}

.selected-person-row--full {
	align-items: start;
	padding-block: var(--space-2);
}

.selected-person-row--full .selected-person-row__copy {
	display: grid;
	align-items: start;
	gap: var(--space-2);
}

.selected-person-row--full .selected-person-row__copy > strong {
	width: 100%;
	overflow: visible;
	text-overflow: clip;
	white-space: normal;
	overflow-wrap: anywhere;
}

.selected-person-row--full .selected-person-row__positions {
	width: 100%;
}

.selected-person-row--full > .identity-marker,
.selected-person-row--full > .selected-person-row__remove {
	margin-top: var(--space-1);
}

.position-add-select {
	display: inline-block;
	width: 112px;
}

.candidate-row__identity {
	display: grid;
	grid-area: identity;
	min-width: 0;
}

.candidate-row__identity strong,
.candidate-row__identity small,
.candidate-other-positions {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.candidate-row__meta {
	display: flex;
	align-items: baseline;
	gap: var(--space-1);
	color: var(--text-3);
}

.candidate-rank,
.candidate-other-positions {
	color: var(--text-3);
}

.candidate-work-count strong {
	color: var(--text-2);
	font-size: inherit;
}

.candidate-other-positions {
	margin-top: var(--space-1);
	font-size: var(--text-caption);
}

.person-row--candidate {
	grid-template-areas: "portrait identity";
	grid-template-columns: 36px minmax(0, 1fr);
	width: 100%;
	min-height: 56px;
	margin-inline: 0;
	padding: var(--space-2);
	border-radius: var(--radius-control);
}

.candidate-row__portrait {
	grid-area: portrait;
}

.candidate-position-results {
	container: candidate-results / inline-size;
}

@container candidate-results (min-width: 270px) {
	.person-list--candidate {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-1);
	}

	.person-list--candidate .person-list__empty {
		grid-column: 1 / -1;
	}
}

.person-picker--drawer .candidate-browser {
	padding-bottom: max(var(--section-pad), env(safe-area-inset-bottom));
}

@container candidate-results (max-width: 269px) {
	.person-list--candidate {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-1);
	}
}

</style>
