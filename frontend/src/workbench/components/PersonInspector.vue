<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { Subject } from '../types'
import { useWorkbench } from '../composables/useWorkbench'
import {
	compareSubjectNumber,
	compareSubjectText,
	compactSubjectSearch,
	SUBJECT_WORK_PAGE_SIZES,
	useSubjectWorkBrowser,
	type SubjectWorkSortOption,
	type SubjectWorkSortOrder,
} from '../composables/useSubjectWorkBrowser'
import {
	characterCreditName,
	characterRoleLabel,
} from '../domain/characterCredits'
import { PROFILE_EXTRAS } from '../data/profileExtras'
import SafeImage from './SafeImage.vue'
import AppIcon from './AppIcon.vue'
import AdaptiveRoleList from './AdaptiveRoleList.vue'
import CharacterRoleList from './CharacterRoleList.vue'
import WorkbenchTooltip from './WorkbenchTooltip.vue'
import RatingDistributionChart from './RatingDistributionChart.vue'
import SubjectWorkBrowser from './SubjectWorkBrowser.vue'
import SubjectWorkList from './SubjectWorkList.vue'
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
const overallScoreTooltipVisible = ref(false)
const preferenceTooltipVisible = ref(false)
watch(() => person.value?.id, () => {
	profileBioExpanded.value = false
})
const ratedRates = computed(() => workbench.focusedAllSubjects.value
	.map((subject) => Number(subject.collection?.rate || 0))
	.filter((rate) => rate > 0))
const highestRate = computed(() => ratedRates.value.length ? Math.max(...ratedRates.value) : null)
const lowestRate = computed(() => ratedRates.value.length ? Math.min(...ratedRates.value) : null)
const overallScore = computed(() => person.value && person.value.ratedSubjectCount
	? workbench.rankingValue(person.value, 'overall')
	: null)
const overallScoreNote = '综合分 =（我的均分 × 已评分数 + 5 分 × 5 部）÷（已评分数 + 5）。相当于加入 5 部 5 分的中性作品，避免作品很少时均分过度靠前。'

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

type CreditView = 'works' | 'characters'
type CharacterSort = 'role' | 'works' | 'name'
const characterSortOptions: SubjectWorkSortOption<CharacterSort>[] = [
	{ label: '戏份类型', value: 'role' },
	{ label: '作品数', value: 'works' },
	{ label: '角色名', value: 'name' },
]
const CHARACTER_PAGE_SIZES = [5, 10, 20, 50]
	.map((value) => ({ label: `每页 ${value} 个角色`, value }))
const creditView = ref<CreditView>('works')
const isVoiceActorQuery = computed(() => workbench.rankingPositionIds.value.includes(102))
const characterSearch = ref('')
const characterSort = ref<CharacterSort>('role')
const characterOrder = ref<SubjectWorkSortOrder>('desc')
const characterPage = ref(1)
const characterPageSize = ref(10)
const characterCredits = computed(() => workbench.focusedCharacterCredits.value)
const filteredCharacterCredits = computed(() => {
	const query = compactSubjectSearch(characterSearch.value)
	if (!query) return characterCredits.value
	return characterCredits.value.filter((credit) => [
		credit.displayName,
		credit.nameCN,
		credit.name,
		...credit.roleLabels,
		...credit.appearances.flatMap((appearance) => [
			workbench.subjectName(appearance.subject),
			appearance.subject.displayName,
			appearance.subject.nameCN,
			appearance.subject.name,
		]),
	].some((value) => compactSubjectSearch(value).includes(query)))
})
const sortedCharacterCredits = computed(() => {
	const direction = characterOrder.value === 'asc' ? 1 : -1
	return [...filteredCharacterCredits.value].sort((a, b) => {
		let delta = 0
		if (characterSort.value === 'role') delta = (a.primaryRolePriority - b.primaryRolePriority) * direction
		if (characterSort.value === 'works') delta = (a.subjectCount - b.subjectCount) * direction
		if (characterSort.value === 'name') {
			delta = characterCreditName(a).localeCompare(characterCreditName(b), 'zh-CN', { numeric: true }) * direction
		}
		return delta
			|| b.subjectCount - a.subjectCount
			|| b.primaryRolePriority - a.primaryRolePriority
			|| characterCreditName(a).localeCompare(characterCreditName(b), 'zh-CN', { numeric: true })
			|| a.key.localeCompare(b.key)
	})
})
const characterPageCount = computed(() => Math.max(1, Math.ceil(sortedCharacterCredits.value.length / characterPageSize.value)))
const characterPageStart = computed(() => (characterPage.value - 1) * characterPageSize.value)
const visibleCharacterCredits = computed(() => sortedCharacterCredits.value.slice(
	characterPageStart.value,
	characterPageStart.value + characterPageSize.value,
))
const characterRangeLabel = computed(() => {
	const start = sortedCharacterCredits.value.length ? characterPageStart.value + 1 : 0
	const end = Math.min(characterPageStart.value + characterPageSize.value, sortedCharacterCredits.value.length)
	return `${start}—${end} / ${sortedCharacterCredits.value.length}`
})

watch([filteredCharacterCredits, characterSort, characterOrder, characterPageSize], () => { characterPage.value = 1 })
watch(characterPageCount, (count) => { characterPage.value = Math.min(characterPage.value, count) })
watch(() => person.value?.id, () => {
	characterSearch.value = ''
	characterPage.value = 1
})
watch(isVoiceActorQuery, (enabled) => {
	if (!enabled) creditView.value = 'works'
}, { immediate: true })

const browserSearch = computed<string>({
	get: () => creditView.value === 'characters' ? characterSearch.value : workbench.focusedWorkSearch.value,
	set: (value) => {
		if (creditView.value === 'characters') characterSearch.value = value
		else workbench.focusedWorkSearch.value = value
	},
})
const browserSort = computed<string>({
	get: () => creditView.value === 'characters' ? characterSort.value : workSort.value,
	set: (value) => {
		if (creditView.value === 'characters') characterSort.value = value as CharacterSort
		else workSort.value = value as WorkSort
	},
})
const browserOrder = computed<SubjectWorkSortOrder>({
	get: () => creditView.value === 'characters' ? characterOrder.value : workOrder.value,
	set: (value) => {
		if (creditView.value === 'characters') characterOrder.value = value
		else workOrder.value = value
	},
})
const browserPage = computed<number>({
	get: () => creditView.value === 'characters' ? characterPage.value : workPage.value,
	set: (value) => {
		if (creditView.value === 'characters') characterPage.value = value
		else workPage.value = value
	},
})
const browserPageSize = computed<number>({
	get: () => creditView.value === 'characters' ? characterPageSize.value : workPageSize.value,
	set: (value) => {
		if (creditView.value === 'characters') characterPageSize.value = value
		else workPageSize.value = value
	},
})
const browserTitle = computed(() => creditView.value === 'characters' ? '配音角色' : '参与作品')
const browserSubjects = computed(() => creditView.value === 'works' ? visibleWorks.value : [])
const browserEmptyText = computed(() => creditView.value === 'characters'
	? '没有符合当前搜索条件的角色。'
	: '没有符合当前搜索条件的作品。')
const browserSortOptions = computed(() => creditView.value === 'characters' ? characterSortOptions : workSortOptions)
const browserSearchPlaceholder = computed(() => creditView.value === 'characters'
	? '搜索角色双语名或来源作品…'
	: '搜索中日文标题或角色名…')
const browserSearchAriaLabel = computed(() => creditView.value === 'characters' ? '搜索配音角色' : '搜索参与作品')
const browserSortAriaLabel = computed(() => creditView.value === 'characters' ? '配音角色排序' : '参与作品排序')
const browserOrderAriaLabel = computed(() => creditView.value === 'characters' ? '配音角色排序方向' : '参与作品排序方向')
const browserSearchName = computed(() => creditView.value === 'characters' ? 'characterSearch' : 'workSearch')
const browserItemCount = computed(() => creditView.value === 'characters' ? sortedCharacterCredits.value.length : sortedWorks.value.length)
const browserPageSizes = computed(() => creditView.value === 'characters' ? CHARACTER_PAGE_SIZES : SUBJECT_WORK_PAGE_SIZES)
const browserRangeLabel = computed(() => creditView.value === 'characters' ? characterRangeLabel.value : workRangeLabel.value)
const browserPaginationAriaLabel = computed(() => creditView.value === 'characters' ? '配音角色分页' : '参与作品分页')
const browserCompactAriaLabel = computed(() => creditView.value === 'characters' ? '角色缩略模式' : '作品缩略模式')
const browserCompactDescription = computed(() => creditView.value === 'characters'
	? '仅显示角色的缩小头像和双语名'
	: '仅显示序号、双语名和我的分数')
const updateCreditView = (value: string | number) => {
	if (value === 'works' || value === 'characters') creditView.value = value
}

const preferenceSummary = computed(() => person.value?.preference)
const morePreferred = computed(() => workbench.focusedPreferenceContributions.value
	.filter((item) => item.difference > 0)
	.slice(0, 3))
const moreConservative = computed(() => workbench.focusedPreferenceContributions.value
	.filter((item) => item.difference < 0)
	.slice(0, 3))
const preferenceUnitLabel = computed(() => workbench.query.mergeSeries ? '系列' : '作品')
const preferenceModelNote = computed(() => `单作偏好 = 我的评分 − 全站评分
人物偏好分 = 平均偏差 × 有效${preferenceUnitLabel.value}数 /（有效${preferenceUnitLabel.value}数 + 5）。`)

const focusWork = async (subject: Subject) => {
	creditView.value = 'works'
	workbench.focusedWorkSearch.value = workbench.subjectName(subject)
	workPage.value = 1
	await nextTick()
	document.querySelector<HTMLInputElement>('input[aria-label="搜索参与作品"]')?.focus()
}

const roleSummary = (subject: Subject) => {
	if (!person.value) return []
	return workbench.rankingPositionIds.value.flatMap((positionId) => {
		if (!workbench.positionSubjectIds(person.value!, positionId).includes(Number(subject.id))) return []
		if (Number(positionId) !== 102) return [{ name: workbench.positionLabel(positionId) }]
		const roles = workbench.personSubjectRoles(person.value!, subject.id, positionId)
		return roles.length
			? roles.map((role) => ({
				name: role.displayName || role.nameCN || role.name || '角色',
				label: characterRoleLabel(role),
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
						<h2 id="inspector-person-name">
							<a
								class="person-profile__name-link"
								:href="`https://bgm.tv/person/${person.id}`"
								target="_blank"
								rel="noopener noreferrer"
								:title="`在 Bangumi 查看${workbench.personName(person)}`"
							>{{ workbench.personName(person) }}</a>
						</h2>
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
				<span><b>{{ formatScore(person.globalAverage) }}</b><small>全站均分</small></span>
				<span class="profile-metric--primary"><b>{{ formatScore(person.userAverage) }}</b><small>我的均分</small></span>
				<span class="profile-metric--primary">
					<b>{{ formatScore(overallScore) }}</b>
					<small class="profile-metric__label">
						<span class="profile-metric__label-text">综合分</span>
						<WorkbenchTooltip :show="overallScoreTooltipVisible" trigger="manual" placement="top-end">
							<template #trigger>
								<button
									class="profile-metric__info"
									type="button"
									:aria-label="`综合分计算说明：${overallScoreNote}`"
									@mouseenter="overallScoreTooltipVisible = true"
									@mouseleave="overallScoreTooltipVisible = false"
									@focus="overallScoreTooltipVisible = true"
									@blur="overallScoreTooltipVisible = false"
								>
									<AppIcon name="info" :size="13" />
								</button>
							</template>
							<span class="preference-model-tooltip">{{ overallScoreNote }}</span>
						</WorkbenchTooltip>
					</small>
				</span>
				<span class="profile-metric--primary">
					<b>{{ formatSigned(preferenceSummary?.score) }}</b>
					<small class="profile-metric__label">
						<span class="profile-metric__label-text">相对偏好</span>
						<WorkbenchTooltip :show="preferenceTooltipVisible" trigger="manual" placement="top-end">
							<template #trigger>
								<button
									class="profile-metric__info"
									type="button"
									:aria-label="`相对偏好计算说明：${preferenceModelNote}`"
									@mouseenter="preferenceTooltipVisible = true"
									@mouseleave="preferenceTooltipVisible = false"
									@focus="preferenceTooltipVisible = true"
									@blur="preferenceTooltipVisible = false"
								>
									<AppIcon name="info" :size="13" />
								</button>
							</template>
							<span class="preference-model-tooltip">{{ preferenceModelNote }}</span>
						</WorkbenchTooltip>
					</small>
				</span>
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
			<RatingDistributionChart
				:subjects="workbench.focusedAllSubjects.value"
				:person-name="workbench.personName(person)"
				:is-global-query="workbench.query.isGlobal"
			/>
		</section>

		<section class="inspector-section" aria-labelledby="preference-title">
			<div class="section-heading">
				<h2 id="preference-title">我的偏好</h2>
			</div>
			<p v-if="preferenceSummary?.score === null || preferenceSummary?.score === undefined" class="preference-model-note">{{ workbench.query.isGlobal ? '相对偏好只在个人收藏模式计算。' : '该人物没有同时具备个人评分与有效全站评分的作品。' }}</p>
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

		<section class="inspector-section" aria-labelledby="person-credits-title">
			<SubjectWorkBrowser
				v-model:search="browserSearch"
				v-model:sort="browserSort"
				v-model:order="browserOrder"
				v-model:page="browserPage"
				v-model:page-size="browserPageSize"
				:title="browserTitle"
				title-id="person-credits-title"
				:subjects="browserSubjects"
				:empty-text="browserEmptyText"
				:sort-options="browserSortOptions"
				:search-placeholder="browserSearchPlaceholder"
				:search-aria-label="browserSearchAriaLabel"
				:sort-aria-label="browserSortAriaLabel"
				:order-aria-label="browserOrderAriaLabel"
				:search-name="browserSearchName"
				:item-count="browserItemCount"
				:page-sizes="browserPageSizes"
				:pagination-summary="browserRangeLabel"
				:pagination-aria-label="browserPaginationAriaLabel"
				:compact-aria-label="browserCompactAriaLabel"
				:compact-description="browserCompactDescription"
			>
				<template #heading>
					<h2 id="person-credits-title" :class="{ 'sr-only': isVoiceActorQuery }">{{ isVoiceActorQuery ? '参与作品与配音角色' : '参与作品' }}</h2>
					<div v-if="isVoiceActorQuery" class="person-credit-tabs">
						<n-radio-group
							size="small"
							:value="creditView"
							role="radiogroup"
							aria-label="浏览参与作品或配音角色"
							@update:value="updateCreditView"
						>
							<n-radio-button value="works">
								<span class="person-credit-tab__label">作品 <small class="person-credit-tab__count">{{ workbench.focusedAllSubjects.value.length }}</small></span>
							</n-radio-button>
							<n-radio-button value="characters">
								<span class="person-credit-tab__label">角色 <small class="person-credit-tab__count">{{ characterCredits.length }}</small></span>
							</n-radio-button>
						</n-radio-group>
					</div>
				</template>
				<template #list="{ compact, startIndex, ariaLabel }">
					<div id="person-credit-panel">
						<CharacterRoleList
							v-if="creditView === 'characters'"
							:credits="visibleCharacterCredits"
							:compact="compact"
							:empty-text="browserEmptyText"
							:aria-label="ariaLabel"
						/>
						<SubjectWorkList
							v-else
							:subjects="visibleWorks"
							:empty-text="browserEmptyText"
							:aria-label="ariaLabel"
							:compact="compact"
							:start-index="startIndex"
						>
							<template #role="{ subject }">
								<AdaptiveRoleList :entries="roleSummary(subject)" />
							</template>
						</SubjectWorkList>
					</div>
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
