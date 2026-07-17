<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { Subject } from '../types'
import { useWorkbench } from '../composables/useWorkbench'
import {
	compareSubjectNumber,
	compareSubjectText,
	SUBJECT_WORK_PAGE_SIZES,
	useSubjectWorkBrowser,
	type SubjectWorkSortOption,
} from '../composables/useSubjectWorkBrowser'
import { PROFILE_EXTRAS } from '../data/profileExtras'
import SafeImage from './SafeImage.vue'
import AppIcon from './AppIcon.vue'
import AdaptiveRoleList from './AdaptiveRoleList.vue'
import SubjectWorkBrowser from './SubjectWorkBrowser.vue'
import SubjectTagSummary from './SubjectTagSummary.vue'

const workbench = useWorkbench()
type WorkSort = 'score' | 'personal' | 'collects' | 'rank' | 'date'
const workSortOptions: SubjectWorkSortOption<WorkSort>[] = [
	{ label: '全站评分', value: 'score' },
	{ label: '我的评分', value: 'personal' },
	{ label: '收藏人数', value: 'collects' },
	{ label: 'Bangumi Rank', value: 'rank' },
	{ label: '收藏日期', value: 'date' },
]
const person = computed(() => workbench.focusedPerson.value)
const profileExtra = computed(() => person.value ? PROFILE_EXTRAS[person.value.id] : undefined)
const careerLabels: Record<string, string> = {
	artist: '音乐人',
	seiyu: '声优',
	actor: '演员',
}
const rankingPositionLabels = computed(() => workbench.rankingPositionIds.value.map(workbench.positionLabel))
const rankingPositionLine = computed(() => rankingPositionLabels.value.join(' · ') || '未选择职位')
const careerLine = computed(() => {
	if (!person.value) return ''
	const careers = (person.value.career ?? person.value.careers ?? [])
		.map((career) => careerLabels[career] ?? career)
	return [...new Set([...rankingPositionLabels.value, ...careers])].join(' · ')
})
const profileSummary = computed(() => profileExtra.value?.summary
	?? `${workbench.personName(person.value)}以“${rankingPositionLine.value}”身份参与了 ${person.value?.subjectCount ?? 0} 部当前筛选范围内的作品。`)
const profileSummaryIsLong = computed(() => profileSummary.value.length > 60)
const profileBioExpanded = ref(false)
watch(() => person.value?.id, () => {
	profileBioExpanded.value = false
})
const ratedDistribution = computed(() => workbench.focusedDistribution.value.filter((item) => item.label !== '未评'))
const maxDistribution = computed(() => Math.max(1, ...ratedDistribution.value.map((item) => item.value)))
const distributionLabel = computed(() => `${workbench.personName(person.value)}的评分分布：${ratedDistribution.value
	.map((item) => `${item.label} ${item.value} 部`)
	.join('，')}`)
const ratedRates = computed(() => workbench.focusedAllSubjects.value
	.map((subject) => Number(subject.collection?.rate || 0))
	.filter((rate) => rate > 0))
const highestRate = computed(() => ratedRates.value.length ? Math.max(...ratedRates.value) : null)
const lowestRate = computed(() => ratedRates.value.length ? Math.min(...ratedRates.value) : null)
const overallScore = computed(() => person.value && person.value.ratedSubjectCount
	? workbench.rankingValue(person.value, 'overall')
	: null)

const {
	sort: workSort,
	order: workOrder,
	page: workPage,
	pageSize: workPageSize,
	sortedSubjects: sortedWorks,
	visibleSubjects: visibleWorks,
	rangeLabel: workRangeLabel,
} = useSubjectWorkBrowser<WorkSort>({
	subjects: () => workbench.focusedAllSubjects.value,
	search: workbench.focusedWorkSearch,
	searchTerms: (subject) => {
		const roles = person.value
			? workbench.personSubjectRoles(person.value, subject.id).flatMap((role) => [
				role.displayName,
				role.nameCN,
				role.name,
				role.roleLabel,
			])
			: []
		return [workbench.subjectName(subject), subject.displayName, subject.nameCN, subject.name, ...roles]
	},
	initialSort: 'score',
	comparators: {
		score: (a, b, direction) => compareSubjectNumber(a.score, b.score, direction),
		personal: (a, b, direction) => compareSubjectNumber(a.collection?.rate, b.collection?.rate, direction),
		collects: (a, b, direction) => compareSubjectNumber(a.favoriteCount, b.favoriteCount, direction),
		rank: (a, b, direction) => compareSubjectNumber(a.rank, b.rank, direction),
		date: (a, b, direction) => compareSubjectText(a.collection?.updatedAt ?? a.date, b.collection?.updatedAt ?? b.date, direction),
	},
})

const preferenceSummary = computed(() => person.value?.preference)
const morePreferred = computed(() => workbench.focusedPreferenceContributions.value
	.filter((item) => item.difference > 0)
	.slice(0, 3))
const moreConservative = computed(() => workbench.focusedPreferenceContributions.value
	.filter((item) => item.difference < 0)
	.slice(0, 3))
const preferenceSampleLabel = computed(() => {
	const count = Number(preferenceSummary.value?.effectiveEvidence || 0)
	if (!count) return '无有效样本'
	if (count <= 2) return '低样本'
	if (count <= 9) return '中等样本'
	return ''
})
const preferenceUnitLabel = computed(() => workbench.query.mergeSeries ? '系列' : '作品')
const preferenceModelNote = computed(() => `单作偏好 = 我的评分 − 全站评分
人物偏好分 = 平均偏差 × 有效${preferenceUnitLabel.value}数 /（有效${preferenceUnitLabel.value}数 + 5）。`)

const focusWork = async (subject: Subject) => {
	workbench.focusedWorkSearch.value = workbench.subjectName(subject)
	workPage.value = 1
	await nextTick()
	document.querySelector<HTMLInputElement>('input[aria-label="搜索参与作品"]')?.focus()
}

const roleLabel = (label?: string) => ({ '主役': '主角', '其他': '闲角' })[label ?? ''] ?? label ?? '参与'
const roleSummary = (subject: Subject) => {
	if (!person.value) return []
	return workbench.rankingPositionIds.value.flatMap((positionId) => {
		if (!workbench.positionSubjectIds(person.value!, positionId).includes(Number(subject.id))) return []
		if (Number(positionId) !== 102) return [{ name: workbench.positionLabel(positionId) }]
		const roles = workbench.personSubjectRoles(person.value!, subject.id, positionId)
		return roles.length
			? roles.map((role) => ({
				name: role.displayName || role.nameCN || role.name || '角色',
				label: roleLabel(role.roleLabel),
			}))
			: [{ name: '声优' }]
	})
}
const numberFormatters = new Map<number, Intl.NumberFormat>()
const numberFormatter = (digits: number) => {
	if (!numberFormatters.has(digits)) numberFormatters.set(digits, new Intl.NumberFormat('zh-CN', {
		minimumFractionDigits: digits,
		maximumFractionDigits: digits,
	}))
	return numberFormatters.get(digits)!
}
const formatScore = (value?: number | null, digits = 2) => Number(value) > 0
	? numberFormatter(digits).format(Number(value))
	: '—'
const formatPersonalScore = (value?: number | null) => formatScore(value, 0)
const formatSigned = (value?: number | null, digits = 2) => value === null || value === undefined || !Number.isFinite(value)
	? '—'
	: `${value > 0 ? '+' : ''}${numberFormatter(digits).format(value)}`
const formatPercent = (value?: number | null) => value === null || value === undefined || !Number.isFinite(value)
	? '—'
	: `${Math.round(value * 100)}%`
</script>

<template>
	<article v-if="person" class="person-inspector" aria-labelledby="inspector-person-name">
		<header class="person-profile">
			<div class="person-profile__intro">
				<SafeImage
					class="person-profile__portrait"
					:sources="workbench.personImageSources(person)"
					:alt="workbench.personName(person)"
					kind="person"
					loading="eager"
					priority
					:width="160"
					:height="208"
				/>
				<div class="person-profile__content">
					<div class="person-profile__name-row">
						<h2 id="inspector-person-name">{{ workbench.personName(person) }}</h2>
						<a
							class="person-profile__external-link"
							:href="`https://bgm.tv/person/${person.id}`"
							target="_blank"
							rel="noopener noreferrer"
							:title="`在 Bangumi 查看${workbench.personName(person)}`"
							:aria-label="`在 Bangumi 查看${workbench.personName(person)}的人物页`"
						>
							<AppIcon name="external" :size="16" />
						</a>
					</div>
					<span v-if="careerLine" class="person-profile__career" :title="careerLine">{{ careerLine }}</span>
					<p v-if="workbench.personSecondaryName(person)" class="person-profile__secondary">{{ workbench.personSecondaryName(person) }}</p>
				</div>
				<section class="person-profile__bio" :class="{ 'is-expanded': profileBioExpanded }" aria-label="人物简介">
					<p>{{ profileSummary }}</p>
					<button
						v-if="profileSummaryIsLong"
						class="person-profile__bio-toggle"
						type="button"
						:aria-expanded="profileBioExpanded"
						@click="profileBioExpanded = !profileBioExpanded"
					>
						{{ profileBioExpanded ? '收起' : '展开' }}
					</button>
				</section>
			</div>
			<div class="profile-metrics profile-metrics--extended" aria-label="人物统计">
				<span><b>{{ person.subjectCount ?? person.subjectIds?.length ?? 0 }}</b><small>参与作品</small></span>
				<span><b>{{ person.ratedSubjectCount ?? '—' }}</b><small>已评分</small></span>
				<span><b>{{ formatScore(person.userAverage) }}</b><small>我的均分</small></span>
				<span><b>{{ formatScore(person.globalAverage) }}</b><small>全站均分</small></span>
				<span><b>{{ formatScore(overallScore) }}</b><small>综合分</small></span>
				<span><b>{{ formatSigned(preferenceSummary?.score) }}</b><small>相对偏好</small></span>
				<span><b>{{ highestRate ?? '—' }}</b><small>我的最高</small></span>
				<span><b>{{ lowestRate ?? '—' }}</b><small>我的最低</small></span>
			</div>
		</header>

		<section class="inspector-section" aria-labelledby="person-tags-title">
			<SubjectTagSummary
				:subjects="workbench.focusedAllSubjects.value"
				title="作品标签"
				heading-id="person-tags-title"
				empty-text="该人物的参与作品暂无可用标签。"
			/>
		</section>

		<section class="inspector-section" aria-labelledby="rating-distribution-title">
			<div class="section-heading">
				<h2 id="rating-distribution-title">个人评分分布</h2>
			</div>
			<div class="score-distribution" role="img" :aria-label="distributionLabel">
				<div v-for="item in ratedDistribution" :key="item.label" class="score-bar">
					<span class="score-bar__value">{{ item.value }}</span>
					<span class="score-bar__track"><i :style="{ height: item.value ? `${Math.max(4, item.value / maxDistribution * 100)}%` : '0' }" /></span>
					<small>{{ item.label }}</small>
				</div>
			</div>
		</section>

		<section class="inspector-section" aria-labelledby="preference-title">
			<div class="section-heading">
				<div class="preference-title-row">
					<h2 id="preference-title">相对偏好</h2>
					<n-tooltip trigger="hover" placement="top-end">
						<template #trigger>
							<button class="preference-model-info" type="button" :aria-label="`计算说明：${preferenceModelNote}`">
								<AppIcon name="info" :size="16" />
							</button>
						</template>
						<span class="preference-model-tooltip">{{ preferenceModelNote }}</span>
					</n-tooltip>
				</div>
			</div>
			<div v-if="preferenceSummary?.score !== null && preferenceSummary?.score !== undefined" class="preference-overview">
				<strong class="preference-overview__score">{{ formatSigned(preferenceSummary.score) }}</strong>
				<span class="preference-overview__copy">
					<strong>{{ preferenceSummary.comparableCount }} 部有效作品<template v-if="workbench.query.mergeSeries"> · {{ preferenceSummary.effectiveEvidence }} 个系列</template></strong>
					<small>平均偏差 {{ formatSigned(preferenceSummary.mean) }} · {{ preferenceUnitLabel }}数权重 {{ formatPercent(preferenceSummary.evidenceWeight) }}<template v-if="preferenceSampleLabel"> · {{ preferenceSampleLabel }}</template></small>
				</span>
			</div>
			<p v-else class="preference-model-note">{{ workbench.query.isGlobal ? '相对偏好只在个人收藏模式计算。' : '该人物没有同时具备个人评分与有效全站评分的作品。' }}</p>
			<div v-if="!workbench.query.isGlobal" class="preference-columns">
				<div>
					<h3>我更偏爱</h3>
					<ul>
						<li v-for="item in morePreferred" :key="item.subject.id">
							<button class="preference-work preference-work--positive" type="button" :aria-label="`在参与作品中定位${workbench.subjectName(item.subject)}`" @click="focusWork(item.subject)">
								<SafeImage :sources="workbench.subjectImageSources(item.subject)" :alt="`${workbench.subjectName(item.subject)}封面`" kind="subject" :width="32" :height="42" decorative />
								<span class="preference-work__copy">
									<strong>{{ workbench.subjectName(item.subject) }}</strong>
									<small>我的评分 {{ formatPersonalScore(item.userScore) }} · 全站评分 {{ formatScore(item.globalScore) }}</small>
								</span>
								<b>{{ formatSigned(item.difference) }}</b>
							</button>
						</li>
						<li v-if="!morePreferred.length" class="muted-row">没有高于全站评分的作品</li>
					</ul>
				</div>
				<div>
					<h3>我更保守</h3>
					<ul>
						<li v-for="item in moreConservative" :key="item.subject.id">
							<button class="preference-work preference-work--negative" type="button" :aria-label="`在参与作品中定位${workbench.subjectName(item.subject)}`" @click="focusWork(item.subject)">
								<SafeImage :sources="workbench.subjectImageSources(item.subject)" :alt="`${workbench.subjectName(item.subject)}封面`" kind="subject" :width="32" :height="42" decorative />
								<span class="preference-work__copy">
									<strong>{{ workbench.subjectName(item.subject) }}</strong>
									<small>我的评分 {{ formatPersonalScore(item.userScore) }} · 全站评分 {{ formatScore(item.globalScore) }}</small>
								</span>
								<b>{{ formatSigned(item.difference) }}</b>
							</button>
						</li>
						<li v-if="!moreConservative.length" class="muted-row">没有低于全站评分的作品</li>
					</ul>
				</div>
			</div>
		</section>

		<section class="inspector-section" aria-labelledby="person-works-title">
			<SubjectWorkBrowser
				v-model:search="workbench.focusedWorkSearch.value"
				v-model:sort="workSort"
				v-model:order="workOrder"
				v-model:page="workPage"
				v-model:page-size="workPageSize"
				title="参与作品"
				title-id="person-works-title"
				:subjects="visibleWorks"
				empty-text="没有符合当前搜索条件的作品。"
				:sort-options="workSortOptions"
				search-placeholder="搜索中日文标题或角色名…"
				search-aria-label="搜索参与作品"
				sort-aria-label="参与作品排序"
				order-aria-label="参与作品排序方向"
				search-name="workSearch"
				:item-count="sortedWorks.length"
				:page-sizes="SUBJECT_WORK_PAGE_SIZES"
				:pagination-summary="workRangeLabel"
				pagination-aria-label="参与作品分页"
			>
				<template #role="{ subject }">
					<AdaptiveRoleList :entries="roleSummary(subject)" />
				</template>
			</SubjectWorkBrowser>
		</section>
	</article>
	<div v-else class="analysis-empty person-inspector-empty">
		<span class="analysis-empty__icon"><AppIcon name="search" :size="28" /></span>
		<h2>当前查询没有匹配人物</h2>
		<p>请调整 UID、条目类型、职位或收藏范围。</p>
	</div>
</template>
