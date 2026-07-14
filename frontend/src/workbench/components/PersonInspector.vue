<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { Subject } from '../types'
import { useWorkbench } from '../composables/useWorkbench'
import { PROFILE_EXTRAS } from '../data/profileExtras'
import SafeImage from './SafeImage.vue'
import AppIcon from './AppIcon.vue'

const workbench = useWorkbench()
type WorkSort = 'score' | 'personal' | 'collects' | 'rank' | 'date'

const workSort = ref<WorkSort>('score')
const workPage = ref(1)
const workPageSize = ref(10)
const showAllWorks = ref(false)
const workSortOptions: Array<{ label: string; value: WorkSort }> = [
	{ label: '全站评分优先', value: 'score' },
	{ label: '我的评分优先', value: 'personal' },
	{ label: '收藏人数优先', value: 'collects' },
	{ label: 'Bangumi Rank 优先', value: 'rank' },
	{ label: '日期由新到旧', value: 'date' },
]
const workPageSizeOptions = [
	{ label: '每页 4 部', value: 4 },
	{ label: '每页 6 部', value: 6 },
	{ label: '每页 10 部', value: 10 },
	{ label: '每页 12 部', value: 12 },
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

const sortedWorks = computed(() => [...workbench.focusedSubjects.value].sort((a, b) => {
	if (workSort.value === 'personal') {
		return Number(b.collection?.rate || 0) - Number(a.collection?.rate || 0)
			|| Number(b.score || 0) - Number(a.score || 0)
	}
	if (workSort.value === 'date') return String(b.date || '').localeCompare(String(a.date || ''))
	if (workSort.value === 'collects') {
		return Number(b.favoriteCount || 0) - Number(a.favoriteCount || 0)
			|| Number(b.score || 0) - Number(a.score || 0)
	}
	if (workSort.value === 'rank') {
		return Number(a.rank || Number.MAX_SAFE_INTEGER) - Number(b.rank || Number.MAX_SAFE_INTEGER)
			|| Number(b.score || 0) - Number(a.score || 0)
	}
	return Number(b.score || 0) - Number(a.score || 0)
		|| Number(a.rank || Number.MAX_SAFE_INTEGER) - Number(b.rank || Number.MAX_SAFE_INTEGER)
}))
const workPageCount = computed(() => Math.max(1, Math.ceil(sortedWorks.value.length / workPageSize.value)))
const workPageStart = computed(() => (workPage.value - 1) * workPageSize.value)
const visibleWorks = computed(() => showAllWorks.value
	? sortedWorks.value
	: sortedWorks.value.slice(workPageStart.value, workPageStart.value + workPageSize.value))
const workRange = computed(() => ({
	start: sortedWorks.value.length ? (showAllWorks.value ? 1 : workPageStart.value + 1) : 0,
	end: showAllWorks.value
		? sortedWorks.value.length
		: Math.min(workPageStart.value + workPageSize.value, sortedWorks.value.length),
}))

const preference = computed(() => workbench.focusedAllSubjects.value
	.map((subject) => ({
		subject,
		delta: Number(subject.collection?.rate || 0) - Number(subject.score || 0),
	}))
	.filter((item) => Number(item.subject.collection?.rate || 0) > 0 && Number(item.subject.score || 0) > 0)
	.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)))

const morePreferred = computed(() => preference.value.filter((item) => item.delta > 0).slice(0, 3))
const moreConservative = computed(() => preference.value.filter((item) => item.delta < 0).slice(0, 3))

const focusWork = async (subject: Subject) => {
	workbench.focusedWorkSearch.value = workbench.subjectName(subject)
	workPage.value = 1
	showAllWorks.value = false
	await nextTick()
	document.querySelector<HTMLInputElement>('input[aria-label="搜索参与作品"]')?.focus()
}

const roleLabel = (label?: string) => ({ '主役': '主角', '其他': '闲角' })[label ?? ''] ?? label ?? '参与'
const roleSummary = (subject: Subject) => {
	if (!person.value) return ''
	const roles = workbench.personSubjectRoles(person.value, subject.id)
	if (!roles.length) return rankingPositionLine.value
	return roles.map((role) =>
		`${role.displayName || role.nameCN || role.name || '角色'} · ${roleLabel(role.roleLabel)}`,
	).join(' / ')
}
const subjectSecondaryName = (subject: Subject) => {
	const primary = workbench.subjectName(subject)
	return [subject.name, subject.nameCN].find((name) => name && name !== primary) ?? ''
}
const collectionLabel = (type?: number) => ({
	1: '想看',
	2: '看过',
	3: '在看',
	4: '搁置',
	5: '抛弃',
})[Number(type)] ?? '收藏'
const numberFormatters = new Map<number, Intl.NumberFormat>()
const numberFormatter = (digits: number) => {
	if (!numberFormatters.has(digits)) numberFormatters.set(digits, new Intl.NumberFormat('zh-CN', {
		minimumFractionDigits: digits,
		maximumFractionDigits: digits,
	}))
	return numberFormatters.get(digits)!
}
const integerFormatter = new Intl.NumberFormat('zh-CN')
const dateFormatter = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'UTC' })
const formatScore = (value?: number | null, digits = 2) => Number(value) > 0
	? numberFormatter(digits).format(Number(value))
	: '—'
const formatDelta = (value: number) => `${value > 0 ? '+' : ''}${numberFormatter(1).format(value)}`
const formatDate = (value?: string) => value
	? dateFormatter.format(new Date(`${value}T00:00:00Z`))
	: '—'

watch([workbench.focusedPersonId, workbench.focusedWorkSearch, workSort, workPageSize], () => {
	workPage.value = 1
	showAllWorks.value = false
})
watch(workPageCount, (count) => {
	workPage.value = Math.min(workPage.value, count)
})
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
					<span class="section-context">{{ rankingPositionLine }} · 当前焦点</span>
					<h2 id="inspector-person-name">{{ workbench.personName(person) }}</h2>
					<p v-if="workbench.personSecondaryName(person)" class="person-profile__secondary">{{ workbench.personSecondaryName(person) }}</p>
					<div class="person-profile__meta">
						<span>{{ careerLine }}</span>
						<span v-if="profileExtra">收藏 {{ profileExtra.collects.toLocaleString('zh-CN') }} · 讨论 {{ profileExtra.comments }}</span>
					</div>
				</div>
				<section class="person-profile__bio" aria-labelledby="person-profile-bio-title">
					<strong id="person-profile-bio-title">人物简介</strong>
					<p>{{ profileSummary }}</p>
				</section>
			</div>
			<div class="profile-metrics profile-metrics--extended" aria-label="人物统计">
				<span><b>{{ person.subjectCount ?? person.subjectIds?.length ?? 0 }}</b><small>参与作品</small></span>
				<span><b>{{ person.ratedSubjectCount ?? '—' }}</b><small>已评分</small></span>
				<span><b>{{ formatScore(person.userAverage) }}</b><small>我的均分</small></span>
				<span><b>{{ formatScore(person.globalAverage) }}</b><small>全站均分</small></span>
				<span><b>{{ formatScore(overallScore) }}</b><small>综合分</small></span>
				<span><b>{{ highestRate ?? '—' }}</b><small>我的最高</small></span>
				<span><b>{{ lowestRate ?? '—' }}</b><small>我的最低</small></span>
			</div>
		</header>

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
				<div>
					<h2 id="preference-title">评分偏好</h2>
					<p>比较我的评分与 Bangumi 全站评分。</p>
				</div>
			</div>
			<div class="preference-columns">
				<div>
					<h3>我更喜欢</h3>
					<ul>
						<li v-for="item in morePreferred" :key="item.subject.id">
							<button class="preference-work preference-work--positive" type="button" :aria-label="`在参与作品中定位${workbench.subjectName(item.subject)}`" @click="focusWork(item.subject)">
								<SafeImage :sources="workbench.subjectImageSources(item.subject)" :alt="`${workbench.subjectName(item.subject)}封面`" kind="subject" :width="32" :height="42" decorative />
								<span class="preference-work__copy">
									<strong>{{ workbench.subjectName(item.subject) }}</strong>
									<small>我的 {{ formatScore(item.subject.collection?.rate) }} · 全站 {{ formatScore(item.subject.score) }}</small>
								</span>
								<b>{{ formatDelta(item.delta) }}</b>
							</button>
						</li>
						<li v-if="!morePreferred.length" class="muted-row">没有明显高于站评的作品</li>
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
									<small>我的 {{ formatScore(item.subject.collection?.rate) }} · 全站 {{ formatScore(item.subject.score) }}</small>
								</span>
								<b>{{ formatDelta(item.delta) }}</b>
							</button>
						</li>
						<li v-if="!moreConservative.length" class="muted-row">没有明显低于站评的作品</li>
					</ul>
				</div>
			</div>
		</section>

		<section class="inspector-section" aria-labelledby="person-works-title">
			<div class="section-heading">
				<div>
					<h2 id="person-works-title">参与作品</h2>
					<p>{{ person.subjectCount ?? 0 }} 部 · {{ person.ratedSubjectCount ?? 0 }} 部已评分</p>
				</div>
			</div>
			<div class="rank-works-toolbar">
				<n-input
					v-model:value="workbench.focusedWorkSearch.value"
					clearable
					placeholder="搜索中日文标题或角色名…"
					autocomplete="off"
					aria-label="搜索参与作品"
					:input-props="{ 'aria-label': '搜索参与作品', name: 'workSearch', spellcheck: 'false' }"
				>
					<template #prefix><AppIcon name="search" :size="16" /></template>
				</n-input>
				<n-select v-model:value="workSort" :options="workSortOptions" aria-label="参与作品排序" />
				<n-select v-model:value="workPageSize" :options="workPageSizeOptions" aria-label="每页作品数" />
			</div>
			<ul class="person-work-list" aria-label="参与作品列表" :aria-busy="false">
				<li v-for="subject in visibleWorks" :key="subject.id" class="person-work-row">
					<span class="work-cell person-work-row__work">
						<SafeImage :sources="workbench.subjectImageSources(subject)" :alt="`${workbench.subjectName(subject)}封面`" kind="subject" :width="36" :height="48" decorative />
						<span class="work-cell__copy">
							<a :href="`https://bgm.tv/subject/${subject.id}`" target="_blank" rel="noopener noreferrer">{{ workbench.subjectName(subject) }}</a>
							<small v-if="subjectSecondaryName(subject)">{{ subjectSecondaryName(subject) }}</small>
							<small class="work-cell__roles">{{ roleSummary(subject) }}</small>
						</span>
					</span>
					<dl class="person-work-row__facts">
						<div><dt>日期</dt><dd><time :datetime="subject.date || undefined">{{ formatDate(subject.date) }}</time></dd></div>
						<div><dt translate="no">Bangumi</dt><dd><strong>{{ formatScore(subject.score) }}</strong><small><span translate="no">Rank</span> {{ subject.rank || '—' }}</small></dd></div>
						<div><dt>收藏</dt><dd><strong>{{ integerFormatter.format(Number(subject.favoriteCount || 0)) }}</strong><small>{{ collectionLabel(subject.collection?.type) }}</small></dd></div>
						<div><dt>我的评分</dt><dd><b>{{ formatScore(subject.collection?.rate) }}</b></dd></div>
					</dl>
				</li>
				<li v-if="!visibleWorks.length" class="person-work-list__empty">没有符合当前搜索条件的作品。</li>
			</ul>
			<div class="table-disclosure rank-work-pagination" role="status" aria-live="polite">
				<span>{{ workRange.start }}—{{ workRange.end }} / {{ sortedWorks.length }}</span>
				<div class="rank-work-pagination__controls">
					<n-pagination v-if="!showAllWorks" v-model:page="workPage" :page-count="workPageCount" :page-slot="4" />
					<n-button v-if="sortedWorks.length > workPageSize" text type="primary" @click="showAllWorks = !showAllWorks">
						{{ showAllWorks ? '恢复分页' : '展示全部' }}
					</n-button>
				</div>
			</div>
		</section>
	</article>
	<div v-else class="analysis-empty person-inspector-empty">
		<span class="analysis-empty__icon"><AppIcon name="search" :size="28" /></span>
		<h2>当前查询没有匹配人物</h2>
		<p>请调整 UID、条目类型、职位或收藏范围。</p>
	</div>
</template>
