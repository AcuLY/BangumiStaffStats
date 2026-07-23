<script setup lang="ts">
import { computed, ref } from 'vue'
import type { CandidateSortMetric } from '../types'
import { useWorkbench } from '../composables/useWorkbench'
import { useWorkbenchControlSize } from '../composables/useWorkbenchControlSize'
import { SEARCH_EMPTY_COPY } from '../searchEmptyCopy'
import SafeImage from './SafeImage.vue'
import AppIcon from './AppIcon.vue'
import AdaptivePagination from './AdaptivePagination.vue'
import SortDirectionButton from './SortDirectionButton.vue'

const props = withDefaults(defineProps<{ drawer?: boolean }>(), { drawer: false })
const emit = defineEmits<{ close: [] }>()
const workbench = useWorkbench()
const selectedTrayExpandedNames = ref<Array<string | number>>(props.drawer ? [] : ['selected-people'])
const { controlSize, isMobile } = useWorkbenchControlSize()

const selectedScopeCount = computed(() => workbench.selectedScopes.value.length)
const candidatePageSizeOptions = [5, 10, 20].map((value) => ({ label: `每页 ${value} 人`, value }))
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
const candidateSortOptions = computed<Array<{ label: string; value: CandidateSortMetric }>>(() => [
	{ label: workbench.query.mergeSeries ? '系列数' : '作品数', value: 'count' },
	...(workbench.query.isGlobal ? [] : [{ label: '我的均分', value: 'average' as const }]),
	{ label: workbench.query.isGlobal ? '均分' : '全站均分', value: 'globalAverage' },
])

const currentPositionRanking = computed(() => [...workbench.peopleById.value.values()]
	.map((person) => {
		const subjectIds = workbench.positionSubjectIds(person, workbench.candidatePositionId.value)
			.filter((id) => workbench.queryScopeSubjectIds.value.has(Number(id)))
		if (!subjectIds.length) return null
		const resultSubjects = workbench.resultSubjectsForIds(subjectIds)
		const rates = resultSubjects
			.map((subject) => Number(subject.collection?.rate || 0))
			.filter((rate) => rate > 0)
		const globalScores = resultSubjects
			.map((subject) => Number(subject.score || 0))
			.filter((score) => score > 0)
		return {
			personId: person.id,
			count: resultSubjects.length,
			average: rates.length ? rates.reduce((sum, rate) => sum + rate, 0) / rates.length : 0,
			globalAverage: globalScores.length ? globalScores.reduce((sum, score) => sum + score, 0) / globalScores.length : 0,
		}
	})
	.filter((item): item is { personId: number; count: number; average: number; globalAverage: number } => Boolean(item))
	.sort((a, b) => {
		let comparison = 0
		switch (workbench.candidateSortMetric.value) {
			case 'average':
				comparison = a.average - b.average
				break
			case 'globalAverage':
				comparison = a.globalAverage - b.globalAverage
				break
			default:
				comparison = a.count - b.count
		}
		if (comparison) return workbench.candidateAscend.value ? comparison : -comparison
		return b.count - a.count
			|| (workbench.query.isGlobal ? b.globalAverage - a.globalAverage : b.average - a.average)
			|| a.personId - b.personId
	}))

const candidateRankById = computed(() => new Map(
	currentPositionRanking.value.map((item, index) => [item.personId, index + 1]),
))
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
			<span class="picker-heading__close-hit" @click="emit('close')">
				<n-button class="picker-heading__close" :size="controlSize" quaternary circle attr-type="button" aria-label="关闭人物选择" title="关闭人物选择" @click.stop="emit('close')">
					<AppIcon name="close" :size="16" />
				</n-button>
			</span>
		</header>

		<section
			class="selected-tray"
			:class="{ 'is-expanded': selectedTrayExpandedNames.includes('selected-people') }"
			aria-label="已选人物"
		>
			<n-collapse
				v-model:expanded-names="selectedTrayExpandedNames"
				display-directive="show"
			>
				<n-collapse-item name="selected-people">
					<template #header>已选人物</template>
					<template #header-extra>
						<span
							class="selection-summary"
							:aria-label="`${workbench.selectedPeople.value.length} 人，${selectedScopeCount} 个身份`"
						>
							<span><strong>{{ workbench.selectedPeople.value.length }}</strong> 人</span>
							<span class="selection-summary__divider" aria-hidden="true"></span>
							<span><strong>{{ selectedScopeCount }}</strong> 身份</span>
						</span>
					</template>
					<ol id="selected-people-list" class="selected-people-list">
						<li
							v-for="(item, index) in workbench.selectedPeople.value"
							:key="item.person.id"
							class="selected-person-row"
							:aria-label="`第${index + 1}位，${workbench.personName(item.person)}，${item.positionIds.map((positionId) => workbench.positionLabel(positionId)).join('、')}`"
						>
							<span class="selected-person-row__ordinal" aria-hidden="true">{{ index + 1 }}</span>
							<strong class="selected-person-row__name" :title="workbench.personName(item.person)">
								<span class="selected-person-row__name-label">{{ workbench.personName(item.person) }}</span>
							</strong>
							<span class="selected-person-row__positions">
								<button
									v-for="positionId in item.positionIds"
									:key="positionId"
									class="selected-position-action"
									type="button"
									:aria-label="`移除${workbench.personName(item.person)}的${workbench.positionLabel(positionId)}身份`"
									:title="`移除${workbench.positionLabel(positionId)}身份`"
									@click="workbench.toggleScope(item.person.id, positionId)"
								>
									<span class="selected-position-action__surface">
										<span class="selected-position-tag__label" :title="workbench.positionLabel(positionId)">{{ workbench.positionLabel(positionId) }}</span>
										<AppIcon name="close" :size="12" />
									</span>
								</button>
							</span>
							<button
								class="selected-person-row__remove"
								type="button"
								:aria-label="`移除${workbench.personName(item.person)}的全部身份`"
								:title="`移除${workbench.personName(item.person)}`"
								@click="workbench.removePerson(item.person.id)"
							>
								<span class="selected-person-row__remove-visual" aria-hidden="true">
									<AppIcon name="close" :size="14" />
								</span>
							</button>
						</li>
					</ol>
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
					:menu-size="controlSize"
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
					<n-input :size="controlSize" v-model:value="workbench.candidateSearch.value" :clearable="Boolean(workbench.candidateSearch.value)" autocomplete="off" placeholder="搜索人物" :aria-label="`搜索${candidatePositionLabel}候选人物`" :input-props="{ name: 'candidateSearch', spellcheck: 'false' }">
						<template #prefix><AppIcon name="search" :size="16" /></template>
					</n-input>
					<n-select
						class="candidate-sort-select"
						:size="controlSize"
						:menu-size="controlSize"
						v-model:value="workbench.candidateSortMetric.value"
						:options="candidateSortOptions"
						:consistent-menu-width="false"
						aria-label="候选人物排序规则"
					/>
					<SortDirectionButton
						class="candidate-sort-direction"
						:size="controlSize"
						:order="workbench.candidateAscend.value ? 'asc' : 'desc'"
						context-label="候选人物排序方向"
						@update:order="workbench.candidateAscend.value = $event === 'asc'"
					/>
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
								:width="isMobile ? 32 : 36"
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
								<span class="candidate-work-count" :title="workbench.query.mergeSeries ? `${person.activeSubjectCount} 个系列` : undefined"><strong>{{ person.activeSubjectCount }}</strong> {{ workbench.query.mergeSeries ? '个' : '部' }}</span>
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

					<div
						v-if="workbench.candidateSearch.value.trim() && !workbench.candidatePeople.value.length"
						class="person-list__empty"
						role="status"
						aria-live="polite"
					>
						<AppIcon name="search" :size="22" />
						<strong>{{ SEARCH_EMPTY_COPY.person }}</strong>
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
	margin-inline: 0;
	padding: calc(var(--space-2) - 1px) var(--space-2);
	border-radius: var(--radius-control);
}

.candidate-row__portrait {
	grid-area: portrait;
}

.candidate-position-results {
	container: candidate-results / inline-size;
}

.person-list--candidate .person-list__empty {
	grid-column: 1 / -1;
}

@container candidate-results (min-width: 270px) {
		.person-list--candidate {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: var(--space-1);
		}
}

.person-picker--drawer .candidate-browser {
	padding-bottom: max(var(--section-pad), env(safe-area-inset-bottom));
}

@media (width < 780px) {
	.person-row--candidate {
		grid-template-columns: 32px minmax(0, 1fr);
	}

	.candidate-row__portrait {
		width: 32px;
	}

	.person-row--candidate .person-row__avatar {
		width: 32px;
		height: auto;
	}
}

@container candidate-results (max-width: 269px) {
	.candidate-search {
		grid-template-areas:
			"search search"
			"sort direction";
		grid-template-columns: minmax(0, 1fr) auto;
	}

	.candidate-search > :first-child {
		grid-area: search;
	}

	.candidate-sort-select {
		grid-area: sort;
	}

	.candidate-sort-direction {
		grid-area: direction;
	}

	.person-list--candidate {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-1);
	}
}

</style>
