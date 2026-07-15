<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Person, Subject } from '../types'
import { useWorkbench } from '../composables/useWorkbench'
import { useMediaQuery } from '../composables/useMediaQuery'
import SafeImage from './SafeImage.vue'
import AppIcon from './AppIcon.vue'
import SubjectWorkList from './SubjectWorkList.vue'

const workbench = useWorkbench()
const isNarrow = useMediaQuery('(max-width: 480px)')
const sharedPage = ref(1)
const sharedPageSize = 10
const SUMMARY_THRESHOLD = 5

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
const peakSubject = computed(() => [...workbench.sharedSubjects.value]
	.filter((subject) => Number(subject.score || 0) > 0)
	.sort((a, b) => Number(b.score || 0) - Number(a.score || 0))[0] ?? null)

const profileAverage = (ids: number[]) => validAverage(ids.map((id) => Number(workbench.subjectsById.value.get(id)?.collection?.rate || 0)))
const profileRatedCount = (ids: number[]) => ids.filter((id) => Number(workbench.subjectsById.value.get(id)?.collection?.rate || 0) > 0).length

const selectedMode = computed(() => workbench.selectedPeople.value.length >= SUMMARY_THRESHOLD
	? 'summary'
	: workbench.selectedPeople.value.length > 2 ? 'group' : 'pair')

const aggregateTags = computed(() => {
	const meta = new Map<string, number>()
	const community = new Map<string, number>()
	const personal = new Map<string, number>()
	for (const subject of workbench.sharedSubjects.value) {
		for (const rawTag of subject.metaTags ?? []) {
			const tag = typeof rawTag === 'string' ? rawTag : rawTag?.name
			if (tag) meta.set(tag, (meta.get(tag) ?? 0) + 1)
		}
		for (const rawTag of subject.tags ?? []) {
			const tag = typeof rawTag === 'string' ? rawTag : rawTag?.name
			if (tag) community.set(tag, (community.get(tag) ?? 0) + 1)
		}
		for (const tag of subject.collection?.tags ?? []) {
			if (tag) personal.set(tag, (personal.get(tag) ?? 0) + 1)
		}
	}
	const top = (source: Map<string, number>, limit: number) => [...source.entries()]
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))
		.slice(0, limit)
	return { meta: top(meta, 6), community: top(community, 8), personal: top(personal, 6) }
})
const aggregateTagCount = computed(() => aggregateTags.value.meta.length
	+ aggregateTags.value.community.length
	+ aggregateTags.value.personal.length)

const timelineStats = computed(() => {
	const years = new Map<number, number>()
	for (const subject of workbench.sharedSubjects.value) {
		const year = Number(subject.date?.slice(0, 4))
		if (Number.isFinite(year) && year > 0) years.set(year, (years.get(year) ?? 0) + 1)
	}
	const entries = [...years.entries()].sort((a, b) => a[0] - b[0])
	const maxCount = entries.length ? Math.max(...entries.map((entry) => entry[1])) : 0
	const peakYears = entries.filter((entry) => entry[1] === maxCount).map((entry) => entry[0])
	const gaps = entries.slice(1).map((entry, index) => entry[0] - entries[index][0]).sort((a, b) => a - b)
	const medianGap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0
	const first = entries[0]?.[0] ?? null
	const last = entries[entries.length - 1]?.[0] ?? null
	const range = first !== null && last !== null ? Math.max(1, last - first) : 1
	return {
		entries: entries.map(([year, count]) => ({
			year,
			count,
			position: entries.length === 1 ? 50 : ((year - Number(first)) / range) * 100,
			size: 11 + Math.min(count, 7),
			isPeak: count === maxCount,
		})),
		maxCount,
		peakYears,
		medianGap,
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
const pairFor = (rowId: number, columnId: number) => pairStats.value.find((pair) =>
	(pair.a.person.id === rowId && pair.b.person.id === columnId)
	|| (pair.a.person.id === columnId && pair.b.person.id === rowId))

const overlapRatio = computed(() => workbench.selectedUnionCount.value
	? Math.round((workbench.sharedSubjects.value.length / workbench.selectedUnionCount.value) * 100)
	: 0)

const chemistry = computed(() => {
	if (workbench.selectedPeople.value.length !== 2) return null
	const [a, b] = workbench.selectedPeople.value
	const count = workbench.sharedSubjects.value.length
	const minWorks = Math.max(1, Math.min(a.subjectIds.length, b.subjectIds.length))
	const frequency = Math.min(100, Math.max(0, (count / Math.max(1, minWorks * 0.25)) * 100))
	const baseline = validAverage([Number(profileAverage(a.subjectIds)), Number(profileAverage(b.subjectIds))])
	const lift = personalAverage.value !== null && baseline !== null ? floorTwo(personalAverage.value - baseline) : null
	const rating = lift === null ? 50 : Math.min(100, Math.max(0, 50 + lift * 25))
	const inclusiveSpan = timelineStats.value.first && timelineStats.value.last
		? timelineStats.value.last - timelineStats.value.first + 1
		: 1
	const stability = Math.min(100, Math.max(0, (timelineStats.value.entries.length / inclusiveSpan) * 100))
	return {
		score: Math.round(frequency * 0.35 + rating * 0.4 + stability * 0.25),
		frequency: Math.round(frequency),
		rating: Math.round(rating),
		stability: Math.round(stability),
		baseline,
		lift,
	}
})

const relationshipLift = computed(() => {
	const baseline = validAverage(workbench.selectedPeople.value.map((item) => Number(profileAverage(item.subjectIds))))
	return baseline !== null && personalAverage.value !== null ? floorTwo(personalAverage.value - baseline) : null
})

const participation = computed(() => {
	if (workbench.selectedPeople.value.length !== 2) return null
	const [a, b] = workbench.selectedPeople.value
	const shared = workbench.sharedSubjects.value.length
	const onlyA = a.subjectIds.length - shared
	const onlyB = b.subjectIds.length - shared
	const total = onlyA + shared + onlyB
	const percentage = (value: number) => total ? (value / total) * 100 : 0
	return { onlyA, onlyB, shared, total, percentage }
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
		marker: '交集',
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

const participationEntries = (person: Person, positionIds: number[], subjectId: number) => positionIds.flatMap((positionId) => {
	if (!workbench.positionSubjectIds(person, positionId).includes(Number(subjectId))) return []
	if (Number(positionId) !== 102) return [{ displayName: workbench.positionLabel(positionId), roleLabel: '参与职位' }]
	const roles = workbench.personSubjectRoles(person, subjectId, positionId)
	return roles.length
		? roles.slice(0, 4).map((role) => ({ displayName: role.displayName || '角色', roleLabel: `声优 · ${role.roleLabel || '角色'}` }))
		: [{ displayName: '声优', roleLabel: '参与职位' }]
})

const sharedPageCount = computed(() => Math.max(1, Math.ceil(workbench.sharedSubjects.value.length / sharedPageSize)))
const visibleSharedWorks = computed(() => {
	const start = (sharedPage.value - 1) * sharedPageSize
	return workbench.sharedSubjects.value.slice(start, start + sharedPageSize)
})
const visibleRange = computed(() => {
	const start = (sharedPage.value - 1) * sharedPageSize
	return `${workbench.sharedSubjects.value.length ? start + 1 : 0}—${Math.min(start + sharedPageSize, workbench.sharedSubjects.value.length)}`
})

watch(() => workbench.sharedSubjects.value.map((subject) => subject.id).join(','), () => {
	sharedPage.value = 1
})
watch(sharedPageCount, (count) => { sharedPage.value = Math.min(sharedPage.value, count) })
</script>

<template>
	<div v-if="workbench.selectedPeople.value.length < 2" class="analysis-empty surface-panel">
		<span class="analysis-empty__icon"><AppIcon name="people" :size="30" /></span>
		<h2>再选择一位共同参与者</h2>
		<p>至少需要两个人物，才能计算共同作品、评分分布和关系矩阵。</p>
		<n-button type="primary" @click="workbench.peopleDrawerOpen.value = true">打开人物选择</n-button>
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

			<div class="profile-stage" :class="`profile-stage--${selectedMode}`">
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

			<div v-if="selectedMode === 'pair' && participation" class="participation-structure">
				<div class="section-heading section-heading--compact">
					<div><span class="section-context">参与作品分布</span><h2>两人的参与作品分布</h2><p>去重后 {{ participation.total }} 部 · 共同占比 {{ participation.percentage(participation.shared).toFixed(1) }}%</p></div>
				</div>
				<div class="participation-labels" :style="{ gridTemplateColumns: `${Math.max(participation.onlyA, 0.001)}fr ${Math.max(participation.shared, 0.001)}fr ${Math.max(participation.onlyB, 0.001)}fr` }">
					<span>1 单独参与 · {{ participation.onlyA }}</span><span>共同参与 · {{ participation.shared }}</span><span>2 单独参与 · {{ participation.onlyB }}</span>
				</div>
				<div class="participation-bar" :style="{ gridTemplateColumns: `${Math.max(participation.onlyA, 0.001)}fr ${Math.max(participation.shared, 0.001)}fr ${Math.max(participation.onlyB, 0.001)}fr` }" :aria-label="`第 1 位人物单独参与 ${participation.percentage(participation.onlyA).toFixed(1)}%，共同参与 ${participation.percentage(participation.shared).toFixed(1)}%，第 2 位人物单独参与 ${participation.percentage(participation.onlyB).toFixed(1)}%`">
					<span class="is-a">{{ participation.percentage(participation.onlyA).toFixed(1) }}%</span>
					<span class="is-common">{{ participation.percentage(participation.shared).toFixed(1) }}%</span>
					<span class="is-b">{{ participation.percentage(participation.onlyB).toFixed(1) }}%</span>
				</div>
			</div>

			<div v-else-if="selectedMode === 'summary'" class="top-pairs-summary">
				<div class="section-heading section-heading--compact"><div><span class="section-context">多人关系分析</span><h2>高频两两组合</h2><p>先展示共同作品数最多的组合。</p></div><strong>{{ workbench.sharedSubjects.value.length }}<small>全员共同</small></strong></div>
				<div class="top-pair-list">
					<article v-for="(pair, index) in pairStats.slice(0, 5)" :key="`${pair.a.person.id}-${pair.b.person.id}`">
						<span>#{{ index + 1 }}</span><b>{{ workbench.personName(pair.a.person) }} × {{ workbench.personName(pair.b.person) }}</b><strong>{{ pair.count }} 部</strong><small>全站 {{ formatScore(pair.globalAverage) }} · 我的 {{ formatScore(pair.userAverage) }}</small>
					</article>
				</div>
			</div>

			<section class="analysis-tag-groups" aria-labelledby="analysis-tags-title">
				<div class="analysis-tag-groups__heading">
					<strong id="analysis-tags-title">作品标签</strong>
					<span v-if="aggregateTagCount">{{ aggregateTagCount }} 个高频标签</span>
				</div>
				<div v-if="aggregateTagCount" class="tag-groups">
					<div class="tag-row"><strong>条目属性</strong><div><span v-for="([tag, count]) in aggregateTags.meta" :key="`meta-${tag}`">{{ tag }} · {{ count }}</span><span v-if="!aggregateTags.meta.length">无</span></div></div>
					<div class="tag-row"><strong>社区标签</strong><div><span v-for="([tag, count]) in aggregateTags.community" :key="`community-${tag}`">{{ tag }} · {{ count }}</span><span v-if="!aggregateTags.community.length">无</span></div></div>
					<div class="tag-row"><strong>我的收藏标签</strong><div><span v-for="([tag, count]) in aggregateTags.personal" :key="`personal-${tag}`">{{ tag }} · {{ count }}</span><span v-if="!aggregateTags.personal.length">未设置</span></div></div>
				</div>
				<p v-else class="analysis-tag-groups__empty">这些共同作品暂无可用标签。</p>
			</section>
		</section>

		<section v-if="!workbench.sharedSubjects.value.length" class="analysis-empty surface-panel analysis-empty--zero">
			<span class="analysis-empty__icon"><AppIcon name="info" :size="28" /></span>
			<h2>没有共同参与的作品</h2>
			<p>可以移除人物、调整某个人物的职位，或更换当前选择。</p>
			<n-button type="primary" @click="workbench.peopleDrawerOpen.value = true">调整已选人物</n-button>
		</section>

		<template v-else>
			<section class="metric-ledger metric-ledger--expanded surface-panel" aria-label="共同参与关键统计">
				<div><small>共同作品</small><strong>{{ workbench.sharedSubjects.value.length }}</strong><span>部</span></div>
				<div><small>合作默契</small><strong>{{ overlapRatio }}</strong><span>% · 交集 / 并集</span></div>
				<div v-if="chemistry" class="metric-with-tip">
					<small>合作默契指数</small><strong>{{ chemistry.score }}</strong><span>/ 100</span>
					<n-popover trigger="hover" placement="bottom">
						<template #trigger><n-button class="metric-info" quaternary circle size="tiny" attr-type="button" aria-label="查看合作默契指数计算说明"><template #icon><AppIcon name="info" :size="14" /></template></n-button></template>
						<div class="metric-formula"><p>共同参与频次、评分表现与活跃年份覆盖综合计算，仅供参考。</p><span>频次 {{ chemistry.frequency }} × 35%</span><span>评分 {{ chemistry.rating }} × 40%</span><span>稳定性 {{ chemistry.stability }} × 25%</span></div>
					</n-popover>
				</div>
				<div v-else><small>最佳两两组合</small><strong>{{ bestPair?.count ?? 0 }}</strong><span>{{ bestPair ? `${workbench.personName(bestPair.a.person)} × ${workbench.personName(bestPair.b.person)}` : '—' }}</span></div>
				<div><small>我的均分</small><strong>{{ formatScore(personalAverage) }}</strong><span>{{ ratedShared.length }} 部已评</span></div>
				<div><small>全站均分</small><strong>{{ formatScore(globalAverage) }}</strong><span>Bangumi 口径</span></div>
				<div><small>口碑峰值作品</small><strong>{{ formatScore(peakSubject?.score) }}</strong><span>{{ peakSubject ? workbench.subjectName(peakSubject) : '—' }}</span></div>
			</section>

			<div class="analysis-grid analysis-grid--insights">
				<section class="analysis-section surface-panel" aria-labelledby="grouped-rating-title">
					<div class="section-heading"><div><h2 id="grouped-rating-title">评分分布对比</h2><p>人物与共同作品 · 1–10 分同组同轴对比。</p></div></div>
					<div class="distribution-legend">
						<span v-for="series in groupedSeries" :key="series.key" :style="{ '--series-color': series.color }">
							<i aria-hidden="true" /><b>{{ series.marker }} · {{ series.label }}</b><small>均分 {{ formatScore(series.average) }} · {{ series.ratedCount }} 部已评</small>
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
					<p class="chart-note">共同作品已并入对比；所有系列使用同一纵轴，仅统计已评分作品。</p>
				</section>

				<section class="analysis-section surface-panel" aria-labelledby="relationship-signals-title">
					<div class="section-heading"><div><h2 id="relationship-signals-title">关系信号</h2></div></div>
					<div class="signal-grid">
						<div><small>合作评分提升</small><strong>{{ relationshipLift === null ? '—' : `${relationshipLift >= 0 ? '+' : ''}${formatScore(relationshipLift)}` }}</strong><span>共同均分 − 人物均分基线</span></div>
						<div><small>合作跨度</small><strong>{{ timelineStats.first && timelineStats.last ? timelineStats.last - timelineStats.first : 0 }} 年</strong><span>{{ timelineStats.first }}—{{ timelineStats.last }} · {{ workbench.sharedSubjects.value.length }} 部</span></div>
						<div v-for="item in workbench.selectedPeople.value" :key="item.person.id"><small>{{ workbench.personName(item.person) }} 覆盖率</small><strong>{{ (workbench.sharedSubjects.value.length / Math.max(1, item.subjectIds.length) * 100).toFixed(1) }}%</strong><span>{{ workbench.sharedSubjects.value.length }} / {{ item.subjectIds.length }}</span></div>
					</div>
					<div v-if="chemistry?.baseline !== null" class="rating-lift-scale">
						<div><i :style="{ left: `${Math.max(0, Math.min(100, Number(chemistry?.baseline || 0) * 10))}%` }" /><i :style="{ left: `${Math.max(0, Math.min(100, Number(personalAverage || 0) * 10))}%` }" /></div>
						<span>个人基线 {{ formatScore(chemistry?.baseline) }}</span><span>共同均分 {{ formatScore(personalAverage) }}</span>
					</div>
				</section>
			</div>

			<section class="analysis-section timeline-panel surface-panel" aria-labelledby="timeline-title">
				<div class="section-heading"><div><h2 id="timeline-title">重复合作时间线</h2><p>横向距离按年份差值 · 圆点大小代表共同条目数。</p></div></div>
				<div class="collaboration-timeline">
					<div class="collaboration-timeline__track">
						<i
							v-for="item in timelineStats.entries"
							:key="item.year"
							:class="{
								'is-peak': item.isPeak,
								'is-recent': item.year === timelineStats.last,
								'is-first': item.year === timelineStats.first,
								'is-last': item.year === timelineStats.last,
								'is-solo': timelineStats.entries.length === 1,
							}"
							:style="{ left: `${item.position}%`, width: `${item.size}px`, height: `${item.size}px` }"
							:title="`${item.year} · ${item.count} 部`"
						>
							<span>{{ item.count }} 部</span><time>{{ item.year }}</time>
						</i>
					</div>
				</div>
				<div class="timeline-summary">
					<span>首次同作 <b>{{ timelineStats.first }}</b></span>
					<span>合作峰值 <b>{{ timelineStats.peakYears.join(' / ') }} · {{ timelineStats.maxCount }} 部</b></span>
					<span>活跃年份间隔中位数 <b>{{ timelineStats.medianGap }} 年</b></span>
					<span>最近同作 <b>{{ timelineStats.last }}</b></span>
				</div>
			</section>

			<section class="analysis-section surface-panel" aria-labelledby="matrix-title">
				<div class="section-heading"><div><h2 id="matrix-title">两两关系矩阵</h2><p>全站均分 / 共同作品数；高亮共同作品最多的组合。</p></div></div>
				<component
					:is="workbench.selectedPeople.value.length < SUMMARY_THRESHOLD ? 'div' : 'details'"
					class="matrix-details"
					:class="{ 'matrix-details--direct': workbench.selectedPeople.value.length < SUMMARY_THRESHOLD }"
				>
					<summary v-if="workbench.selectedPeople.value.length >= SUMMARY_THRESHOLD">
						展开 {{ workbench.selectedPeople.value.length }} × {{ workbench.selectedPeople.value.length }} 两两关系矩阵
					</summary>
					<div class="data-scroll-x">
						<table class="matrix-table" :style="{ '--matrix-size': workbench.selectedPeople.value.length }">
							<thead><tr><th scope="col">组合</th><th v-for="item in workbench.selectedPeople.value" :key="item.person.id" scope="col">{{ workbench.personName(item.person) }}<small>{{ item.positionIds.map(workbench.positionLabel).join(' / ') }}</small></th></tr></thead>
							<tbody>
								<tr v-for="row in workbench.selectedPeople.value" :key="row.person.id">
									<th scope="row">{{ workbench.personName(row.person) }}<small>{{ row.positionIds.map(workbench.positionLabel).join(' / ') }}</small></th>
									<td v-for="column in workbench.selectedPeople.value" :key="column.person.id" :class="{ 'is-diagonal': row.person.id === column.person.id, 'is-best': row.person.id !== column.person.id && Boolean(bestPair?.count) && pairFor(row.person.id, column.person.id)?.count === bestPair?.count }">
										<template v-if="row.person.id === column.person.id"><b>{{ row.subjectIds.length }}</b><small>关联作品</small></template>
										<template v-else><b>{{ formatScore(pairFor(row.person.id, column.person.id)?.globalAverage) }}</b><small>{{ pairFor(row.person.id, column.person.id)?.count ?? 0 }} 部</small></template>
									</td>
								</tr>
							</tbody>
						</table>
					</div>
				</component>
			</section>

			<section class="analysis-section surface-panel" aria-labelledby="common-works-title">
				<div class="section-heading"><div><h2 id="common-works-title">共同参与作品</h2><p>{{ workbench.sharedSubjects.value.length }} 部 · 按个人评分与站评分排序</p></div></div>
				<SubjectWorkList :subjects="visibleSharedWorks" empty-text="当前选择没有共同作品。">
					<template #participants="{ subject }">
						<div class="shared-work-participants">
							<div v-for="item in workbench.selectedPeople.value" :key="item.person.id" class="shared-work-participant">
								<strong>{{ workbench.personName(item.person) }}</strong>
								<span class="shared-work-participant__roles">
									<span v-for="entry in participationEntries(item.person, item.positionIds, subject.id)" :key="`${entry.displayName}-${entry.roleLabel}`" class="role-entry"><b>{{ entry.displayName }}</b><small>{{ entry.roleLabel }}</small></span>
								</span>
							</div>
						</div>
					</template>
				</SubjectWorkList>
				<div v-if="workbench.sharedSubjects.value.length > sharedPageSize" class="table-disclosure table-disclosure--pager">
					<span>{{ visibleRange }} / {{ workbench.sharedSubjects.value.length }}</span>
					<n-pagination v-model:page="sharedPage" :page-count="sharedPageCount" :page-slot="isNarrow ? 2 : 4" />
				</div>
			</section>
		</template>
	</div>
</template>
