<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Person, RankingMetric, Subject } from '../types'
import { summarizePreference, type PreferenceSummary } from '../domain/preference'
import { useWorkbench } from '../composables/useWorkbench'
import {
	compareSubjectNumber,
	compareSubjectText,
	SUBJECT_WORK_PAGE_SIZES,
	useSubjectWorkBrowser,
	type SubjectWorkSortOption,
	type SubjectWorkSortOrder,
} from '../composables/useSubjectWorkBrowser'
import AdaptivePagination from './AdaptivePagination.vue'
import SafeImage from './SafeImage.vue'
import SubjectWorkBrowser from './SubjectWorkBrowser.vue'
import RankedPersonList from './RankedPersonList.vue'
import RankingListColumns from './RankingListColumns.vue'
import SharedWorkParticipants from './SharedWorkParticipants.vue'
import WorkListToolbar from './WorkListToolbar.vue'

type PositionFilter = 'all' | number
type CooperationWorkSort = 'personal' | 'score' | 'date' | 'title'

interface CooperationPerson {
	person: Person
	positionIds: number[]
	subjectIds: number[]
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

const partnerSearch = ref('')
const partnerMetric = ref<RankingMetric>('count')
const partnerOrder = ref<SubjectWorkSortOrder>('desc')
const partnerPosition = ref<PositionFilter>('all')
const partnerPage = ref(1)
const partnerPageSize = ref(10)
const focusedPartnerId = ref(0)

const selectedPerson = computed(() => workbench.selectedPeople.value[0] ?? null)
const sourceScoreLabel = computed(() => workbench.query.isGlobal ? '全站均分' : '我的均分')

const average = (values: number[]) => {
	const valid = values.filter((value) => Number.isFinite(value) && value > 0)
	if (!valid.length) return null
	return Math.floor(valid.reduce((sum, value) => sum + value, 0) / valid.length * 100) / 100
}
const roundTwo = (value: number) => Math.round(value * 100) / 100
const scoreForSubject = (subject: Subject | undefined) => workbench.query.isGlobal
	? Number(subject?.score || 0)
	: Number(subject?.collection?.rate || 0)
const overallScore = (subjectIds: number[]) => {
	const scores = subjectIds
		.map((id) => scoreForSubject(workbench.subjectsById.value.get(id)))
		.filter((value) => Number.isFinite(value) && value > 0)
	if (!scores.length) return null
	const mean = scores.reduce((sum, value) => sum + value, 0) / scores.length
	return roundTwo((scores.length * mean + 25) / (scores.length + 5))
}
const preferenceForSubjects = (subjectIds: number[]) => {
	if (workbench.query.isGlobal) return null
	return summarizePreference(subjectIds
		.map((id) => workbench.subjectsById.value.get(id))
		.filter((subject): subject is Subject => Boolean(subject))
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

const compactSearch = (value: unknown) => String(value ?? '')
	.normalize('NFKC')
	.toLocaleLowerCase('zh-CN')
	.replace(/[\s·・_-]/g, '')

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

const cooperationPeople = computed<CooperationPerson[]>(() => {
	const selected = selectedPerson.value
	if (!selected) return []
	const selectedSubjectIds = new Set(selected.subjectIds)
	const search = compactSearch(partnerSearch.value)
	const exactId = /^\d+$/.test(partnerSearch.value.trim()) ? Number(partnerSearch.value.trim()) : null

	return [...workbench.peopleById.value.values()]
		.filter((person) => Number(person.id) !== Number(selected.person.id))
		.map((person): CooperationPerson | null => {
			const matches = activePositionIds.value.map((positionId) => ({
				positionId,
				subjectIds: workbench.positionSubjectIds(person, positionId)
					.map(Number)
					.filter((id) => workbench.queryScopeSubjectIds.value.has(id) && selectedSubjectIds.has(id)),
			})).filter((item) => item.subjectIds.length)
			if (!matches.length) return null

			const subjectIds = [...new Set(matches.flatMap((item) => item.subjectIds))]
			const scores = subjectIds.map((id) => scoreForSubject(workbench.subjectsById.value.get(id)))
			return {
				person,
				positionIds: matches.map((item) => item.positionId),
				subjectIds,
				subjectCount: subjectIds.length,
				ratedSubjectCount: scores.filter((value) => Number.isFinite(value) && value > 0).length,
				average: average(scores),
				overall: overallScore(subjectIds),
				preference: preferenceForSubjects(subjectIds),
			}
		})
		.filter((item): item is CooperationPerson => Boolean(item))
		.filter((item) => {
			if (!search) return true
			if (exactId !== null) return Number(item.person.id) === exactId
			return [
				workbench.personName(item.person),
				item.person.name,
				item.person.nameCN,
				...(item.person.aliases ?? []),
			].some((value) => compactSearch(value).includes(search))
		})
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
	if (metric === 'count') return `${value} 部`
	if (metric === 'preference') return `${value < 0 ? '−' : '+'}${Math.abs(value).toFixed(2)}`
	return value.toFixed(2)
}
const cooperationLeaders = computed<CooperationLeader[]>(() => {
	const leaders: Array<Omit<CooperationLeader, 'value'>> = [
		{ label: '合作数最高', metric: 'count', partner: cooperationLeaderFor('count') },
		{ label: '均分最高', metric: 'average', partner: cooperationLeaderFor('average') },
		{ label: '综合分最高', metric: 'overall', partner: cooperationLeaderFor('overall') },
		{ label: '偏好分最高', metric: 'preference', partner: cooperationLeaderFor('preference') },
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
	userAverage: item.average ?? 0,
	preference: item.preference ?? undefined,
})))
const partnerRangeLabel = computed(() => {
	const start = cooperationPeople.value.length ? (partnerPage.value - 1) * partnerPageSize.value + 1 : 0
	const end = Math.min(partnerPage.value * partnerPageSize.value, cooperationPeople.value.length)
	return `${start}—${end} / ${cooperationPeople.value.length}`
})
const focusedPartner = computed(() => cooperationPeople.value
	.find((item) => Number(item.person.id) === Number(focusedPartnerId.value)) ?? null)
const focusedSubjects = computed(() => (focusedPartner.value?.subjectIds ?? [])
	.map((id) => workbench.subjectsById.value.get(id))
	.filter((subject): subject is Subject => Boolean(subject)))

const partnerSortOptions = computed(() => [
	{ label: '作品数', value: 'count' as const },
	{ label: sourceScoreLabel.value, value: 'average' as const },
	{ label: '综合分', value: 'overall' as const },
	{ label: workbench.query.isGlobal ? '偏好（仅个人收藏）' : '相对偏好', value: 'preference' as const, disabled: workbench.query.isGlobal },
])
const workSortOptions = computed<SubjectWorkSortOption<CooperationWorkSort>[]>(() => [
	...(workbench.query.isGlobal ? [] : [{ label: '我的评分', value: 'personal' as const }]),
	{ label: '全站评分', value: 'score' },
	{ label: '收藏日期', value: 'date' },
	{ label: '作品标题', value: 'title' },
])

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
		workbench.subjectName(subject),
		subject.displayName,
		subject.nameCN,
		subject.name,
		...(subject.metaTags ?? []).map((tag) => typeof tag === 'string' ? tag : tag.name),
		...(subject.tags ?? []).map((tag) => typeof tag === 'string' ? tag : tag.name),
	],
	initialSort: workbench.query.isGlobal ? 'score' : 'personal',
	comparators: {
		personal: (a, b, direction) => compareSubjectNumber(a.collection?.rate, b.collection?.rate, direction),
		score: (a, b, direction) => compareSubjectNumber(a.score, b.score, direction),
		date: (a, b, direction) => compareSubjectText(a.collection?.updatedAt ?? a.date, b.collection?.updatedAt ?? b.date, direction),
		title: (a, b, direction) => compareSubjectText(workbench.subjectName(a), workbench.subjectName(b), direction),
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
	focusedPartnerId.value = people[0]?.person.id ?? 0
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
	if (isGlobal && workSort.value === 'personal') workSort.value = 'score'
})
</script>

<template>
	<article class="single-cooperation analysis-dashboard analysis-dashboard--unified surface-panel" aria-label="单人物合作分析">
		<section v-if="selectedPerson" class="analysis-section relationship-hero" aria-label="查询人物概览">
			<div class="profile-stage profile-stage--people single-cooperation__profile-stage">
				<article class="analysis-profile single-cooperation__profile">
					<SafeImage
						class="analysis-profile__media"
						:sources="workbench.personImageSources(selectedPerson.person)"
						:alt="workbench.personName(selectedPerson.person)"
						kind="person"
						decorative
						loading="eager"
						:width="132"
						:height="180"
					/>
					<div class="analysis-profile__content">
						<span class="identity-marker" aria-hidden="true">1</span>
						<h2>{{ workbench.personName(selectedPerson.person) }}</h2>
						<p>{{ selectedPerson.positionIds.map(workbench.positionLabel).join(' · ') }}</p>
					</div>
				</article>
				<div class="single-cooperation__profile-copy">
					<div
						class="single-cooperation__summary-grid"
						:aria-label="`我的收藏 ${selectedPerson.subjectIds.length} 部，合作人物 ${cooperationPeople.length} 位，各指标最高合作人物`"
					>
						<div class="single-cooperation__summary-cell">
							<small>我的收藏</small>
							<b>{{ selectedPerson.subjectIds.length }}</b>
						</div>
						<div class="single-cooperation__summary-cell">
							<small>合作人物</small>
							<b>{{ cooperationPeople.length }}</b>
						</div>
						<button
							v-for="leader in cooperationLeaders"
							:key="leader.metric"
							class="single-cooperation__leader"
							:class="{ 'is-focused': leader.partner?.person.id === focusedPartnerId }"
							type="button"
							:disabled="!leader.partner"
							:aria-pressed="leader.partner?.person.id === focusedPartnerId"
							:aria-controls="leader.partner ? 'single-cooperation-works-title' : undefined"
							:aria-label="leader.partner ? `${leader.label}：${workbench.personName(leader.partner.person)}，${leader.value}` : `${leader.label}：暂无数据`"
							@click="leader.partner && focusPartner(leader.partner.person.id)"
						>
							<small class="single-cooperation__cell-label">{{ leader.label }}</small>
							<span class="single-cooperation__leader-person">
								<SafeImage
									v-if="leader.partner"
									class="single-cooperation__leader-avatar"
									:sources="workbench.personImageSources(leader.partner.person)"
									:alt="workbench.personName(leader.partner.person)"
									kind="person"
									decorative
									:width="28"
									:height="36"
								/>
								<strong :title="leader.partner ? workbench.personName(leader.partner.person) : '暂无数据'">
									{{ leader.partner ? workbench.personName(leader.partner.person) : '暂无数据' }}
								</strong>
							</span>
							<b>{{ leader.value }}</b>
						</button>
					</div>
				</div>
			</div>
		</section>

		<section class="analysis-section single-cooperation__workspace" aria-label="合作人物与合作作品">
			<aside class="single-cooperation__partners" aria-labelledby="cooperation-people-title">
				<div class="section-heading single-cooperation__heading">
					<div>
						<h2 id="cooperation-people-title">合作人物</h2>
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
						search-placeholder="搜索人物或 ID"
						search-aria-label="搜索合作人物"
						sort-aria-label="合作人物排序规则"
						order-aria-label="合作人物排序方向"
						search-name="singleCooperationPartnerSearch"
						@update:search="partnerSearch = $event"
						@update:sort="updatePartnerMetric"
						@update:order="partnerOrder = $event"
					>
						<template v-if="positionOptions.length !== 1" #before-sort="{ size, selectThemeOverrides }">
							<n-select
								v-model:value="partnerPosition"
								:size="size"
								menu-size="small"
								:options="positionOptions"
								:theme-overrides="selectThemeOverrides"
								:consistent-menu-width="false"
								aria-label="按合作职位筛选"
							/>
						</template>
					</WorkListToolbar>
				</div>

				<RankingListColumns class="single-cooperation__list-columns" />
				<RankedPersonList
					variant="cooperation"
					:items="visibleRankedPartners"
					:rank-offset="(partnerPage - 1) * partnerPageSize"
					:metric="partnerMetric"
					:focused-id="focusedPartnerId"
					:average-label="sourceScoreLabel"
					empty-title="没有符合条件的合作人物"
					empty-description="尝试清除搜索或切换职位。"
					@activate="focusPartner"
				/>

				<AdaptivePagination
					:page="partnerPage"
					:page-size="partnerPageSize"
					:item-count="cooperationPeople.length"
					:page-sizes="[5, 10, 20, 50]"
					:summary="partnerRangeLabel"
					aria-label="合作人物分页"
					@update:page="partnerPage = $event"
					@update:page-size="partnerPageSize = $event"
				/>
			</aside>

			<div class="single-cooperation__works">
				<SubjectWorkBrowser
					v-model:search="workSearch"
					v-model:sort="workSort"
					v-model:order="workOrder"
					v-model:page="workPage"
					v-model:page-size="workPageSize"
					:title="focusedPartner ? `与 ${workbench.personName(focusedPartner.person)} 的合作作品` : '合作作品'"
					title-id="single-cooperation-works-title"
					:heading-meta="focusedPartner ? `${focusedPartner.subjectCount} 部 · ${focusedPartner.positionIds.map(workbench.positionLabel).join(' / ')}` : '请选择一位合作人物'"
					:subjects="visibleWorks"
					:empty-text="focusedPartner ? '没有符合当前搜索条件的合作作品。' : '当前职位下没有可展示的合作作品。'"
					:sort-options="workSortOptions"
					search-placeholder="搜索合作作品"
					search-aria-label="搜索合作作品"
					sort-aria-label="合作作品排序规则"
					order-aria-label="合作作品排序方向"
					search-name="singleCooperationWorkSearch"
					:item-count="focusedWorks.length"
					:page-sizes="SUBJECT_WORK_PAGE_SIZES"
					:pagination-summary="workRangeLabel"
					pagination-aria-label="合作作品分页"
				>
					<template v-if="selectedPerson && focusedPartner" #participants="{ subject }">
						<SharedWorkParticipants
							:participants="[
								selectedPerson,
								{ person: focusedPartner.person, positionIds: focusedPartner.positionIds },
							]"
							:subject-id="subject.id"
						/>
					</template>
				</SubjectWorkBrowser>
			</div>
		</section>
	</article>
</template>
