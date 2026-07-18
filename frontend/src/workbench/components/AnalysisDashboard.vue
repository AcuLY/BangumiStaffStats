<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import type { Person, Subject } from '../types'
import { characterRoleLabel } from '../domain/characterCredits'
import { buildScoreDistribution } from '../domain/ratingDistribution'
import {
	preferenceContribution,
	summarizePreference,
	type PreferenceContribution,
} from '../domain/preference'
import { useWorkbench } from '../composables/useWorkbench'
import { useMediaQuery } from '../composables/useMediaQuery'
import {
	compareSubjectNumber,
	compareSubjectText,
	SUBJECT_WORK_PAGE_SIZES,
	useSubjectWorkBrowser,
	type SubjectWorkSortOption,
} from '../composables/useSubjectWorkBrowser'
import SafeImage from './SafeImage.vue'
import AppIcon from './AppIcon.vue'
import ScoreDistributionTooltip from './ScoreDistributionTooltip.vue'
import PreferenceWorkList from './PreferenceWorkList.vue'
import SubjectWorkBrowser from './SubjectWorkBrowser.vue'
import SubjectTagSummary from './SubjectTagSummary.vue'
import SinglePersonCooperation from './SinglePersonCooperation.vue'
import SharedWorkParticipants from './SharedWorkParticipants.vue'
import WorkbenchTooltip from './WorkbenchTooltip.vue'

const workbench = useWorkbench()
const isMobile = useMediaQuery('(max-width: 780px)')
const controlSize = computed<'medium' | 'large'>(() => isMobile.value ? 'large' : 'medium')
type SharedWorkSort = 'personal' | 'score' | 'date' | 'title'
const sharedSortOptions: SubjectWorkSortOption<SharedWorkSort>[] = [
	{ label: '我的评分', value: 'personal' },
	{ label: '全站评分', value: 'score' },
	{ label: '收藏日期', value: 'date' },
	{ label: '作品标题', value: 'title' },
]
const floorTwo = (value: number) => Math.floor(value * 100) / 100
const validAverage = (values: number[]) => {
	const valid = values.filter((value) => Number.isFinite(value) && value > 0)
	return valid.length ? floorTwo(valid.reduce((sum, value) => sum + value, 0) / valid.length) : null
}
const formatScore = (value: number | null | undefined) => Number.isFinite(value) ? Number(value).toFixed(2) : '—'
const slotLabel = (index: number) => String(index + 1)

const ratedShared = computed(() => workbench.sharedSubjects.value.filter((subject) => Number(subject.collection?.rate || 0) > 0))
const personalAverage = computed(() => validAverage(ratedShared.value.map((subject) => Number(subject.collection?.rate || 0))))
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

const profileAverage = (ids: number[]) => validAverage(ids.map((id) => Number(workbench.subjectsById.value.get(id)?.collection?.rate || 0)))
const profileGlobalAverage = (ids: number[]) => validAverage(ids.map((id) => Number(workbench.subjectsById.value.get(id)?.score || 0)))

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
			const subjects = ids.map((id) => workbench.subjectsById.value.get(id)).filter((subject): subject is Subject => Boolean(subject))
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

const bins = Array.from({ length: 10 }, (_, index) => String(index + 1))
const seriesColors = ['#c60475', '#158486', '#d15c56', '#8f68cb', '#cd9c1f', '#549957', '#1a89c5', '#444898', '#d55e89', '#ea955e']
const hoveredGroupedBar = ref<string | null>(null)
const groupedBarKey = (seriesKey: string, scoreLabel: string) => `${seriesKey}-${scoreLabel}`
const groupedSeries = computed(() => {
	const people = workbench.selectedPeople.value.map((item, index) => {
		const subjects = item.subjectIds
			.map((id) => workbench.subjectsById.value.get(id))
			.filter((subject): subject is Subject => Boolean(subject))
		const buckets = buildScoreDistribution(subjects, 'personal')
		return {
			key: `person-${item.person.id}`,
			marker: slotLabel(index),
			label: workbench.personName(item.person),
			color: seriesColors[index % seriesColors.length],
			average: profileAverage(item.subjectIds),
			ratedCount: buckets.reduce((sum, bucket) => sum + bucket.value, 0),
			counts: buckets.map((bucket) => bucket.value),
			buckets,
		}
	})
	const sharedBuckets = buildScoreDistribution(workbench.sharedSubjects.value, 'personal')
	return [...people, {
		key: 'shared-works',
		marker: '',
		label: '共同作品',
		color: seriesColors[people.length % seriesColors.length],
		average: personalAverage.value,
		ratedCount: sharedBuckets.reduce((sum, bucket) => sum + bucket.value, 0),
		counts: sharedBuckets.map((bucket) => bucket.value),
		buckets: sharedBuckets,
	}]
})
const maxGroupedDistribution = computed(() => Math.max(1, ...groupedSeries.value.flatMap((series) => series.counts)))
const groupedDistributionLabel = computed(() => `评分分布对比，仅统计 1 到 10 分的已评分作品。${groupedSeries.value
	.map((series) => `${series.label}：${bins.map((label, index) => `${label} 分 ${series.counts[index]} 部`).join('，')}`)
	.join('；')}`)

interface ParticipationEntry {
	displayName: string
	roleLabel: string
	kind: 'character' | 'position'
}

const participationEntries = (person: Person, positionIds: number[], subjectId: number): ParticipationEntry[] => positionIds.flatMap<ParticipationEntry>((positionId) => {
	if (!workbench.positionSubjectIds(person, positionId).includes(Number(subjectId))) return []
	if (Number(positionId) !== 102) return [{ displayName: workbench.positionLabel(positionId), roleLabel: '', kind: 'position' as const }]
	const roles = workbench.personSubjectRoles(person, subjectId, positionId)
	return roles.length
		? roles.map((role) => ({ displayName: role.displayName || '角色', roleLabel: `声优 · ${characterRoleLabel(role)}`, kind: 'character' as const }))
		: [{ displayName: '声优', roleLabel: '', kind: 'position' as const }]
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
	searchTerms: (subject) => {
		const participantTerms = workbench.selectedPeople.value.flatMap((item) => [
			workbench.personName(item.person),
			...participationEntries(item.person, item.positionIds, subject.id).flatMap((entry) => [entry.displayName, entry.roleLabel]),
		])
		return [
			workbench.subjectName(subject),
			subject.displayName,
			subject.nameCN,
			subject.name,
			...(subject.metaTags ?? []).map((tag) => typeof tag === 'string' ? tag : tag.name),
			...(subject.tags ?? []).map((tag) => typeof tag === 'string' ? tag : tag.name),
			...participantTerms,
		]
	},
	initialSort: 'personal',
	comparators: {
		personal: (a, b, direction) => compareSubjectNumber(a.collection?.rate, b.collection?.rate, direction),
		score: (a, b, direction) => compareSubjectNumber(a.score, b.score, direction),
		date: (a, b, direction) => compareSubjectText(a.collection?.updatedAt ?? a.date, b.collection?.updatedAt ?? b.date, direction),
		title: (a, b, direction) => compareSubjectText(workbench.subjectName(a), workbench.subjectName(b), direction),
	},
	fallbackComparator: (a, b, direction) => compareSubjectNumber(a.score, b.score, direction),
})

const focusSharedWork = async (subject: Subject) => {
	sharedSearch.value = workbench.subjectName(subject)
	sharedPage.value = 1
	await nextTick()
	document.querySelector<HTMLInputElement>('input[aria-label="搜索共同参与作品"]')?.focus()
}

</script>

<template>
	<div v-if="!workbench.selectedPeople.value.length" class="analysis-empty surface-panel">
		<span class="analysis-empty__icon"><AppIcon name="people" :size="30" /></span>
		<h2>选择一位人物开始分析</h2>
		<p>选择人物后可查看合作人物和合作作品；继续选择可比较共同作品、评分分布和关系矩阵。</p>
		<n-button :size="controlSize" type="primary" @click="workbench.peopleDrawerOpen.value = true">打开人物选择</n-button>
	</div>
	<SinglePersonCooperation v-else-if="workbench.selectedPeople.value.length === 1" />

	<article v-else class="analysis-dashboard analysis-dashboard--unified surface-panel" aria-label="共同参与分析" :data-analysis-mode="selectedMode">
		<section class="analysis-section relationship-hero" aria-label="已选人物画像">
			<div class="profile-stage profile-stage--people" :class="{ 'profile-stage--pair': workbench.selectedPeople.value.length === 2 }">
				<template v-for="(item, index) in workbench.selectedPeople.value" :key="item.person.id">
					<article class="analysis-profile">
						<SafeImage
							class="analysis-profile__media"
							:sources="workbench.personImageSources(item.person)"
							:alt="workbench.personName(item.person)"
							kind="person"
							decorative
							:loading="index < 2 ? 'eager' : 'lazy'"
							:width="132"
							:height="180"
						/>
						<div class="analysis-profile__content">
							<span class="identity-marker">{{ slotLabel(index) }}</span>
							<h2>{{ workbench.personName(item.person) }}</h2>
							<p>{{ item.positionIds.map(workbench.positionLabel).join(' · ') }}</p>
							<div class="analysis-profile__stats">
								<span class="analysis-profile__stat analysis-profile__stat--count"><b>{{ item.subjectIds.length }}</b><small>我的收藏</small></span>
								<span class="analysis-profile__stat analysis-profile__stat--score"><b>{{ formatScore(profileAverage(item.subjectIds)) }}</b><small>我的均分</small></span>
							</div>
						</div>
					</article>
					<aside v-if="workbench.selectedPeople.value.length === 2 && index === 0" class="analysis-profile-summary" aria-label="双人组合概览">
						<dl>
							<div><dt>共同作品</dt><dd>{{ workbench.sharedSubjects.value.length }}</dd></div>
							<div v-if="!workbench.query.isGlobal"><dt>已评作品</dt><dd>{{ ratedShared.length }}</dd></div>
							<div><dt>全站均分</dt><dd>{{ formatScore(globalAverage) }}</dd></div>
							<div v-if="!workbench.query.isGlobal"><dt>我的均分</dt><dd>{{ formatScore(personalAverage) }}</dd></div>
						</dl>
					</aside>
				</template>
			</div>
		</section>

		<section v-if="!workbench.sharedSubjects.value.length" class="analysis-empty analysis-section analysis-empty--zero">
			<span class="analysis-empty__icon"><AppIcon name="info" :size="28" /></span>
			<h2>没有共同参与的作品</h2>
			<p>可以移除人物、调整某个人物的职位，或更换当前选择。</p>
			<n-button :size="controlSize" type="primary" @click="workbench.peopleDrawerOpen.value = true">调整已选人物</n-button>
		</section>

		<section v-if="workbench.sharedSubjects.value.length" class="analysis-section analysis-domain work-profile-domain" aria-labelledby="analysis-tags-title">
			<SubjectTagSummary :subjects="workbench.sharedSubjects.value" title="作品标签" heading-id="analysis-tags-title" />
		</section>

		<section
			v-if="workbench.sharedSubjects.value.length || selectedMode === 'group'"
			class="analysis-section analysis-domain rating-domain"
			aria-label="评分表现"
		>
			<template v-if="workbench.sharedSubjects.value.length">
				<div class="profile-metrics profile-metrics--extended rating-summary" aria-label="共同作品评分概览">
					<span><b>{{ workbench.sharedSubjects.value.length }}</b><small>共同作品</small></span>
					<span><b>{{ ratedShared.length }}</b><small>已评作品</small></span>
					<span><b>{{ formatScore(globalAverage) }}</b><small>全站均分</small></span>
					<span class="profile-metric--primary"><b>{{ formatScore(personalAverage) }}</b><small>我的均分</small></span>
				</div>

				<div class="analysis-domain__block" aria-labelledby="grouped-rating-title">
					<div class="section-heading section-heading--compact"><div><h3 id="grouped-rating-title">评分分布</h3><p>人物与共同作品 · 1–10 分同组同轴对比。</p></div></div>
					<div class="distribution-legend">
						<span v-for="series in groupedSeries" :key="series.key" :style="{ '--series-color': series.color }">
							<i aria-hidden="true" /><b><template v-if="series.marker">{{ series.marker }} · </template>{{ series.label }}</b><small>均分 {{ formatScore(series.average) }} · {{ series.ratedCount }} 部已评</small>
						</span>
					</div>
					<div class="grouped-distribution" role="img" :aria-label="groupedDistributionLabel">
						<div v-for="(label, binIndex) in bins" :key="label" class="grouped-bin">
							<div class="grouped-bin__bars">
								<WorkbenchTooltip
									v-for="series in groupedSeries"
									:key="series.key"
									:show="Boolean(series.counts[binIndex]) && hoveredGroupedBar === groupedBarKey(series.key, label)"
									:disabled="!series.counts[binIndex]"
									trigger="manual"
									placement="top"
								>
									<template #trigger>
										<i
											:style="{ height: `${series.counts[binIndex] ? Math.max(4, series.counts[binIndex] / maxGroupedDistribution * 100) : 0}%`, background: series.color }"
											:tabindex="series.counts[binIndex] ? 0 : undefined"
											:aria-label="`${series.label}，${label} 分，${series.counts[binIndex]} 部作品`"
											@mouseenter="hoveredGroupedBar = series.counts[binIndex] ? groupedBarKey(series.key, label) : null"
											@mouseleave="hoveredGroupedBar = null"
											@focus="hoveredGroupedBar = series.counts[binIndex] ? groupedBarKey(series.key, label) : null"
											@blur="hoveredGroupedBar = null"
										><span v-if="series.counts[binIndex]">{{ series.counts[binIndex] }}</span></i>
									</template>
									<ScoreDistributionTooltip
										:series-label="series.label"
										:score-label="label"
										:works="series.buckets[binIndex].works"
									/>
								</WorkbenchTooltip>
							</div>
							<small>{{ label }}</small>
						</div>
					</div>
				</div>
			</template>

			<p v-else class="analysis-domain__empty">暂无全员共同作品，以下仅比较仍然存在的两两组合。</p>

			<div v-if="selectedMode === 'group'" class="analysis-domain__block" aria-labelledby="matrix-title">
				<div class="section-heading section-heading--compact"><div><h3 id="matrix-title">组合评分对比</h3><p>全站均分为主，共同作品数作为样本量；高亮样本最多的组合。</p></div></div>
				<div class="matrix-details matrix-details--direct" :class="{ 'matrix-details--scrollable': workbench.selectedPeople.value.length >= 5 }">
					<div class="data-scroll-x">
						<table class="matrix-table" :style="{ '--matrix-size': workbench.selectedPeople.value.length }">
							<thead><tr><th scope="col">组合</th><th v-for="item in workbench.selectedPeople.value" :key="item.person.id" scope="col">{{ workbench.personName(item.person) }}<small>{{ item.positionIds.map(workbench.positionLabel).join(' / ') }}</small></th></tr></thead>
							<tbody>
								<tr v-for="row in workbench.selectedPeople.value" :key="row.person.id">
									<th scope="row">{{ workbench.personName(row.person) }}<small>{{ row.positionIds.map(workbench.positionLabel).join(' / ') }}</small></th>
									<td v-for="column in workbench.selectedPeople.value" :key="column.person.id" :class="{ 'is-diagonal': row.person.id === column.person.id, 'is-best': row.person.id !== column.person.id && Boolean(bestPair?.count) && pairFor(row.person.id, column.person.id)?.count === bestPair?.count }">
										<template v-if="row.person.id === column.person.id"><b>{{ formatScore(profileGlobalAverage(row.subjectIds)) }}</b><small>{{ row.subjectIds.length }} 部作品</small></template>
										<template v-else><b>{{ formatScore(pairFor(row.person.id, column.person.id)?.globalAverage) }}</b><small>{{ pairFor(row.person.id, column.person.id)?.count ?? 0 }} 部共同</small></template>
									</td>
								</tr>
							</tbody>
						</table>
					</div>
				</div>
			</div>
		</section>

		<section v-if="workbench.sharedSubjects.value.length" class="analysis-section analysis-domain preference-domain" aria-labelledby="shared-preference-title">
			<div class="section-heading">
				<h2 id="shared-preference-title">相对偏好</h2>
			</div>

			<p v-if="sharedPreferenceSummary.score === null" class="preference-model-note">{{ workbench.query.isGlobal ? '相对偏好只在个人收藏模式计算。' : '共同作品中没有同时具备个人评分与有效全站评分的作品。' }}</p>

			<PreferenceWorkList
				v-if="!workbench.query.isGlobal"
				:preferred="morePreferredShared"
				:conservative="moreConservativeShared"
				work-noun="共同作品"
				location-scope="共同参与作品"
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
				title="共同参与作品"
				title-id="common-works-title"
				:subjects="visibleSharedWorks"
				empty-text="没有符合当前搜索条件的共同作品。"
				:sort-options="sharedSortOptions"
				search-placeholder="搜索中日文标题、人物或角色名…"
				search-aria-label="搜索共同参与作品"
				sort-aria-label="共同参与作品排序依据"
				order-aria-label="共同参与作品排序方向"
				search-name="sharedWorkSearch"
				:heading-meta="`${sharedWorks.length}${sharedSearch.trim() ? ` / ${workbench.sharedSubjects.value.length}` : ''} 部`"
				:item-count="sharedWorks.length"
				:page-sizes="SUBJECT_WORK_PAGE_SIZES"
				:pagination-summary="sharedRangeLabel"
				pagination-aria-label="共同作品分页"
				:show-pagination="sharedWorks.length > SUBJECT_WORK_PAGE_SIZES[0].value"
			>
				<template #participants="{ subject }">
					<SharedWorkParticipants :participants="workbench.selectedPeople.value" :subject-id="subject.id" />
				</template>
			</SubjectWorkBrowser>
		</section>
	</article>
</template>
