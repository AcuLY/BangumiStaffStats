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
const careerLine = computed(() => {
	if (!person.value) return ''
	const careers = (person.value.career ?? person.value.careers ?? [])
		.map((career) => careerLabels[career] ?? career)
	return [...new Set([workbench.positionLabel(workbench.query.positionId), ...careers])].join(' · ')
})
const profileSummary = computed(() => profileExtra.value?.summary
	?? `${workbench.personName(person.value)}以“${workbench.positionLabel(workbench.query.positionId)}”身份参与了 ${person.value?.subjectCount ?? 0} 部当前筛选范围内的作品。`)
const maxDistribution = computed(() => Math.max(1, ...workbench.focusedDistribution.value.map((item) => item.value)))
const distributionLabel = computed(() => `${workbench.personName(person.value)}的评分分布：${workbench.focusedDistribution.value
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
	if (!roles.length) return workbench.positionLabel(workbench.query.positionId)
	return roles.slice(0, 3).map((role) =>
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
const formatScore = (value?: number | null, digits = 2) => Number(value) > 0
	? Number(value).toFixed(digits)
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
				<SafeImage
					class="person-profile__portrait"
					:sources="workbench.personImageSources(person)"
					:alt="workbench.personName(person)"
					kind="person"
					loading="eager"
					priority
				:width="160"
				:height="196"
			/>
			<div class="person-profile__content">
				<span class="section-context">{{ workbench.positionLabel(workbench.query.positionId) }} · 当前焦点</span>
				<h1 id="inspector-person-name">{{ workbench.personName(person) }}</h1>
				<p v-if="workbench.personSecondaryName(person)">{{ workbench.personSecondaryName(person) }}</p>
				<div class="person-profile__meta">
					<span>{{ careerLine }}</span>
					<span v-if="profileExtra">收藏 {{ profileExtra.collects.toLocaleString('zh-CN') }} · 讨论 {{ profileExtra.comments }}</span>
				</div>
				<details class="person-profile__bio" open>
					<summary>人物简介</summary>
					<p>{{ profileSummary }}</p>
				</details>
				<div class="profile-metrics profile-metrics--extended" aria-label="人物统计">
					<span><b>{{ person.subjectCount ?? person.subjectIds?.length ?? 0 }}</b><small>参与作品</small></span>
					<span><b>{{ person.ratedSubjectCount ?? '—' }}</b><small>已评分</small></span>
					<span><b>{{ formatScore(person.userAverage) }}</b><small>我的均分</small></span>
					<span><b>{{ formatScore(person.globalAverage) }}</b><small>全站均分</small></span>
					<span><b>{{ formatScore(overallScore) }}</b><small>综合分</small></span>
					<span><b>{{ highestRate ?? '—' }}</b><small>我的最高</small></span>
					<span><b>{{ lowestRate ?? '—' }}</b><small>我的最低</small></span>
				</div>
			</div>
		</header>

		<section class="inspector-section" aria-labelledby="rating-distribution-title">
			<div class="section-heading">
				<div>
					<h2 id="rating-distribution-title">个人评分分布</h2>
					<p>未评分作品计入作品数，但不计入均分。</p>
				</div>
				<span class="derived-label"><AppIcon name="info" :size="14" />本地快照</span>
			</div>
				<div class="score-distribution" role="img" :aria-label="distributionLabel">
				<div v-for="item in workbench.focusedDistribution.value" :key="item.label" class="score-bar">
					<span class="score-bar__value">{{ item.value }}</span>
					<span class="score-bar__track"><i :style="{ height: `${Math.max(4, item.value / maxDistribution * 100)}%` }" /></span>
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
								<b>+{{ item.delta.toFixed(1) }}</b>
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
								<b>{{ item.delta.toFixed(1) }}</b>
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
					placeholder="搜索中日文标题或角色名"
					aria-label="搜索参与作品"
					:input-props="{ 'aria-label': '搜索参与作品' }"
				>
					<template #prefix><AppIcon name="search" :size="16" /></template>
				</n-input>
				<n-select v-model:value="workSort" :options="workSortOptions" aria-label="参与作品排序" />
				<n-select v-model:value="workPageSize" :options="workPageSizeOptions" aria-label="每页作品数" />
			</div>
			<div class="data-scroll-x">
				<table class="works-table works-table--person">
					<thead><tr><th>作品</th><th>日期</th><th>Bangumi</th><th>收藏</th><th>我的评分</th></tr></thead>
					<tbody>
						<tr v-for="subject in visibleWorks" :key="subject.id">
							<td>
								<span class="work-cell">
									<SafeImage :sources="workbench.subjectImageSources(subject)" :alt="`${workbench.subjectName(subject)}封面`" kind="subject" :width="36" :height="48" decorative />
									<span class="work-cell__copy">
										<a :href="`https://bgm.tv/subject/${subject.id}`" target="_blank" rel="noopener noreferrer">{{ workbench.subjectName(subject) }}</a>
										<small v-if="subjectSecondaryName(subject)">{{ subjectSecondaryName(subject) }}</small>
										<small class="work-cell__roles">{{ roleSummary(subject) }}</small>
									</span>
								</span>
							</td>
							<td>{{ subject.date || '—' }}</td>
							<td><strong>{{ formatScore(subject.score) }}</strong><small class="table-cell-meta">Rank {{ subject.rank || '—' }}</small></td>
							<td><strong>{{ Number(subject.favoriteCount || 0).toLocaleString('zh-CN') }}</strong><small class="table-cell-meta">{{ collectionLabel(subject.collection?.type) }}</small></td>
							<td><b>{{ formatScore(subject.collection?.rate) }}</b></td>
						</tr>
						<tr v-if="!visibleWorks.length"><td colspan="5" class="table-empty">没有符合当前搜索条件的作品。</td></tr>
					</tbody>
				</table>
			</div>
			<div class="table-disclosure rank-work-pagination">
				<span>{{ workRange.start }}—{{ workRange.end }} / {{ sortedWorks.length }}</span>
				<div>
					<n-pagination v-if="!showAllWorks" v-model:page="workPage" :page-count="workPageCount" :page-slot="5" />
					<n-button v-if="sortedWorks.length > workPageSize" text type="primary" @click="showAllWorks = !showAllWorks">
						{{ showAllWorks ? '恢复分页' : '展示全部' }}
					</n-button>
				</div>
			</div>
		</section>
	</article>
	<div v-else class="analysis-empty person-inspector-empty">
		<span class="analysis-empty__icon"><AppIcon name="search" :size="28" /></span>
		<h1>当前查询没有匹配人物</h1>
		<p>请调整 UID、条目类型、职位或收藏范围。</p>
	</div>
</template>
