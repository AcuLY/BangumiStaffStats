<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { Subject } from '../types'
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
import {
	characterCreditKey,
	characterCreditName,
	characterRoleLabel,
	characterRoleLabelPriority,
} from '../domain/characterCredits'
import {
	localizedNameSearchTerms,
	localizedNameSearchValue,
	matchesLocalizedNameSearch,
} from '../domain/nameSearch'
import { overallScoreExplanation, preferenceExplanation } from '../domain/metricExplanations'
import { PROFILE_EXTRAS } from '../data/profileExtras'
import SafeImage from './SafeImage.vue'
import AppIcon from './AppIcon.vue'
import AdaptiveRoleList from './AdaptiveRoleList.vue'
import CharacterRoleList from './CharacterRoleList.vue'
import RatingDistributionChart from './RatingDistributionChart.vue'
import PreferenceWorkList from './PreferenceWorkList.vue'
import SubjectWorkBrowser from './SubjectWorkBrowser.vue'
import SubjectWorkList from './SubjectWorkList.vue'
import SubjectTagSummary from './SubjectTagSummary.vue'

const workbench = useWorkbench()
const seriesMode = computed(() => workbench.query.mergeSeries)
type WorkSort = 'score' | 'personal' | 'date' | 'seriesCount'
const workSortOptions = computed<SubjectWorkSortOption<WorkSort>[]>(() => [
	{ label: workbench.query.isGlobal ? '评分' : '全站评分', value: 'score' },
	...(workbench.query.isGlobal ? [] : [{ label: '我的评分', value: 'personal' as const }]),
	...(workbench.query.isGlobal ? [] : [{ label: '收藏日期', value: 'date' as const }]),
	...(seriesMode.value ? [{ label: '系列作品数量', value: 'seriesCount' as const }] : []),
])
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
	?? `${workbench.personName(person.value)}以“${rankingPositionLine.value}”身份参与了 ${person.value?.subjectCount ?? 0} ${seriesMode.value ? '个当前筛选范围内的系列' : '部当前筛选范围内的作品'}。`)
const profileSummaryIsLong = computed(() => profileSummary.value.length > 60)
const profileBioExpanded = ref(!profileSummaryIsLong.value)
const overallScoreTooltipVisible = ref(false)
const preferenceTooltipVisible = ref(false)
watch(() => person.value?.id, () => {
	profileBioExpanded.value = !profileSummaryIsLong.value
})
const ratedRates = computed(() => workbench.focusedAllSubjects.value
	.map((subject) => Number(subject.collection?.rate || 0))
	.filter((rate) => rate > 0))
const highestRate = computed(() => ratedRates.value.length ? Math.max(...ratedRates.value) : null)
const lowestRate = computed(() => ratedRates.value.length ? Math.min(...ratedRates.value) : null)
const overallScore = computed(() => person.value ? workbench.rankingValue(person.value, 'overall') : null)
const overallScoreNote = computed(() => overallScoreExplanation({
	isGlobal: workbench.query.isGlobal,
	seriesMode: seriesMode.value,
	average: workbench.query.isGlobal ? person.value?.globalAverage : person.value?.userAverage,
	validCount: workbench.query.isGlobal ? person.value?.globalRatedSubjectCount : person.value?.ratedSubjectCount,
	overall: overallScore.value,
}))

const subjectSearchTerms = (subject: Subject) => [
	...localizedNameSearchTerms(subject),
	...(subject.series?.members.flatMap((member) => localizedNameSearchTerms(member)) ?? []),
]

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
	searchTerms: subjectSearchTerms,
	initialSort: 'score',
	includeSubject: (subject, sort) => sort !== 'date' || Boolean(subject.collection?.updatedAt),
	comparators: {
		score: (a, b, direction) => compareSubjectNumber(a.score, b.score, direction),
		personal: (a, b, direction) => compareSubjectNumber(a.collection?.rate, b.collection?.rate, direction),
		date: (a, b, direction) => compareSubjectText(a.collection?.updatedAt, b.collection?.updatedAt, direction),
		seriesCount: (a, b, direction) => compareSubjectNumber(a.series?.members.length, b.series?.members.length, direction),
	},
})

type CreditView = 'works' | 'characters'
type CharacterSort = 'role' | 'works' | 'name'
const characterSortOptions: SubjectWorkSortOption<CharacterSort>[] = [
	{ label: '戏份类型', value: 'role' },
	{ label: '作品数', value: 'works' },
	{ label: '角色名', value: 'name' },
]
const CHARACTER_PAGE_SIZES = [5, 10, 20]
	.map((value) => ({ label: `每页 ${value} 个角色`, value }))
const creditView = ref<CreditView>('works')
const isVoiceActorQuery = computed(() => workbench.rankingPositionIds.value.includes(102))
const characterSearch = ref('')
const characterSort = ref<CharacterSort>('role')
const characterOrder = ref<SubjectWorkSortOrder>('desc')
const characterPage = ref(1)
const characterPageSize = ref(10)
const characterCredits = computed(() => workbench.focusedCharacterCredits.value)
const filteredCharacterCredits = computed(() => characterCredits.value
	.filter((credit) => matchesLocalizedNameSearch(credit, characterSearch.value)))
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
const browserTitle = computed(() => creditView.value === 'characters' ? '配音角色' : seriesMode.value ? '参与系列' : '参与作品')
const browserSubjects = computed(() => creditView.value === 'works' ? visibleWorks.value : [])
const browserEmptyText = computed(() => {
	if (browserSearch.value.trim()) {
		return creditView.value === 'characters'
			? SEARCH_EMPTY_COPY.character
			: seriesMode.value ? '没有符合搜索条件的系列' : SEARCH_EMPTY_COPY.work
	}
	return creditView.value === 'characters'
		? RESULT_EMPTY_COPY.character
		: seriesMode.value ? '没有符合当前条件的系列' : RESULT_EMPTY_COPY.work
})
const browserSortOptions = computed(() => creditView.value === 'characters' ? characterSortOptions : workSortOptions.value)
const browserSearchPlaceholder = computed(() => creditView.value === 'characters'
	? '搜索角色'
	: seriesMode.value ? '搜索系列或系列内作品' : '搜索作品')
const browserSearchAriaLabel = computed(() => creditView.value === 'characters' ? '搜索配音角色' : seriesMode.value ? '搜索参与系列或系列内作品' : '搜索参与作品')
const browserSortAriaLabel = computed(() => creditView.value === 'characters' ? '配音角色排序' : seriesMode.value ? '参与系列排序' : '参与作品排序')
const browserOrderAriaLabel = computed(() => creditView.value === 'characters' ? '配音角色排序方向' : seriesMode.value ? '参与系列排序方向' : '参与作品排序方向')
const browserSearchName = computed(() => creditView.value === 'characters' ? 'characterSearch' : 'workSearch')
const browserItemCount = computed(() => creditView.value === 'characters' ? sortedCharacterCredits.value.length : sortedWorks.value.length)
const browserPageSizes = computed(() => creditView.value === 'characters'
	? CHARACTER_PAGE_SIZES
	: seriesMode.value
		? SUBJECT_WORK_PAGE_SIZES.map((option) => ({ ...option, label: `每页 ${option.value} 个系列` }))
		: SUBJECT_WORK_PAGE_SIZES)
const browserRangeLabel = computed(() => creditView.value === 'characters' ? characterRangeLabel.value : workRangeLabel.value)
const browserPaginationAriaLabel = computed(() => creditView.value === 'characters' ? '配音角色分页' : seriesMode.value ? '参与系列分页' : '参与作品分页')
const browserCompactAriaLabel = computed(() => creditView.value === 'characters' ? '角色缩略模式' : seriesMode.value ? '系列缩略模式' : '作品缩略模式')
const browserCompactDescription = computed(() => creditView.value === 'characters'
	? '仅显示角色的缩小头像和双语名'
	: seriesMode.value ? '仅显示代表条目的序号、双语名和系列均分' : '仅显示序号、双语名和评分')
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
const preferenceModelNote = computed(() => preferenceExplanation({
	seriesMode: seriesMode.value,
	summary: preferenceSummary.value,
}))

watch([() => workbench.query.isGlobal, seriesMode], ([isGlobal, isSeries]) => {
	if ((isGlobal && (workSort.value === 'personal' || workSort.value === 'date'))
		|| (!isSeries && workSort.value === 'seriesCount')) workSort.value = 'score'
})

const focusWork = async (subject: Subject) => {
	creditView.value = 'works'
	workbench.focusedWorkSearch.value = localizedNameSearchValue(subject)
	workPage.value = 1
	await nextTick()
	document.querySelector<HTMLInputElement>(`input[aria-label="${browserSearchAriaLabel.value}"]`)?.focus()
}

const roleSummary = (subject: Subject) => {
	if (!person.value || !isVoiceActorQuery.value) return []
	const voiceSubjectIds = new Set(workbench.positionSubjectIds(person.value, 102).map(Number))
	const includedSubjectIds = subject.series?.includedSubjectIds ?? [Number(subject.id)]
	const entriesByCharacter = new Map<string, { name: string; label: string; key: string }>()
	for (const role of includedSubjectIds
		.filter((subjectId) => voiceSubjectIds.has(Number(subjectId)))
		.flatMap((subjectId) => workbench.personSubjectRoles(person.value!, subjectId, 102))) {
		const key = characterCreditKey(role)
		const entry = {
			name: role.displayName || role.nameCN || role.name || '角色',
			label: characterRoleLabel(role),
			key,
		}
		const existing = entriesByCharacter.get(key)
		if (!existing || characterRoleLabelPriority(entry.label) > characterRoleLabelPriority(existing.label)) {
			entriesByCharacter.set(key, entry)
		}
	}
	return [...entriesByCharacter.values()]
}
const hasRoleSummary = (subject: Subject) => roleSummary(subject).length > 0
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
			<div class="profile-metrics profile-metrics--extended metric-grid" :class="{ 'profile-metrics--global': workbench.query.isGlobal }" aria-label="人物统计">
				<span class="metric-unit"><small class="metric-unit__label">{{ seriesMode ? '参与系列' : '参与作品' }}</small><b class="metric-unit__value">{{ person.subjectCount ?? person.subjectIds?.length ?? 0 }}</b></span>
				<span v-if="!workbench.query.isGlobal" class="metric-unit"><small class="metric-unit__label">{{ seriesMode ? '已评系列' : '已评分' }}</small><b class="metric-unit__value">{{ person.ratedSubjectCount ?? '—' }}</b></span>
				<span class="metric-unit"><small class="metric-unit__label">{{ workbench.query.isGlobal ? '均分' : '全站均分' }}</small><b class="metric-unit__value">{{ formatScore(person.globalAverage) }}</b></span>
				<span v-if="!workbench.query.isGlobal" class="profile-metric--primary metric-unit"><small class="metric-unit__label">我的均分</small><b class="metric-unit__value">{{ formatScore(person.userAverage) }}</b></span>
				<span class="profile-metric--primary metric-unit">
					<small class="profile-metric__label metric-unit__label">
						<span class="profile-metric__label-text">综合分</span>
						<n-tooltip
							:show="overallScoreTooltipVisible"
							trigger="manual"
							placement="top-end"
							:animated="false"
							style="max-width: min(336px, calc(100dvw - 72px));"
							content-class="workbench-tooltip-content"
						>
							<template #trigger>
								<button
									class="profile-metric__info"
									type="button"
									:aria-expanded="overallScoreTooltipVisible"
									:aria-label="`综合分计算说明：${overallScoreNote}`"
									@mouseenter="overallScoreTooltipVisible = true"
									@mouseleave="overallScoreTooltipVisible = false"
									@focus="overallScoreTooltipVisible = true"
									@blur="overallScoreTooltipVisible = false"
									@click.stop="overallScoreTooltipVisible = true"
									@keydown.esc.stop.prevent="overallScoreTooltipVisible = false"
								>
									<AppIcon name="info" :size="16" />
								</button>
							</template>
							<span class="preference-model-tooltip">{{ overallScoreNote }}</span>
						</n-tooltip>
					</small>
					<b class="metric-unit__value">{{ formatScore(overallScore) }}</b>
				</span>
				<span v-if="!workbench.query.isGlobal" class="profile-metric--primary metric-unit">
					<small class="profile-metric__label metric-unit__label">
						<span class="profile-metric__label-text">相对偏好</span>
						<n-tooltip
							:show="preferenceTooltipVisible"
							trigger="manual"
							placement="top-end"
							:animated="false"
							style="max-width: min(336px, calc(100dvw - 72px));"
							content-class="workbench-tooltip-content"
						>
							<template #trigger>
								<button
									class="profile-metric__info"
									type="button"
									:aria-expanded="preferenceTooltipVisible"
									:aria-label="`相对偏好计算说明：${preferenceModelNote}`"
									@mouseenter="preferenceTooltipVisible = true"
									@mouseleave="preferenceTooltipVisible = false"
									@focus="preferenceTooltipVisible = true"
									@blur="preferenceTooltipVisible = false"
									@click.stop="preferenceTooltipVisible = true"
									@keydown.esc.stop.prevent="preferenceTooltipVisible = false"
								>
									<AppIcon name="info" :size="16" />
								</button>
							</template>
							<span class="preference-model-tooltip">{{ preferenceModelNote }}</span>
						</n-tooltip>
					</small>
					<b class="metric-unit__value">{{ formatSigned(preferenceSummary?.score) }}</b>
				</span>
				<span v-if="!workbench.query.isGlobal" class="metric-unit"><small class="metric-unit__label">{{ seriesMode ? '最高均分' : '最高评分' }}</small><b class="metric-unit__value">{{ formatScore(highestRate, seriesMode ? 2 : 0) }}</b></span>
				<span v-if="!workbench.query.isGlobal" class="metric-unit"><small class="metric-unit__label">{{ seriesMode ? '最低均分' : '最低评分' }}</small><b class="metric-unit__value">{{ formatScore(lowestRate, seriesMode ? 2 : 0) }}</b></span>
			</div>
		</header>

		<section class="inspector-section" aria-labelledby="person-tags-title">
			<SubjectTagSummary
				:subjects="workbench.focusedAllSubjects.value"
				:show-personal="!workbench.query.isGlobal"
				:title="seriesMode ? '代表条目标签' : '作品标签'"
				heading-id="person-tags-title"
			/>
		</section>

		<section class="inspector-section" aria-labelledby="rating-distribution-title">
			<RatingDistributionChart
				:subjects="workbench.focusedAllSubjects.value"
				:person-name="workbench.personName(person)"
				:is-global-query="workbench.query.isGlobal"
				:series-mode="seriesMode"
			/>
		</section>

		<section v-if="!workbench.query.isGlobal" class="inspector-section" aria-labelledby="preference-title">
			<div class="section-heading">
				<h2 id="preference-title">相对偏好</h2>
			</div>
			<p v-if="preferenceSummary?.score === null || preferenceSummary?.score === undefined" class="preference-model-note">没有同时具备我的评分与有效全站评分的{{ seriesMode ? '系列' : '作品' }}</p>
			<PreferenceWorkList
				:preferred="morePreferred"
				:conservative="moreConservative"
				:location-scope="seriesMode ? '参与系列' : '参与作品'"
				:series-mode="seriesMode"
				@select="focusWork"
			/>
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
				:detailed-description="seriesMode && creditView === 'works' ? '显示完整系列信息' : '显示完整作品信息'"
				:compact-description="browserCompactDescription"
			>
				<template #heading="{ controlSize }">
					<h2 id="person-credits-title" :class="{ 'sr-only': isVoiceActorQuery }">{{ isVoiceActorQuery ? seriesMode ? '参与系列与配音角色' : '参与作品与配音角色' : seriesMode ? '参与系列' : '参与作品' }}</h2>
					<div v-if="isVoiceActorQuery" class="person-credit-tabs">
						<n-radio-group
							:size="controlSize"
							:value="creditView"
							role="radiogroup"
							:aria-label="seriesMode ? '浏览参与系列或配音角色' : '浏览参与作品或配音角色'"
							@update:value="updateCreditView"
						>
							<n-radio-button value="works">
								<span class="person-credit-tab__label">{{ seriesMode ? '系列' : '作品' }} <small class="person-credit-tab__count">{{ workbench.focusedAllSubjects.value.length }}</small></span>
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
							role-label="配音角色"
							:show-role="hasRoleSummary"
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
		<h2>{{ workbench.rankingSearch.value.trim() ? SEARCH_EMPTY_COPY.person : RESULT_EMPTY_COPY.person }}</h2>
	</div>
</template>
