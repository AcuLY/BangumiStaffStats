<script setup lang="ts">
import { computed, nextTick, watch } from 'vue'
import type { Subject } from '../types'
import { categoricalPaletteForTheme } from '../categoricalPalette'
import { localizedNameSearchTerms, localizedNameSearchValue } from '../domain/nameSearch'
import { RESULT_EMPTY_COPY, SEARCH_EMPTY_COPY } from '../searchEmptyCopy'
import {
	preferenceContribution,
	summarizePreference,
	type PreferenceContribution,
} from '../domain/preference'
import { useWorkbench } from '../composables/useWorkbench'
import { useWorkbenchControlSize } from '../composables/useWorkbenchControlSize'
import {
	compareSubjectNumber,
	compareSubjectText,
	SUBJECT_WORK_PAGE_SIZES,
	useSubjectWorkBrowser,
	type SubjectWorkSortOption,
} from '../composables/useSubjectWorkBrowser'
import AppIcon from './AppIcon.vue'
import ComparisonRatingDistribution from './ComparisonRatingDistribution.vue'
import PreferenceWorkList from './PreferenceWorkList.vue'
import SubjectWorkBrowser from './SubjectWorkBrowser.vue'
import SubjectTagSummary from './SubjectTagSummary.vue'
import SinglePersonCooperation from './SinglePersonCooperation.vue'
import SharedRatingSummary from './SharedRatingSummary.vue'
import SharedWorkParticipants from './SharedWorkParticipants.vue'
import SelectedPersonCard from './SelectedPersonCard.vue'

const workbench = useWorkbench()
const seriesMode = computed(() => workbench.query.mergeSeries)
const emit = defineEmits<{ 'request-person-selection': [] }>()
const { controlSize } = useWorkbenchControlSize()
type SharedWorkSort = 'personal' | 'score' | 'date'
const sharedSortOptions = computed<SubjectWorkSortOption<SharedWorkSort>[]>(() => [
	...(workbench.query.isGlobal ? [] : [{ label: '我的评分', value: 'personal' as const }]),
	{ label: workbench.query.isGlobal ? '评分' : '全站评分', value: 'score' },
	...(workbench.query.isGlobal ? [] : [{ label: '收藏日期', value: 'date' as const }]),
])
const floorTwo = (value: number) => Math.floor(value * 100) / 100
const validAverage = (values: number[]) => {
	const valid = values.filter((value) => Number.isFinite(value) && value > 0)
	return valid.length ? floorTwo(valid.reduce((sum, value) => sum + value, 0) / valid.length) : null
}
const formatScore = (value: number | null | undefined) => Number.isFinite(value) ? Number(value).toFixed(2) : '—'
const slotLabel = (index: number) => String(index + 1)
const ratedShared = computed(() => workbench.sharedSubjects.value.filter((subject) => Number(subject.collection?.rate || 0) > 0))
const personalSharedScores = computed(() => ratedShared.value.map((subject) => Number(subject.collection?.rate || 0)))
const personalAverage = computed(() => validAverage(personalSharedScores.value))
const personalHighest = computed(() => personalSharedScores.value.length ? Math.max(...personalSharedScores.value) : null)
const personalLowest = computed(() => personalSharedScores.value.length ? Math.min(...personalSharedScores.value) : null)
const globalAverage = computed(() => validAverage(workbench.sharedSubjects.value.map((subject) => Number(subject.score || 0))))

type SharedPreferenceContribution = PreferenceContribution & { subject: Subject }
const sharedPreferenceContributions = computed<SharedPreferenceContribution[]>(() => {
	if (workbench.query.isGlobal) return []
	return workbench.sharedSubjects.value
		.map((subject): SharedPreferenceContribution | null => {
			const contribution = preferenceContribution({
				subjectId: Number(subject.id),
				userScore: Number(subject.collection?.rate || 0),
				globalScore: Number(subject.score || 0),
				seriesId: subject.seriesId,
			})
			return contribution ? { ...contribution, subject } : null
		})
		.filter((item): item is SharedPreferenceContribution => Boolean(item))
		.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference)
			|| Number(a.subjectId) - Number(b.subjectId))
})
const sharedPreferenceSummary = computed(() => summarizePreference(
	workbench.sharedSubjects.value.map((subject) => ({
		subjectId: Number(subject.id),
		userScore: Number(subject.collection?.rate || 0),
		globalScore: Number(subject.score || 0),
		seriesId: subject.seriesId,
	})),
	{
		priorWorkCount: Number(workbench.snapshot.value?.meta.preference?.priorSeriesCount) || 5,
		mergeSeries: workbench.query.mergeSeries,
	},
))
const morePreferredShared = computed(() => sharedPreferenceContributions.value
	.filter((item) => item.difference > 0)
	.slice(0, 3))
const moreConservativeShared = computed(() => sharedPreferenceContributions.value
	.filter((item) => item.difference < 0)
	.slice(0, 3))
const resultSubjects = (ids: readonly number[]) => workbench.resultSubjectsForIds(ids)
const profileAverage = (ids: number[]) => validAverage(resultSubjects(ids).map((subject) => Number(subject.collection?.rate || 0)))
const profileGlobalAverage = (ids: number[]) => validAverage(resultSubjects(ids).map((subject) => Number(subject.score || 0)))
const profileModeAverage = (ids: number[]) => workbench.query.isGlobal ? profileGlobalAverage(ids) : profileAverage(ids)

const selectedMode = computed(() => workbench.selectedPeople.value.length > 2 ? 'group' : 'pair')
interface PairStat {
	a: typeof workbench.selectedPeople.value[number]
	b: typeof workbench.selectedPeople.value[number]
	count: number
	globalAverage: number | null
	userAverage: number | null
}

const pairStats = computed<PairStat[]>(() => {
	const pairs: PairStat[] = []
	workbench.selectedPeople.value.forEach((a, index) => {
		for (const b of workbench.selectedPeople.value.slice(index + 1)) {
			const bIds = new Set(b.subjectIds)
			const ids = a.subjectIds.filter((id) => bIds.has(id))
			const subjects = resultSubjects(ids)
			pairs.push({
				a,
				b,
				count: subjects.length,
				globalAverage: validAverage(subjects.map((subject) => Number(subject.score || 0))),
				userAverage: validAverage(subjects.map((subject) => Number(subject.collection?.rate || 0))),
			})
		}
	})
	return pairs.sort((a, b) => b.count - a.count || Number(b.globalAverage || -1) - Number(a.globalAverage || -1))
})
const bestPair = computed(() => pairStats.value[0] ?? null)
const pairKey = (aId: number, bId: number) => aId < bId ? `${aId}:${bId}` : `${bId}:${aId}`
const pairStatsByPeople = computed(() => new Map(pairStats.value.map((pair) => [
	pairKey(pair.a.person.id, pair.b.person.id),
	pair,
])))
const pairFor = (rowId: number, columnId: number) => pairStatsByPeople.value.get(pairKey(rowId, columnId))
const pairModeAverage = (pair: PairStat | undefined) => workbench.query.isGlobal ? pair?.globalAverage : pair?.userAverage

const seriesColors = computed(() => categoricalPaletteForTheme(workbench.theme.value))
const comparisonSeries = computed(() => {
	const people = workbench.selectedPeople.value.map((item, index) => {
		const subjects = resultSubjects(item.subjectIds)
		return {
			key: `person-${item.person.id}`,
			marker: slotLabel(index),
			label: workbench.personName(item.person),
			color: seriesColors.value[(index + 1) % seriesColors.value.length],
			subjects,
		}
	})
	const sharedWorks = {
		key: 'shared-works',
		marker: '',
		label: seriesMode.value ? '共同系列' : '共同作品',
		color: seriesColors.value[0],
		subjects: workbench.sharedSubjects.value,
	}
	return [sharedWorks, ...people]
})

const {
	search: sharedSearch,
	sort: sharedSort,
	order: sharedOrder,
	page: sharedPage,
	pageSize: sharedPageSize,
	sortedSubjects: sharedWorks,
	visibleSubjects: visibleSharedWorks,
	rangeLabel: sharedRangeLabel,
} = useSubjectWorkBrowser<SharedWorkSort>({
	subjects: () => workbench.sharedSubjects.value,
	searchTerms: (subject) => [
		...localizedNameSearchTerms(subject),
		...(subject.series?.members.flatMap((member) => localizedNameSearchTerms(member)) ?? []),
	],
	initialSort: workbench.query.isGlobal ? 'score' : 'personal',
	includeSubject: (subject, sort) => sort !== 'date' || Boolean(subject.collection?.updatedAt),
	comparators: {
		personal: (a, b, direction) => compareSubjectNumber(a.collection?.rate, b.collection?.rate, direction),
		score: (a, b, direction) => compareSubjectNumber(a.score, b.score, direction),
		date: (a, b, direction) => compareSubjectText(a.collection?.updatedAt, b.collection?.updatedAt, direction),
	},
	fallbackComparator: (a, b, direction) => compareSubjectNumber(a.score, b.score, direction),
})

watch(() => workbench.query.isGlobal, (isGlobal) => {
	if (isGlobal && (sharedSort.value === 'personal' || sharedSort.value === 'date')) sharedSort.value = 'score'
})

const focusSharedWork = async (subject: Subject) => {
	sharedSearch.value = localizedNameSearchValue(subject)
	sharedPage.value = 1
	await nextTick()
	document.querySelector<HTMLInputElement>(`input[aria-label="搜索共同${seriesMode.value ? '系列或系列内作品' : '作品'}"]`)?.focus()
}

const sharedPageSizes = computed(() => seriesMode.value
	? SUBJECT_WORK_PAGE_SIZES.map((option) => ({ ...option, label: `每页 ${option.value} 个系列` }))
	: SUBJECT_WORK_PAGE_SIZES)

</script>

<template>
	<div v-if="!workbench.selectedPeople.value.length" class="analysis-empty surface-panel">
		<span class="analysis-empty__icon"><AppIcon name="people" :size="30" /></span>
		<h2>尚未选择人物</h2>
		<n-button :size="controlSize" type="primary" @click="emit('request-person-selection')">选择人物</n-button>
	</div>
	<SinglePersonCooperation v-else-if="workbench.selectedPeople.value.length === 1" />

	<article v-else class="analysis-dashboard analysis-dashboard--unified surface-panel" aria-label="共演分析" :data-analysis-mode="selectedMode">
		<section class="analysis-section relationship-hero selected-people-panel" aria-label="已选人物概览">
			<ol class="selected-people-grid">
				<li v-for="(item, index) in workbench.selectedPeople.value" :key="item.person.id">
					<SelectedPersonCard
						:person="item.person"
						:position-ids="item.positionIds"
						:subject-count="workbench.resultSubjectCount(item.subjectIds)"
						:average="formatScore(profileModeAverage(item.subjectIds))"
						:index="index"
					/>
				</li>
			</ol>
			<SharedRatingSummary
				:shared-count="workbench.sharedSubjects.value.length"
				:rated-count="ratedShared.length"
				:global-average="globalAverage"
				:personal-average="personalAverage"
				:personal-highest="personalHighest"
				:personal-lowest="personalLowest"
				:show-personal="!workbench.query.isGlobal"
				:series-mode="seriesMode"
			/>
		</section>

		<section v-if="!workbench.sharedSubjects.value.length" class="analysis-empty analysis-section analysis-empty--zero">
			<span class="analysis-empty__icon"><AppIcon name="info" :size="28" /></span>
			<h2>没有共同{{ seriesMode ? '系列' : '作品' }}</h2>
		</section>

		<section v-if="workbench.sharedSubjects.value.length" class="analysis-section analysis-domain work-profile-domain" aria-labelledby="analysis-tags-title">
			<SubjectTagSummary :subjects="workbench.sharedSubjects.value" :show-personal="!workbench.query.isGlobal" :title="seriesMode ? '代表条目标签' : '作品标签'" heading-id="analysis-tags-title" />
		</section>

		<section
			v-if="workbench.sharedSubjects.value.length || selectedMode === 'group'"
			class="analysis-section analysis-domain rating-domain"
			aria-label="评分表现"
		>
			<template v-if="workbench.sharedSubjects.value.length">
				<ComparisonRatingDistribution :series="comparisonSeries" :is-global-query="workbench.query.isGlobal" :series-mode="seriesMode" />
			</template>

			<p v-else class="analysis-domain__empty">暂无全员共同{{ seriesMode ? '系列' : '作品' }}</p>

			<div v-if="selectedMode === 'group'" class="analysis-domain__block" aria-labelledby="matrix-title">
				<div class="section-heading section-heading--compact"><div><h3 id="matrix-title">组合评分对比</h3></div></div>
				<div class="matrix-details matrix-details--direct" :class="{ 'matrix-details--scrollable': workbench.selectedPeople.value.length >= 5 }">
					<div class="data-scroll-x">
						<table class="matrix-table" :style="{ '--matrix-size': workbench.selectedPeople.value.length }">
							<thead><tr><th scope="col">组合</th><th v-for="item in workbench.selectedPeople.value" :key="item.person.id" scope="col">{{ workbench.personName(item.person) }}<small>{{ item.positionIds.map(workbench.positionLabel).join(' / ') }}</small></th></tr></thead>
							<tbody>
								<tr v-for="row in workbench.selectedPeople.value" :key="row.person.id">
									<th scope="row">{{ workbench.personName(row.person) }}<small>{{ row.positionIds.map(workbench.positionLabel).join(' / ') }}</small></th>
									<td
										v-for="column in workbench.selectedPeople.value"
										:key="column.person.id"
										:class="{ 'is-diagonal': row.person.id === column.person.id, 'is-best': row.person.id !== column.person.id && Boolean(bestPair?.count) && pairFor(row.person.id, column.person.id)?.count === bestPair?.count }"
										:aria-label="row.person.id === column.person.id
											? `${workbench.personName(row.person)}参与 ${seriesMode ? workbench.resultSubjectCount(row.subjectIds) + ' 个系列' : row.subjectIds.length + ' 部作品'}，均分 ${formatScore(profileModeAverage(row.subjectIds))}`
											: `${workbench.personName(row.person)}与${workbench.personName(column.person)}共同参与 ${pairFor(row.person.id, column.person.id)?.count ?? 0} ${seriesMode ? '个系列' : '部作品'}，均分 ${formatScore(pairModeAverage(pairFor(row.person.id, column.person.id)))}`"
									>
										<template v-if="row.person.id === column.person.id"><b>{{ formatScore(profileModeAverage(row.subjectIds)) }}</b><small>{{ seriesMode ? `${workbench.resultSubjectCount(row.subjectIds)} 个系列` : `${row.subjectIds.length} 部作品` }}</small></template>
										<template v-else><b>{{ formatScore(pairModeAverage(pairFor(row.person.id, column.person.id))) }}</b><small>{{ seriesMode ? `共同 ${pairFor(row.person.id, column.person.id)?.count ?? 0} 个` : `${pairFor(row.person.id, column.person.id)?.count ?? 0} 部共同` }}</small></template>
									</td>
								</tr>
							</tbody>
						</table>
					</div>
				</div>
			</div>
		</section>

		<section v-if="workbench.sharedSubjects.value.length && !workbench.query.isGlobal" class="analysis-section analysis-domain preference-domain" aria-labelledby="shared-preference-title">
			<div class="section-heading">
				<h2 id="shared-preference-title">相对偏好</h2>
			</div>

			<p v-if="sharedPreferenceSummary.score === null" class="preference-model-note">共同{{ seriesMode ? '系列' : '作品' }}中没有同时具备我的评分与有效全站评分的{{ seriesMode ? '系列' : '作品' }}</p>

			<PreferenceWorkList
				:preferred="morePreferredShared"
				:conservative="moreConservativeShared"
				:location-scope="seriesMode ? '共同系列' : '共同作品'"
				:series-mode="seriesMode"
				@select="focusSharedWork"
			/>
		</section>

		<section v-if="workbench.sharedSubjects.value.length" class="analysis-section shared-works-section" aria-labelledby="common-works-title">
			<SubjectWorkBrowser
				v-model:search="sharedSearch"
				v-model:sort="sharedSort"
				v-model:order="sharedOrder"
				v-model:page="sharedPage"
				v-model:page-size="sharedPageSize"
				:title="seriesMode ? '共同系列' : '共同作品'"
				title-id="common-works-title"
				:subjects="visibleSharedWorks"
				:empty-text="seriesMode ? sharedSearch.trim() ? '没有符合搜索条件的系列' : '没有符合当前条件的系列' : sharedSearch.trim() ? SEARCH_EMPTY_COPY.work : RESULT_EMPTY_COPY.work"
				:sort-options="sharedSortOptions"
				:search-placeholder="seriesMode ? '搜索系列或系列内作品' : '搜索作品'"
				:search-aria-label="seriesMode ? '搜索共同系列或系列内作品' : '搜索共同作品'"
				:sort-aria-label="seriesMode ? '共同系列排序依据' : '共同作品排序依据'"
				:order-aria-label="seriesMode ? '共同系列排序方向' : '共同作品排序方向'"
				search-name="sharedWorkSearch"
				:heading-meta="`${sharedWorks.length}${sharedSearch.trim() ? ` / ${workbench.sharedSubjects.value.length}` : ''} ${seriesMode ? '个系列' : '部'}`"
				:item-count="sharedWorks.length"
				:page-sizes="sharedPageSizes"
				:pagination-summary="sharedRangeLabel"
				:pagination-aria-label="seriesMode ? '共同系列分页' : '共同作品分页'"
				:compact-aria-label="seriesMode ? '共同系列缩略模式' : '共同作品缩略模式'"
				:detailed-description="seriesMode ? '显示完整系列信息' : '显示完整作品信息'"
				:compact-description="seriesMode ? '仅显示代表条目的序号、双语名和系列均分' : '仅显示序号、双语名和评分'"
				:show-pagination="sharedWorks.length > SUBJECT_WORK_PAGE_SIZES[0].value"
			>
				<template #participants="{ subject }">
					<SharedWorkParticipants :participants="workbench.selectedPeople.value" :subject="subject" />
				</template>
			</SubjectWorkBrowser>
		</section>
	</article>
</template>
