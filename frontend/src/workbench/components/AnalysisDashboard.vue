<script setup lang="ts">
import { computed, nextTick } from 'vue'
import type { Person, Subject } from '../types'
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
import SubjectWorkBrowser from './SubjectWorkBrowser.vue'
import AdaptiveParticipantBody from './AdaptiveParticipantBody.vue'
import SubjectTagSummary from './SubjectTagSummary.vue'

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
const formatPersonalScore = (value: number | null | undefined) => Number(value) > 0 ? String(Number(value)) : '—'
const formatSigned = (value: number | null | undefined) => value === null || value === undefined || !Number.isFinite(value)
	? '—'
	: `${value > 0 ? '+' : ''}${Number(value).toFixed(2)}`
const formatPercent = (value: number | null | undefined) => value === null || value === undefined || !Number.isFinite(value)
	? '—'
	: `${Math.round(value * 100)}%`
const slotLabel = (index: number) => String(index + 1)

const ratedShared = computed(() => workbench.sharedSubjects.value.filter((subject) => Number(subject.collection?.rate || 0) > 0))
const personalAverage = computed(() => validAverage(ratedShared.value.map((subject) => Number(subject.collection?.rate || 0))))
const globalAverage = computed(() => validAverage(workbench.sharedSubjects.value.map((subject) => Number(subject.score || 0))))
const averageScoreDifference = computed(() => {
	if (personalAverage.value === null || globalAverage.value === null) return null
	const difference = Math.round((personalAverage.value - globalAverage.value) * 100) / 100
	return Object.is(difference, -0) ? 0 : difference
})

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
const sharedPreferenceSampleLabel = computed(() => {
	const count = Number(sharedPreferenceSummary.value.effectiveEvidence || 0)
	if (!count) return '无有效样本'
	if (count <= 2) return '低样本'
	if (count <= 9) return '中等样本'
	return ''
})
const preferenceUnitLabel = computed(() => workbench.query.mergeSeries ? '系列' : '作品')
const sharedPreferenceModelNote = computed(() => `单作偏好 = 我的评分 − 全站评分
组合偏好分 = 平均偏差 × 有效${preferenceUnitLabel.value}数 /（有效${preferenceUnitLabel.value}数 + 5）。`)
const formatScoreDifference = (difference: number | null) => difference !== null && Number.isFinite(difference)
	? `${difference > 0 ? '+' : ''}${difference.toFixed(2)}`
	: ''

const profileAverage = (ids: number[]) => validAverage(ids.map((id) => Number(workbench.subjectsById.value.get(id)?.collection?.rate || 0)))
const profileGlobalAverage = (ids: number[]) => validAverage(ids.map((id) => Number(workbench.subjectsById.value.get(id)?.score || 0)))
const profileRatedCount = (ids: number[]) => ids.filter((id) => Number(workbench.subjectsById.value.get(id)?.collection?.rate || 0) > 0).length

const selectedMode = computed(() => workbench.selectedPeople.value.length > 2 ? 'group' : 'pair')

const timelineStats = computed(() => {
	const years = new Map<number, number>()
	for (const subject of workbench.sharedSubjects.value) {
		const year = Number(subject.date?.slice(0, 4))
		if (Number.isFinite(year) && year > 0) years.set(year, (years.get(year) ?? 0) + 1)
	}
	const entries = [...years.entries()].sort((a, b) => a[0] - b[0])
	const maxCount = entries.length ? Math.max(...entries.map((entry) => entry[1])) : 0
	const first = entries[0]?.[0] ?? null
	const last = entries[entries.length - 1]?.[0] ?? null
	const range = first !== null && last !== null ? Math.max(1, last - first) : 1
	return {
		entries: entries.map(([year, count]) => ({
			year,
			count,
			position: entries.length === 1 ? 50 : ((year - Number(first)) / range) * 100,
			isPeak: count === maxCount,
		})),
		first,
		last,
	}
})

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

const relationshipLift = computed(() => {
	const baseline = validAverage(workbench.selectedPeople.value.map((item) => Number(profileAverage(item.subjectIds))))
	return baseline !== null && personalAverage.value !== null ? floorTwo(personalAverage.value - baseline) : null
})

const participationDistribution = computed(() => {
	const shared = workbench.sharedSubjects.value.length
	const union = workbench.selectedUnionCount.value
	return {
		shared,
		union,
		sharedRatio: union ? (shared / union) * 100 : 0,
	}
})

const pairParticipationDistribution = computed(() => {
	const people = workbench.selectedPeople.value
	if (people.length !== 2) return null
	const left = people[0]!
	const right = people[1]!
	const shared = participationDistribution.value.shared
	const union = Math.max(1, participationDistribution.value.union)
	const leftExclusive = Math.max(0, left.subjectIds.length - shared)
	const rightExclusive = Math.max(0, right.subjectIds.length - shared)
	return {
		left: { item: left, exclusive: leftExclusive, ratio: (leftExclusive / union) * 100 },
		shared: { count: shared, ratio: (shared / union) * 100 },
		right: { item: right, exclusive: rightExclusive, ratio: (rightExclusive / union) * 100 },
	}
})

const collaborationNetwork = computed(() => {
	const people = workbench.selectedPeople.value
	const width = isMobile.value ? 340 : 720
	const height = isMobile.value ? 300 : 280
	const centerX = width / 2
	const centerY = isMobile.value ? 138 : 128
	const radiusX = isMobile.value ? 118 : 260
	const radiusY = isMobile.value ? 92 : 86
	const nodes = people.map((item, index) => {
		const angle = people.length === 2 ? Math.PI * index : -Math.PI / 2 + (Math.PI * 2 * index) / people.length
		const name = workbench.personName(item.person)
		return {
			id: item.person.id,
			name,
			label: name.length > (isMobile.value ? 6 : 10) ? `${name.slice(0, isMobile.value ? 6 : 10)}…` : name,
			imageUrl: workbench.personImageSources(item.person)[0] ?? '',
			x: people.length === 2 ? centerX + (index ? radiusX : -radiusX) : centerX + Math.cos(angle) * radiusX,
			y: people.length === 2 ? centerY : centerY + Math.sin(angle) * radiusY,
		}
	})
	const nodesById = new Map(nodes.map((node) => [node.id, node]))
	const pairLimit = people.length === 2 ? 1 : Math.min(6, people.length + 1)
	const pairs = pairStats.value.filter((pair) => pair.count > 0).slice(0, pairLimit)
	const maxCount = Math.max(1, ...pairs.map((pair) => pair.count))
	const edges = pairs.flatMap((pair) => {
		const source = nodesById.get(pair.a.person.id)
		const target = nodesById.get(pair.b.person.id)
		if (!source || !target) return []
		return [{
			key: pairKey(source.id, target.id),
			source,
			target,
			count: pair.count,
			width: 1.5 + (pair.count / maxCount) * 4,
			isStrongest: pair.count === maxCount,
			label: `${source.name}与${target.name}共同参与 ${pair.count} 部作品`,
		}]
	})
	return {
		width,
		height,
		nodes,
		edges,
		label: edges.length ? edges.map((edge) => edge.label).join('；') : '已选人物之间暂无共同参与作品',
	}
})

const bins = Array.from({ length: 10 }, (_, index) => String(index + 1))
const seriesColors = ['#c61c7c', '#158486', '#7b6cb0', '#b47716', '#3f8068', '#a35f70']
const groupedSeries = computed(() => {
	const people = workbench.selectedPeople.value.map((item, index) => {
		const rates = item.subjectIds
			.map((id) => Number(workbench.subjectsById.value.get(id)?.collection?.rate || 0))
			.filter((rate) => rate >= 1 && rate <= 10)
		return {
			key: `person-${item.person.id}`,
			marker: slotLabel(index),
			label: workbench.personName(item.person),
			color: seriesColors[index % seriesColors.length],
			average: profileAverage(item.subjectIds),
			ratedCount: rates.length,
			counts: bins.map((label) => rates.filter((rate) => rate === Number(label)).length),
		}
	})
	const sharedRates = ratedShared.value
		.map((subject) => Number(subject.collection?.rate || 0))
		.filter((rate) => rate >= 1 && rate <= 10)
	return [...people, {
		key: 'shared-works',
		marker: '',
		label: '共同作品',
		color: '#4677c8',
		average: personalAverage.value,
		ratedCount: sharedRates.length,
		counts: bins.map((label) => sharedRates.filter((rate) => rate === Number(label)).length),
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
		? roles.slice(0, 4).map((role) => ({ displayName: role.displayName || '角色', roleLabel: `声优 · ${role.roleLabel || '角色'}`, kind: 'character' as const }))
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
	<div v-if="workbench.selectedPeople.value.length < 2" class="analysis-empty surface-panel">
		<span class="analysis-empty__icon"><AppIcon name="people" :size="30" /></span>
		<h2>再选择一位共同参与者</h2>
		<p>至少需要两个人物，才能计算共同作品、评分分布和关系矩阵。</p>
		<n-button :size="controlSize" type="primary" @click="workbench.peopleDrawerOpen.value = true">打开人物选择</n-button>
	</div>

	<div v-else class="analysis-dashboard" :data-analysis-mode="selectedMode">
		<section class="relationship-hero surface-panel" aria-labelledby="analysis-title">
			<div class="analysis-title-row">
				<div>
					<h2 id="analysis-title">
						<template v-if="selectedMode === 'pair'">
							{{ workbench.personName(workbench.selectedPeople.value[0]?.person) }}
							<em>×</em>
							{{ workbench.personName(workbench.selectedPeople.value[1]?.person) }}
						</template>
						<template v-else>共同参与画像</template>
					</h2>
					<p>从 {{ workbench.selectedUnionCount.value }} 部关联作品中找到 {{ workbench.sharedSubjects.value.length }} 部共同作品。</p>
				</div>
			</div>

			<div class="profile-stage profile-stage--people">
				<article v-for="(item, index) in workbench.selectedPeople.value" :key="item.person.id" class="analysis-profile">
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
							<span class="analysis-profile__stat analysis-profile__stat--count"><b>{{ item.subjectIds.length }}</b><small>参与作品</small></span>
							<span class="analysis-profile__stat analysis-profile__stat--count"><b>{{ profileRatedCount(item.subjectIds) }}</b><small>已评分</small></span>
							<span class="analysis-profile__stat analysis-profile__stat--score"><b>{{ formatScore(profileAverage(item.subjectIds)) }}</b><small>我的均分</small></span>
						</div>
					</div>
				</article>
			</div>
		</section>

		<section v-if="!workbench.sharedSubjects.value.length" class="analysis-empty surface-panel analysis-empty--zero">
			<span class="analysis-empty__icon"><AppIcon name="info" :size="28" /></span>
			<h2>没有共同参与的作品</h2>
			<p>可以移除人物、调整某个人物的职位，或更换当前选择。</p>
			<n-button :size="controlSize" type="primary" @click="workbench.peopleDrawerOpen.value = true">调整已选人物</n-button>
		</section>

		<section
			v-if="workbench.sharedSubjects.value.length || selectedMode === 'group'"
			class="analysis-section analysis-domain rating-domain surface-panel"
			aria-labelledby="rating-title"
		>
			<div class="section-heading">
				<div><h2 id="rating-title">评分表现</h2><p>从总体评分、分布和多人组合三个层次比较共同作品。</p></div>
			</div>

			<template v-if="workbench.sharedSubjects.value.length">
				<div class="rating-summary" aria-label="共同作品评分概览">
					<div><small>共同作品</small><strong>{{ workbench.sharedSubjects.value.length }}</strong><span>部 · {{ ratedShared.length }} 部已评</span></div>
					<div><small>全站均分</small><strong>{{ formatScore(globalAverage) }}</strong></div>
					<div class="rating-summary__personal">
						<small>我的均分</small>
						<div class="rating-summary__score-row">
							<strong>{{ formatScore(personalAverage) }}</strong>
							<span
								class="rating-summary__delta"
								:class="{ 'is-positive': Number(averageScoreDifference) > 0, 'is-negative': Number(averageScoreDifference) < 0 }"
							><small>相对全站</small><b>{{ averageScoreDifference === null ? '—' : formatScoreDifference(averageScoreDifference) }}</b></span>
							<span
								class="rating-summary__delta"
								:class="{ 'is-positive': Number(relationshipLift) > 0, 'is-negative': Number(relationshipLift) < 0 }"
							><small>相对我的均分</small><b>{{ relationshipLift === null ? '—' : formatScoreDifference(relationshipLift) }}</b></span>
						</div>
					</div>
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
								<i v-for="series in groupedSeries" :key="series.key" :style="{ height: `${series.counts[binIndex] ? Math.max(4, series.counts[binIndex] / maxGroupedDistribution * 100) : 0}%`, background: series.color }" :title="`${series.label} · ${label} 分 · ${series.counts[binIndex]} 部`"><span v-if="series.counts[binIndex]">{{ series.counts[binIndex] }}</span></i>
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

		<section v-if="workbench.sharedSubjects.value.length" class="analysis-section analysis-domain preference-domain surface-panel" aria-labelledby="shared-preference-title">
			<div class="section-heading">
				<div>
					<div class="preference-title-row">
						<h2 id="shared-preference-title">相对偏好</h2>
						<n-tooltip trigger="hover" placement="top-end">
							<template #trigger>
								<button class="preference-model-info" type="button" :aria-label="`计算说明：${sharedPreferenceModelNote}`">
									<AppIcon name="info" :size="16" />
								</button>
							</template>
							<span class="preference-model-tooltip">{{ sharedPreferenceModelNote }}</span>
						</n-tooltip>
					</div>
					<p>仅基于当前人物的共同作品，比较我的评分与全站评分。</p>
				</div>
			</div>

			<div v-if="sharedPreferenceSummary.score !== null" class="preference-overview">
				<strong class="preference-overview__score">{{ formatSigned(sharedPreferenceSummary.score) }}</strong>
				<span class="preference-overview__copy">
					<strong>{{ sharedPreferenceSummary.comparableCount }} 部有效共同作品<template v-if="workbench.query.mergeSeries"> · {{ sharedPreferenceSummary.effectiveEvidence }} 个系列</template></strong>
					<small>平均偏差 {{ formatSigned(sharedPreferenceSummary.mean) }} · {{ preferenceUnitLabel }}数权重 {{ formatPercent(sharedPreferenceSummary.evidenceWeight) }}<template v-if="sharedPreferenceSampleLabel"> · {{ sharedPreferenceSampleLabel }}</template></small>
				</span>
			</div>
			<p v-else class="preference-model-note">{{ workbench.query.isGlobal ? '相对偏好只在个人收藏模式计算。' : '共同作品中没有同时具备个人评分与有效全站评分的作品。' }}</p>

			<div v-if="!workbench.query.isGlobal" class="preference-columns">
				<div>
					<h3>我更偏爱</h3>
					<ul>
						<li v-for="item in morePreferredShared" :key="item.subject.id">
							<button class="preference-work preference-work--positive" type="button" :aria-label="`在共同参与作品中定位${workbench.subjectName(item.subject)}`" @click="focusSharedWork(item.subject)">
								<SafeImage :sources="workbench.subjectImageSources(item.subject)" :alt="`${workbench.subjectName(item.subject)}封面`" kind="subject" :width="32" :height="42" decorative />
								<span class="preference-work__copy">
									<strong>{{ workbench.subjectName(item.subject) }}</strong>
									<small>我的评分 {{ formatPersonalScore(item.userScore) }} · 全站评分 {{ formatScore(item.globalScore) }}</small>
								</span>
								<b>{{ formatSigned(item.difference) }}</b>
							</button>
						</li>
						<li v-if="!morePreferredShared.length" class="muted-row">没有高于全站评分的共同作品</li>
					</ul>
				</div>
				<div>
					<h3>我更保守</h3>
					<ul>
						<li v-for="item in moreConservativeShared" :key="item.subject.id">
							<button class="preference-work preference-work--negative" type="button" :aria-label="`在共同参与作品中定位${workbench.subjectName(item.subject)}`" @click="focusSharedWork(item.subject)">
								<SafeImage :sources="workbench.subjectImageSources(item.subject)" :alt="`${workbench.subjectName(item.subject)}封面`" kind="subject" :width="32" :height="42" decorative />
								<span class="preference-work__copy">
									<strong>{{ workbench.subjectName(item.subject) }}</strong>
									<small>我的评分 {{ formatPersonalScore(item.userScore) }} · 全站评分 {{ formatScore(item.globalScore) }}</small>
								</span>
								<b>{{ formatSigned(item.difference) }}</b>
							</button>
						</li>
						<li v-if="!moreConservativeShared.length" class="muted-row">没有低于全站评分的共同作品</li>
					</ul>
				</div>
			</div>
		</section>

		<section v-if="workbench.sharedSubjects.value.length" class="analysis-section analysis-domain work-profile-domain surface-panel" aria-labelledby="analysis-tags-title">
			<SubjectTagSummary :subjects="workbench.sharedSubjects.value" title="作品画像" heading-id="analysis-tags-title" />
		</section>

		<section class="analysis-section analysis-domain collaboration-domain timeline-panel surface-panel" aria-labelledby="collaboration-title">
			<div class="section-heading">
				<div><h2 id="collaboration-title">合作关系</h2></div>
			</div>

			<div class="participation-structure participation-structure--standalone">
				<div class="section-heading section-heading--compact participation-heading">
					<div>
						<h3>{{ pairParticipationDistribution ? '合作分布' : '合作网络' }}</h3>
						<p v-if="pairParticipationDistribution">联集 {{ participationDistribution.union }} 部 · 共同 {{ participationDistribution.shared }} 部 · 占联集 {{ participationDistribution.sharedRatio.toFixed(1) }}%</p>
						<p v-else>联集 {{ participationDistribution.union }} 部 · 全员共同 {{ participationDistribution.shared }} 部<template v-if="collaborationNetwork.edges.length"> · 显示 {{ collaborationNetwork.edges.length }} 条主要关系</template></p>
					</div>
				</div>
				<div v-if="pairParticipationDistribution" class="participation-set-chart" role="img" :aria-label="`${workbench.personName(pairParticipationDistribution.left.item.person)}独有 ${pairParticipationDistribution.left.exclusive} 部，共同 ${pairParticipationDistribution.shared.count} 部，${workbench.personName(pairParticipationDistribution.right.item.person)}独有 ${pairParticipationDistribution.right.exclusive} 部`">
					<div class="participation-set-chart__bar" aria-hidden="true">
						<i class="is-left" :style="{ width: `${pairParticipationDistribution.left.ratio}%` }" />
						<i class="is-shared" :style="{ width: `${pairParticipationDistribution.shared.ratio}%` }" />
						<i class="is-right" :style="{ width: `${pairParticipationDistribution.right.ratio}%` }" />
					</div>
					<div class="participation-set-chart__metrics">
						<span class="participation-set-chart__metric is-left">
							<small :title="workbench.personName(pairParticipationDistribution.left.item.person)">仅 {{ workbench.personName(pairParticipationDistribution.left.item.person) }}</small>
							<b>{{ pairParticipationDistribution.left.exclusive }} 部</b>
						</span>
						<span class="participation-set-chart__metric is-shared"><small>共同作品</small><b>{{ pairParticipationDistribution.shared.count }} 部</b></span>
						<span class="participation-set-chart__metric is-right">
							<small :title="workbench.personName(pairParticipationDistribution.right.item.person)">仅 {{ workbench.personName(pairParticipationDistribution.right.item.person) }}</small>
							<b>{{ pairParticipationDistribution.right.exclusive }} 部</b>
						</span>
					</div>
				</div>
				<svg
					v-else
					class="collaboration-network"
					:viewBox="`0 0 ${collaborationNetwork.width} ${collaborationNetwork.height}`"
					role="img"
					:aria-label="collaborationNetwork.label"
				>
					<defs>
						<clipPath v-for="node in collaborationNetwork.nodes" :id="`collaboration-node-${node.id}`" :key="node.id">
							<rect x="-22" y="-28" width="44" height="56" rx="6" />
						</clipPath>
					</defs>
					<g v-for="edge in collaborationNetwork.edges" :key="edge.key" class="collaboration-network__edge" :class="{ 'is-strongest': edge.isStrongest }">
						<line :x1="edge.source.x" :y1="edge.source.y" :x2="edge.target.x" :y2="edge.target.y" :stroke-width="edge.width" />
						<g class="collaboration-network__edge-label" :transform="`translate(${(edge.source.x + edge.target.x) / 2} ${(edge.source.y + edge.target.y) / 2})`">
							<rect x="-23" y="-12" width="46" height="24" rx="6" />
							<text text-anchor="middle" dominant-baseline="central">{{ edge.count }} 部</text>
						</g>
					</g>
					<g v-for="node in collaborationNetwork.nodes" :key="node.id" class="collaboration-network__node" :transform="`translate(${node.x} ${node.y})`">
						<rect x="-24" y="-30" width="48" height="60" rx="8" />
						<image v-if="node.imageUrl" x="-22" y="-28" width="44" height="56" preserveAspectRatio="xMidYMid slice" :href="node.imageUrl" :clip-path="`url(#collaboration-node-${node.id})`" />
						<text class="collaboration-network__node-name" y="47" text-anchor="middle"><title>{{ node.name }}</title>{{ node.label }}</text>
					</g>
				</svg>
			</div>

			<div v-if="timelineStats.entries.length" class="analysis-domain__block" aria-labelledby="timeline-title">
				<div class="section-heading section-heading--compact"><div><h3 id="timeline-title">合作节奏</h3></div></div>
				<div class="collaboration-timeline">
					<div class="collaboration-timeline__track">
						<i
							v-for="(item, itemIndex) in timelineStats.entries"
							:key="item.year"
							:class="{
								'is-peak': item.isPeak,
								'is-recent': item.year === timelineStats.last,
								'is-first': item.year === timelineStats.first,
								'is-last': item.year === timelineStats.last,
								'is-solo': timelineStats.entries.length === 1,
								'is-label-above': itemIndex % 2 === 0,
								'is-label-below': itemIndex % 2 === 1,
							}"
							:style="{ left: `${item.position}%` }"
							:title="`${item.year} · ${item.count} 部`"
						>
							<span class="collaboration-timeline__label"><b>{{ item.count }} 部</b><time>{{ item.year }}</time></span>
						</i>
					</div>
				</div>
			</div>
		</section>

		<section v-if="workbench.sharedSubjects.value.length" class="analysis-section shared-works-section surface-panel" aria-labelledby="common-works-title">
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
					<div class="shared-work-participants">
						<div v-for="(item, personIndex) in workbench.selectedPeople.value" :key="item.person.id" class="shared-work-participant">
							<span class="shared-work-participant__index" aria-hidden="true">{{ personIndex + 1 }}</span>
							<AdaptiveParticipantBody
								:name="workbench.personName(item.person)"
								:entries="participationEntries(item.person, item.positionIds, subject.id)"
							/>
						</div>
					</div>
				</template>
			</SubjectWorkBrowser>
		</section>
	</div>
</template>
