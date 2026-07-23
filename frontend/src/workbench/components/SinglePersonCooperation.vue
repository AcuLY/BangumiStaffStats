<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Person, RankingMetric, Subject } from '../types'
import { localizedNameSearchTerms, matchesLocalizedNameSearch } from '../domain/nameSearch'
import { overallScoreExplanation, preferenceExplanation } from '../domain/metricExplanations'
import { summarizePreference, type PreferenceSummary } from '../domain/preference'
import { summarizeRatings } from '../domain/ratingSummary'
import { useWorkbench } from '../composables/useWorkbench'
import { RESULT_EMPTY_COPY, SEARCH_EMPTY_COPY } from '../searchEmptyCopy'
import {
	compareSubjectNumber,
	compareSubjectText,
	SUBJECT_WORK_PAGE_SIZES,
	useSubjectWorkBrowser,
	type SubjectWorkSortOption,
	type SubjectWorkSortOrder,
} from '../composables/useSubjectWorkBrowser'
import AdaptivePagination from './AdaptivePagination.vue'
import AppIcon from './AppIcon.vue'
import SafeImage from './SafeImage.vue'
import SubjectWorkBrowser from './SubjectWorkBrowser.vue'
import RankedPersonList from './RankedPersonList.vue'
import SharedWorkParticipants from './SharedWorkParticipants.vue'
import WorkListToolbar from './WorkListToolbar.vue'
import SelectedPersonCard from './SelectedPersonCard.vue'

type PositionFilter = 'all' | number
type CooperationWorkSort = 'personal' | 'score' | 'date'

interface CooperationPerson {
	person: Person
	positionIds: number[]
	subjectIds: number[]
	participantSubjectIds: number[]
	subjectCount: number
	ratedSubjectCount: number
	average: number | null
	overall: number | null
	preference: PreferenceSummary | null
}

interface CooperationLeader {
	label: string
	metric: RankingMetric
	partner: CooperationPerson | null
	value: string
}

const workbench = useWorkbench()
const seriesMode = computed(() => workbench.query.mergeSeries)

const partnerSearch = ref('')
const partnerMetric = ref<RankingMetric>('count')
const partnerOrder = ref<SubjectWorkSortOrder>('desc')
const partnerPosition = ref<PositionFilter>('all')
const partnerPage = ref(1)
const partnerPageSize = ref(10)
const partnerPageSizeOptions = [5, 10, 20].map((value) => ({ label: `每页 ${value} 人`, value }))
const focusedPartnerId = ref(0)
const visibleLeaderNameTooltip = ref<RankingMetric | null>(null)
const cooperationMetricTooltipVisible = ref(false)

const leaderNameElement = (target: EventTarget | null) => {
	if (!(target instanceof HTMLElement)) return null
	if (target.matches('.single-cooperation__leader-person strong')) return target
	return target.querySelector<HTMLElement>('.single-cooperation__leader-person strong')
}
const showLeaderNameTooltip = (metric: RankingMetric, event: Event) => {
	const element = leaderNameElement(event.currentTarget)
	visibleLeaderNameTooltip.value = element && element.scrollWidth > element.clientWidth ? metric : null
}
const hideLeaderNameTooltip = (metric: RankingMetric) => {
	if (visibleLeaderNameTooltip.value === metric) visibleLeaderNameTooltip.value = null
}

const selectedPerson = computed(() => workbench.selectedPeople.value[0] ?? null)
const sourceScoreLabel = computed(() => '均分')
const scoreForSubject = (subject: Subject | undefined) => workbench.query.isGlobal
	? Number(subject?.score || 0)
	: Number(subject?.collection?.rate || 0)
const overallScore = (subjectIds: number[]) => {
	const summary = summarizeRatings(workbench.resultSubjectsForIds(subjectIds).map(scoreForSubject))
	return summary.validCount ? summary.overall : null
}
const selectedPersonAverage = computed(() => {
	const selected = selectedPerson.value
	if (!selected) return '—'
	const summary = summarizeRatings(workbench.resultSubjectsForIds(selected.subjectIds).map(scoreForSubject))
	return summary.validCount ? summary.average.toFixed(2) : '—'
})
const preferenceForSubjects = (subjectIds: number[]) => {
	if (workbench.query.isGlobal) return null
	return summarizePreference(workbench.resultSubjectsForIds(subjectIds)
		.map((subject) => ({
			subjectId: Number(subject.id),
			userScore: Number(subject.collection?.rate || 0),
			globalScore: Number(subject.score || 0),
			seriesId: subject.seriesId,
		})), {
			priorWorkCount: Number(workbench.snapshot.value?.meta.preference?.priorSeriesCount) || 5,
			mergeSeries: workbench.query.mergeSeries,
		})
}

const positionOptions = computed(() => [
	...(workbench.coStarPositionIds.value.length > 1
		? [{ label: '全部职位', value: 'all' as const }]
		: []),
	...workbench.coStarPositionIds.value.map((positionId) => ({
		label: workbench.positionLabel(positionId),
		value: positionId,
	})),
])
const activePositionIds = computed(() => partnerPosition.value === 'all'
	? workbench.coStarPositionIds.value
	: [Number(partnerPosition.value)])
const activePositionLabel = computed(() => partnerPosition.value === 'all'
	? '全部已查询职位'
	: workbench.positionLabel(Number(partnerPosition.value)))

const cooperationCandidates = computed<CooperationPerson[]>(() => {
	const selected = selectedPerson.value
	if (!selected) return []
	const selectedSubjectIds = new Set(selected.subjectIds)

	return [...workbench.peopleById.value.values()]
		.filter((person) => Number(person.id) !== Number(selected.person.id))
		.map((person): CooperationPerson | null => {
			const matches = activePositionIds.value.map((positionId) => {
				const participantSubjectIds = workbench.positionSubjectIds(person, positionId)
					.map(Number)
					.filter((id) => workbench.queryScopeSubjectIds.value.has(id))
				return {
					positionId,
					participantSubjectIds,
					subjectIds: participantSubjectIds.filter((id) => selectedSubjectIds.has(id)),
				}
			}).filter((item) => item.subjectIds.length)
			if (!matches.length) return null

			const subjectIds = [...new Set(matches.flatMap((item) => item.subjectIds))]
			const participantSubjectIds = [...new Set(matches.flatMap((item) => item.participantSubjectIds))]
			const resultSubjects = workbench.resultSubjectsForIds(subjectIds)
			const scoreSummary = summarizeRatings(resultSubjects.map(scoreForSubject))
			return {
				person,
				positionIds: matches.map((item) => item.positionId),
				subjectIds,
				participantSubjectIds,
				subjectCount: resultSubjects.length,
				ratedSubjectCount: scoreSummary.validCount,
				average: scoreSummary.validCount ? scoreSummary.average : null,
				overall: overallScore(subjectIds),
				preference: preferenceForSubjects(subjectIds),
			}
		})
		.filter((item): item is CooperationPerson => Boolean(item))
})

const cooperationPeople = computed<CooperationPerson[]>(() => {
	return cooperationCandidates.value
		.filter((item) => matchesLocalizedNameSearch(item.person, partnerSearch.value))
		.sort((a, b) => {
			const metricValue = (item: CooperationPerson) => {
				if (partnerMetric.value === 'average') return item.average
				if (partnerMetric.value === 'overall') return item.overall
				if (partnerMetric.value === 'preference') return item.preference?.score ?? null
				return item.subjectCount
			}
			const aValue = metricValue(a)
			const bValue = metricValue(b)
			const aValid = aValue !== null && Number.isFinite(aValue)
			const bValid = bValue !== null && Number.isFinite(bValue)
			if (aValid !== bValid) return aValid ? -1 : 1
			const delta = Number(aValue || 0) - Number(bValue || 0)
			if (delta) return partnerOrder.value === 'asc' ? delta : -delta
			return b.subjectCount - a.subjectCount
				|| Number(b.average || 0) - Number(a.average || 0)
				|| Number(a.person.id) - Number(b.person.id)
		})
})

const cooperationMetricValue = (item: CooperationPerson, metric: RankingMetric) => {
	if (metric === 'average') return item.average
	if (metric === 'overall') return item.overall
	if (metric === 'preference') return item.preference?.score ?? null
	return item.subjectCount
}
const cooperationLeaderFor = (metric: RankingMetric) => cooperationPeople.value.reduce<CooperationPerson | null>((leader, item) => {
	const itemValue = cooperationMetricValue(item, metric)
	if (itemValue === null || !Number.isFinite(itemValue)) return leader
	if (!leader) return item
	const leaderValue = cooperationMetricValue(leader, metric)
	if (leaderValue === null || itemValue > leaderValue) return item
	if (itemValue < leaderValue) return leader
	if (item.subjectCount !== leader.subjectCount) return item.subjectCount > leader.subjectCount ? item : leader
	if (Number(item.average || 0) !== Number(leader.average || 0)) return Number(item.average || 0) > Number(leader.average || 0) ? item : leader
	return Number(item.person.id) < Number(leader.person.id) ? item : leader
}, null)
const formatLeaderValue = (partner: CooperationPerson | null, metric: RankingMetric) => {
	if (!partner) return '—'
	const value = cooperationMetricValue(partner, metric)
	if (value === null || !Number.isFinite(value)) return '—'
	if (metric === 'count') return `${value} ${seriesMode.value ? '个' : '部'}`
	if (metric === 'preference') return `${value < 0 ? '−' : '+'}${Math.abs(value).toFixed(2)}`
	return value.toFixed(2)
}
const cooperationLeaders = computed<CooperationLeader[]>(() => {
	const leaders: Array<Omit<CooperationLeader, 'value'>> = [
		{ label: seriesMode.value ? '系列数最高' : '合作数最高', metric: 'count', partner: cooperationLeaderFor('count') },
		{ label: `${sourceScoreLabel.value}最高`, metric: 'average', partner: cooperationLeaderFor('average') },
		{ label: '综合分最高', metric: 'overall', partner: cooperationLeaderFor('overall') },
		...(workbench.query.isGlobal ? [] : [{ label: '偏好分最高', metric: 'preference' as const, partner: cooperationLeaderFor('preference') }]),
	]
	return leaders.map((leader) => ({
		...leader,
		value: formatLeaderValue(leader.partner, leader.metric),
	}))
})

const partnerPageCount = computed(() => Math.max(1, Math.ceil(cooperationPeople.value.length / partnerPageSize.value)))
const visiblePartners = computed(() => {
	const start = (partnerPage.value - 1) * partnerPageSize.value
	return cooperationPeople.value.slice(start, start + partnerPageSize.value)
})
const visibleRankedPartners = computed(() => visiblePartners.value.map((item) => ({
	...item.person,
	positionIds: item.positionIds,
	subjectIds: item.subjectIds,
	subjectCount: item.subjectCount,
	ratedSubjectCount: item.ratedSubjectCount,
	globalRatedSubjectCount: workbench.query.isGlobal ? item.ratedSubjectCount : undefined,
	userAverage: workbench.query.isGlobal ? 0 : item.average ?? 0,
	globalAverage: workbench.query.isGlobal ? item.average ?? 0 : item.person.globalAverage,
	preference: item.preference ?? undefined,
})))
const partnerRangeLabel = computed(() => {
	const start = cooperationPeople.value.length ? (partnerPage.value - 1) * partnerPageSize.value + 1 : 0
	const end = Math.min(partnerPage.value * partnerPageSize.value, cooperationPeople.value.length)
	return `${start}—${end} / ${cooperationPeople.value.length}`
})
const focusedPartner = computed(() => cooperationCandidates.value
	.find((item) => Number(item.person.id) === Number(focusedPartnerId.value)) ?? null)
const cooperationMetricHelp = computed(() => {
	const partner = focusedPartner.value
	const explanations = [overallScoreExplanation({
		isGlobal: workbench.query.isGlobal,
		seriesMode: seriesMode.value,
		average: partner?.average,
		validCount: partner?.ratedSubjectCount,
		overall: partner?.overall,
		subjectLabel: '当前合作人物',
	})]
	if (!workbench.query.isGlobal) explanations.push(preferenceExplanation({
		seriesMode: seriesMode.value,
		summary: partner?.preference,
		subjectLabel: '当前合作人物',
	}))
	return explanations.join('\n\n')
})
const focusedSubjects = computed(() => {
	const partner = focusedPartner.value
	const selected = selectedPerson.value
	if (!partner || !selected) return []
	return workbench.resultSubjectsForIds(partner.subjectIds, {
		sharedSubjectIds: partner.subjectIds,
		participantSubjectIds: {
			[String(selected.person.id)]: selected.subjectIds,
			[String(partner.person.id)]: partner.participantSubjectIds,
		},
	})
})

const partnerSortOptions = computed(() => [
	{ label: seriesMode.value ? '系列数' : '作品数', value: 'count' as const },
	{ label: sourceScoreLabel.value, value: 'average' as const },
	{ label: '综合分', value: 'overall' as const },
	...(workbench.query.isGlobal ? [] : [{ label: '相对偏好', value: 'preference' as const }]),
])
const workSortOptions = computed<SubjectWorkSortOption<CooperationWorkSort>[]>(() => [
	...(workbench.query.isGlobal ? [] : [{ label: '我的评分', value: 'personal' as const }]),
	{ label: workbench.query.isGlobal ? '评分' : '全站评分', value: 'score' },
	...(workbench.query.isGlobal ? [] : [{ label: '收藏日期', value: 'date' as const }]),
])
const workPageSizes = computed(() => seriesMode.value
	? SUBJECT_WORK_PAGE_SIZES.map((option) => ({ ...option, label: `每页 ${option.value} 个系列` }))
	: SUBJECT_WORK_PAGE_SIZES)

const {
	search: workSearch,
	sort: workSort,
	order: workOrder,
	page: workPage,
	pageSize: workPageSize,
	sortedSubjects: focusedWorks,
	visibleSubjects: visibleWorks,
	rangeLabel: workRangeLabel,
} = useSubjectWorkBrowser<CooperationWorkSort>({
	subjects: focusedSubjects,
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

const focusPartner = (personId: number) => {
	focusedPartnerId.value = personId
	workSearch.value = ''
}
const updatePartnerMetric = (value: string) => {
	partnerMetric.value = value as RankingMetric
}

watch([partnerSearch, partnerMetric, partnerOrder, partnerPosition, partnerPageSize], () => { partnerPage.value = 1 })
watch(partnerPageCount, (count) => { partnerPage.value = Math.min(partnerPage.value, count) })
watch(cooperationPeople, (people) => {
	if (people.some((item) => Number(item.person.id) === Number(focusedPartnerId.value))) return
	if (people.length) {
		focusedPartnerId.value = people[0].person.id
		return
	}
	if (cooperationCandidates.value.some((item) => Number(item.person.id) === Number(focusedPartnerId.value))) return
	focusedPartnerId.value = cooperationCandidates.value[0]?.person.id ?? 0
}, { immediate: true })
watch(() => selectedPerson.value?.person.id, () => {
	partnerSearch.value = ''
	partnerPage.value = 1
})
watch(workbench.coStarPositionIds, (positionIds) => {
	if (positionIds.length <= 1) partnerPosition.value = positionIds[0] ?? 'all'
	else if (partnerPosition.value !== 'all' && !positionIds.includes(Number(partnerPosition.value))) partnerPosition.value = 'all'
}, { immediate: true })
watch(() => workbench.query.isGlobal, (isGlobal) => {
	if (isGlobal && partnerMetric.value === 'preference') partnerMetric.value = 'count'
	if (isGlobal && (workSort.value === 'personal' || workSort.value === 'date')) workSort.value = 'score'
})
</script>

<template>
	<article class="single-cooperation analysis-dashboard analysis-dashboard--unified surface-panel" aria-label="单人物共演分析">
		<section v-if="selectedPerson" class="analysis-section relationship-hero selected-people-panel single-cooperation__selection" aria-label="已选人物概览">
			<div class="single-cooperation__selection-content">
				<ol class="selected-people-grid selected-people-grid--single">
					<li>
						<SelectedPersonCard
							:person="selectedPerson.person"
							:position-ids="selectedPerson.positionIds"
							:subject-count="workbench.resultSubjectCount(selectedPerson.subjectIds)"
							:average="selectedPersonAverage"
							:index="0"
						/>
					</li>
				</ol>
				<div class="single-cooperation__profile-copy">
					<div
						class="single-cooperation__summary-grid metric-grid"
						:aria-label="`合作人物 ${cooperationPeople.length} 位，各指标最高合作人物`"
					>
						<div class="single-cooperation__summary-cell metric-unit">
							<b class="metric-unit__value">{{ cooperationPeople.length }}</b>
							<small class="metric-unit__label">合作人物</small>
						</div>
						<button
							v-for="leader in cooperationLeaders"
							:key="leader.metric"
							class="single-cooperation__leader metric-unit metric-unit--with-support"
							:class="{ 'is-focused': leader.partner?.person.id === focusedPartnerId }"
							type="button"
							:disabled="!leader.partner"
							:aria-pressed="leader.partner?.person.id === focusedPartnerId"
							:aria-controls="leader.partner ? 'single-cooperation-works-title' : undefined"
							:aria-label="leader.partner ? `${leader.label}：${workbench.personName(leader.partner.person)}，${leader.value}` : `${leader.label}：暂无数据`"
							@focus="showLeaderNameTooltip(leader.metric, $event)"
							@blur="hideLeaderNameTooltip(leader.metric)"
							@click="leader.partner && focusPartner(leader.partner.person.id)"
						>
							<b class="metric-unit__value">{{ leader.value }}</b>
							<small class="single-cooperation__cell-label metric-unit__label">{{ leader.label }}</small>
							<span class="single-cooperation__leader-person metric-unit__support">
								<SafeImage
									v-if="leader.partner"
									class="single-cooperation__leader-avatar"
									:sources="workbench.personImageSources(leader.partner.person)"
									:alt="workbench.personName(leader.partner.person)"
									kind="person"
									decorative
									:width="28"
								/>
								<n-tooltip
									:show="visibleLeaderNameTooltip === leader.metric"
									:disabled="!leader.partner"
									trigger="manual"
									placement="top"
									:animated="false"
									style="max-width: min(336px, calc(100dvw - 72px));"
									content-class="workbench-tooltip-content"
								>
									<template #trigger>
										<strong
											@mouseenter="showLeaderNameTooltip(leader.metric, $event)"
											@mouseleave="hideLeaderNameTooltip(leader.metric)"
										>
											{{ leader.partner ? workbench.personName(leader.partner.person) : '暂无数据' }}
										</strong>
									</template>
									{{ leader.partner ? workbench.personName(leader.partner.person) : '暂无数据' }}
								</n-tooltip>
							</span>
						</button>
					</div>
				</div>
			</div>
		</section>

		<section
			class="analysis-section single-cooperation__workspace"
			:class="{ 'single-cooperation__workspace--empty': !focusedPartner }"
			aria-label="合作人物与合作作品"
		>
			<aside class="single-cooperation__partners" aria-labelledby="cooperation-people-title">
				<div class="section-heading single-cooperation__heading">
					<div>
						<div class="single-cooperation__heading-title">
							<h2 id="cooperation-people-title">合作人物</h2>
							<n-tooltip
								:show="cooperationMetricTooltipVisible"
								placement="top-start"
								trigger="manual"
								:animated="false"
								style="max-width: min(336px, calc(100dvw - 72px));"
								content-class="workbench-tooltip-content"
							>
								<template #trigger>
									<button
										class="profile-metric__info"
										type="button"
										:aria-expanded="cooperationMetricTooltipVisible"
										:aria-label="`合作人物指标说明：${cooperationMetricHelp}`"
										@mouseenter="cooperationMetricTooltipVisible = true"
										@mouseleave="cooperationMetricTooltipVisible = false"
										@focus="cooperationMetricTooltipVisible = true"
										@blur="cooperationMetricTooltipVisible = false"
										@click.stop="cooperationMetricTooltipVisible = true"
										@keydown.esc.stop.prevent="cooperationMetricTooltipVisible = false"
									>
										<AppIcon name="info" :size="16" />
									</button>
								</template>
								<span class="preference-model-tooltip">{{ cooperationMetricHelp }}</span>
							</n-tooltip>
						</div>
						<p>{{ partnerRangeLabel }} · {{ activePositionLabel }}</p>
					</div>
				</div>

				<div
					class="single-cooperation__filters"
					:class="{ 'single-cooperation__filters--with-position': positionOptions.length !== 1 }"
				>
					<WorkListToolbar
						:search="partnerSearch"
						:sort="partnerMetric"
						:order="partnerOrder"
						:sort-options="partnerSortOptions"
						search-placeholder="搜索人物"
						search-aria-label="搜索合作人物"
						sort-aria-label="合作人物排序规则"
						order-aria-label="合作人物排序方向"
						search-name="singleCooperationPartnerSearch"
						@update:search="partnerSearch = $event"
						@update:sort="updatePartnerMetric"
						@update:order="partnerOrder = $event"
					>
						<template v-if="positionOptions.length !== 1" #before-sort="{ size }">
							<n-select
								v-model:value="partnerPosition"
								:size="size"
								:menu-size="size"
								:options="positionOptions"
								:consistent-menu-width="false"
								aria-label="按合作职位筛选"
							/>
						</template>
					</WorkListToolbar>
				</div>

				<RankedPersonList
					variant="cooperation"
					:items="visibleRankedPartners"
					:rank-offset="(partnerPage - 1) * partnerPageSize"
					:metric="partnerMetric"
					:focused-id="focusedPartnerId"
					:average-label="sourceScoreLabel"
					:empty-title="partnerSearch.trim() ? SEARCH_EMPTY_COPY.person : RESULT_EMPTY_COPY.person"
					@activate="focusPartner"
				/>

				<AdaptivePagination
					:page="partnerPage"
					:page-size="partnerPageSize"
					:item-count="cooperationPeople.length"
					:page-sizes="partnerPageSizeOptions"
					:summary="partnerRangeLabel"
					aria-label="合作人物分页"
					@update:page="partnerPage = $event"
					@update:page-size="partnerPageSize = $event"
				/>
			</aside>

			<div v-if="focusedPartner" class="single-cooperation__works">
				<SubjectWorkBrowser
					v-model:search="workSearch"
					v-model:sort="workSort"
					v-model:order="workOrder"
					v-model:page="workPage"
					v-model:page-size="workPageSize"
					:title="`与 ${workbench.personName(focusedPartner.person)} 的合作${seriesMode ? '系列' : '作品'}`"
					title-id="single-cooperation-works-title"
					:heading-meta="`${focusedPartner.subjectCount} ${seriesMode ? '个系列' : '部'} · ${focusedPartner.positionIds.map(workbench.positionLabel).join(' / ')}`"
					:subjects="visibleWorks"
					:empty-text="seriesMode ? workSearch.trim() ? '没有符合搜索条件的系列' : '没有符合当前条件的系列' : workSearch.trim() ? SEARCH_EMPTY_COPY.work : RESULT_EMPTY_COPY.work"
					:sort-options="workSortOptions"
					:search-placeholder="seriesMode ? '搜索系列或系列内作品' : '搜索作品'"
					:search-aria-label="seriesMode ? '搜索合作系列或系列内作品' : '搜索合作作品'"
					:sort-aria-label="seriesMode ? '合作系列排序规则' : '合作作品排序规则'"
					:order-aria-label="seriesMode ? '合作系列排序方向' : '合作作品排序方向'"
					search-name="singleCooperationWorkSearch"
					:item-count="focusedWorks.length"
					:page-sizes="workPageSizes"
					:pagination-summary="workRangeLabel"
					:pagination-aria-label="seriesMode ? '合作系列分页' : '合作作品分页'"
					:compact-aria-label="seriesMode ? '合作系列缩略模式' : '合作作品缩略模式'"
					:detailed-description="seriesMode ? '显示完整系列信息' : '显示完整作品信息'"
					:compact-description="seriesMode ? '仅显示代表条目的序号、双语名和系列均分' : '仅显示序号、双语名和评分'"
				>
					<template v-if="selectedPerson && focusedPartner" #participants="{ subject }">
						<SharedWorkParticipants
							:participants="[
								selectedPerson,
								{ person: focusedPartner.person, positionIds: focusedPartner.positionIds },
							]"
							:subject="subject"
						/>
					</template>
				</SubjectWorkBrowser>
			</div>
		</section>
	</article>
</template>
