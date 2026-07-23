<script setup lang="ts">
import { ref } from 'vue'
import type { SeriesMember, Subject } from '../types'
import { useWorkbench } from '../composables/useWorkbench'
import { RESULT_EMPTY_COPY } from '../searchEmptyCopy'
import AppIcon from './AppIcon.vue'
import SafeImage from './SafeImage.vue'

const props = withDefaults(defineProps<{
	subjects: Subject[]
	emptyText?: string
	ariaLabel?: string
	compact?: boolean
	startIndex?: number
	roleLabel?: string
	showRole?: (subject: Subject) => boolean
}>(), {
	emptyText: RESULT_EMPTY_COPY.work,
	ariaLabel: '作品列表',
	compact: false,
	startIndex: 0,
	roleLabel: '参与身份',
})

defineSlots<{
	role(props: { subject: Subject }): unknown
	participants(props: { subject: Subject }): unknown
}>()

const workbench = useWorkbench()
const scoreFormatter = new Intl.NumberFormat('zh-CN', {
	minimumFractionDigits: 2,
	maximumFractionDigits: 2,
})
const personalScoreFormatter = new Intl.NumberFormat('zh-CN', {
	maximumFractionDigits: 0,
})
const ratingCountFormatter = new Intl.NumberFormat('zh-CN')
const MAX_SUBJECT_META_TAGS = 5

const subjectSecondaryName = (subject: Subject) => {
	const primary = workbench.subjectName(subject)
	return [subject.name, subject.nameCN].find((name) => name && name !== primary) ?? ''
}
const subjectMetaTags = (subject: Subject) => (subject.metaTags ?? [])
	.map((tag) => typeof tag === 'string' ? tag : tag.name)
	.filter((tag): tag is string => Boolean(tag))
	.slice(0, MAX_SUBJECT_META_TAGS)
const formatScore = (value?: number | null) => Number(value) > 0
	? scoreFormatter.format(Number(value))
	: '—'
const formatPersonalScore = (value?: number | null) => Number(value) > 0
	? personalScoreFormatter.format(Number(value))
	: '—'
const hasRatingCount = (value?: number | null) => Number.isFinite(Number(value)) && Number(value) > 0
const formatRatingCount = (value?: number | null) => hasRatingCount(value)
	? ratingCountFormatter.format(Number(value))
	: ''
const scoreDifference = (subject: Subject) => {
	const personal = Number(subject.collection?.rate)
	const global = Number(subject.score)
	if (personal <= 0 || global <= 0) return null
	const roundedDifference = Math.round((personal - global) * 100) / 100
	return Object.is(roundedDifference, -0) ? 0 : roundedDifference
}
const hasVisibleDifference = (subject: Subject) => {
	const difference = scoreDifference(subject)
	return difference !== null && difference !== 0
}
const formatDifference = (subject: Subject) => {
	const difference = scoreDifference(subject)
	if (difference === null || difference === 0) return ''
	return `${difference > 0 ? '+' : ''}${scoreFormatter.format(difference)}`
}
const formatCollectionDate = (value?: string) => {
	const dateParts = value?.match(/^(\d{4})-(\d{2})-(\d{2})/)
	return dateParts ? `${dateParts[1]}/${dateParts[2]}/${dateParts[3]}` : ''
}
const collectionLabel = (type?: number) => ({
	1: '想看',
	2: '看过',
	3: '在看',
	4: '搁置',
	5: '抛弃',
})[Number(type)] ?? '未收藏'
const currentScoreLabel = (subject: Subject) => subject.series ? '均分' : '评分'
const currentScore = (subject: Subject) => workbench.query.isGlobal
	? Number(subject.score || 0)
	: Number(subject.collection?.rate || 0)
const formatCurrentScore = (subject: Subject) => workbench.query.isGlobal
	? formatScore(subject.score)
	: subject.series ? formatScore(subject.collection?.rate) : formatPersonalScore(subject.collection?.rate)
const seriesMembers = (subject: Subject) => subject.series?.members ?? []
const hasSeriesMembers = (subject: Subject) => seriesMembers(subject).length > 0
const seriesSummary = (subject: Subject) => {
	if (!subject.series) return ''
	const memberCount = subject.series.members.length
	const sharedCount = subject.series.sharedSubjectIds?.length
	return sharedCount === undefined
		? `参与 ${subject.series.includedSubjectIds.length} 部 · 系列 ${memberCount} 部`
		: `共同参与 ${sharedCount} 部 · 系列 ${memberCount} 部`
}
const seriesMemberName = (member: SeriesMember) =>
	member.displayName || member.nameCN || member.name || `条目 ${member.id}`
const seriesMemberOriginalName = (member: SeriesMember) => String(member.name ?? '').trim()
const seriesMemberTitle = (member: SeriesMember) => [
	seriesMemberName(member),
	seriesMemberOriginalName(member),
].filter(Boolean).join(' · ')
const visibleSeriesInfoSubjectId = ref<number | null>(null)
const showSeriesInfoTooltip = (subjectId: number) => {
	visibleSeriesInfoSubjectId.value = subjectId
}
const hideSeriesInfoTooltip = (subjectId: number) => {
	if (visibleSeriesInfoSubjectId.value === subjectId) visibleSeriesInfoSubjectId.value = null
}
const visibleSeriesMemberTooltip = ref<string | null>(null)
const seriesMemberTooltipKey = (subjectId: number, memberId: number) => `${subjectId}:${memberId}`
const seriesMemberTextElements = (target: EventTarget | null) => {
	if (!(target instanceof HTMLElement)) return []
	return Array.from(target.querySelectorAll<HTMLElement>(
		'.subject-work-row__series-member-name, .subject-work-row__series-member-original',
	))
}
const showSeriesMemberTooltip = (key: string, event: Event) => {
	visibleSeriesMemberTooltip.value = seriesMemberTextElements(event.currentTarget)
		.some((element) => element.scrollWidth > element.clientWidth)
		? key
		: null
}
const hideSeriesMemberTooltip = (key: string) => {
	if (visibleSeriesMemberTooltip.value === key) visibleSeriesMemberTooltip.value = null
}
const seriesMemberImageSources = (member: SeriesMember) =>
	workbench.subjectImageSources(member)
const roleVisible = (subject: Subject, hasRoleSlot: boolean) => hasRoleSlot
	&& (props.showRole?.(subject) ?? true)
</script>

<template>
	<ul class="subject-work-list person-work-list" :class="{ 'subject-work-list--compact': compact }" :aria-label="ariaLabel">
		<li
			v-for="(subject, index) in subjects"
			:key="subject.id"
			class="subject-work-row person-work-row"
			:class="{
				'subject-work-row--compact': compact,
				'subject-work-row--with-participants': !compact && Boolean($slots.participants),
				'subject-work-row--with-role': !compact && roleVisible(subject, Boolean($slots.role)),
				'subject-work-row--with-series-members': !compact && hasSeriesMembers(subject),
			}"
		>
			<template v-if="compact">
				<span class="subject-work-row__index" :aria-label="`第 ${props.startIndex + index + 1} 项`">{{ props.startIndex + index + 1 }}</span>
				<div class="subject-work-row__compact-names">
					<a
						class="subject-work-row__primary-link"
						:href="`https://bgm.tv/subject/${subject.id}`"
						target="_blank"
						rel="noopener noreferrer"
						:title="workbench.subjectName(subject)"
						:aria-label="`打开${workbench.subjectName(subject)}`"
					>
						<strong>{{ workbench.subjectName(subject) }}</strong>
					</a>
					<small v-if="subjectSecondaryName(subject)" class="subject-work-row__secondary" :title="subjectSecondaryName(subject)">{{ subjectSecondaryName(subject) }}</small>
				</div>
				<dl class="subject-work-row__compact-score" :aria-label="currentScore(subject) > 0 ? `${currentScoreLabel(subject)} ${formatCurrentScore(subject)}` : `${currentScoreLabel(subject)} 未评分`">
					<dt class="sr-only">{{ currentScoreLabel(subject) }}</dt>
					<dd aria-hidden="true">
						<span v-if="currentScore(subject) > 0">{{ formatCurrentScore(subject) }}</span>
						<Star :unrated="currentScore(subject) <= 0" />
					</dd>
				</dl>
			</template>

			<div v-else class="subject-work-row__work person-work-row__work work-cell">
				<span class="subject-work-row__cover-media" aria-hidden="true">
					<SafeImage
						class="subject-work-row__cover"
						:sources="workbench.subjectImageSources(subject)"
						alt=""
						kind="subject"
						:width="64"
						decorative
					/>
				</span>
				<div class="subject-work-row__copy work-cell__copy">
					<div class="subject-work-row__heading">
						<a
							class="subject-work-row__primary-link"
							:href="`https://bgm.tv/subject/${subject.id}`"
							target="_blank"
							rel="noopener noreferrer"
							:title="workbench.subjectName(subject)"
							:aria-label="`打开${workbench.subjectName(subject)}`"
						>
							<strong>{{ workbench.subjectName(subject) }}</strong>
						</a>
						<span v-if="!workbench.query.isGlobal && !subject.series" class="subject-work-row__collection-meta">
							<span class="subject-work-row__collection" :aria-label="`收藏状态：${collectionLabel(subject.collection?.type)}`">{{ collectionLabel(subject.collection?.type) }}</span>
							<time
								v-if="formatCollectionDate(subject.collection?.updatedAt)"
								class="subject-work-row__collection-time"
								:datetime="subject.collection?.updatedAt"
								:title="`收藏于 ${formatCollectionDate(subject.collection?.updatedAt)}`"
							>{{ formatCollectionDate(subject.collection?.updatedAt) }}</time>
						</span>
					</div>
					<small v-if="subjectSecondaryName(subject)" class="subject-work-row__secondary" :title="subjectSecondaryName(subject)">{{ subjectSecondaryName(subject) }}</small>
					<small v-if="seriesSummary(subject)" class="subject-work-row__series-summary">
						<span>{{ seriesSummary(subject) }}</span>
						<n-tooltip
							v-if="subject.series && $slots.participants"
							:show="visibleSeriesInfoSubjectId === subject.id"
							placement="top-end"
							trigger="manual"
							:animated="false"
							style="max-width: min(336px, calc(100dvw - 72px));"
							content-class="workbench-tooltip-content"
						>
							<template #trigger>
								<button
									class="profile-metric__info subject-work-row__series-info"
									type="button"
									aria-label="系列参与身份数量说明：参与身份标签末尾的数字表示该人物以此身份参与的系列内作品数"
									:aria-expanded="visibleSeriesInfoSubjectId === subject.id"
									@mouseenter="showSeriesInfoTooltip(subject.id)"
									@mouseleave="hideSeriesInfoTooltip(subject.id)"
									@focus="showSeriesInfoTooltip(subject.id)"
									@blur="hideSeriesInfoTooltip(subject.id)"
									@click.stop="showSeriesInfoTooltip(subject.id)"
									@keydown.esc.stop.prevent="hideSeriesInfoTooltip(subject.id)"
								>
									<AppIcon name="info" :size="16" />
								</button>
							</template>
							<span>参与身份标签末尾的数字表示该人物以此身份参与的系列内作品数</span>
						</n-tooltip>
					</small>
					<ul v-if="subjectMetaTags(subject).length" class="subject-work-row__meta" aria-label="条目属性">
						<li v-for="tag in subjectMetaTags(subject)" :key="tag">{{ tag }}</li>
					</ul>
				</div>
			</div>

			<dl v-if="!compact" class="subject-work-row__facts person-work-row__facts" :class="{ 'subject-work-row__facts--with-role': roleVisible(subject, Boolean($slots.role)), 'subject-work-row__facts--global': workbench.query.isGlobal }">
				<div class="subject-work-row__score subject-work-row__score--global">
					<dt>{{ workbench.query.isGlobal ? subject.series ? '均分' : '评分' : subject.series ? '全站均分' : '全站评分' }}</dt>
					<dd>
						<strong>{{ formatScore(subject.score) }}</strong>
						<small v-if="hasRatingCount(subject.ratingCount)" class="subject-work-row__rating-count">{{ formatRatingCount(subject.ratingCount) }} 人</small>
					</dd>
				</div>
				<div v-if="!workbench.query.isGlobal" class="subject-work-row__score subject-work-row__score--mine">
					<dt>{{ subject.series ? '我的均分' : '我的评分' }}</dt>
					<dd>
						<b>{{ subject.series ? formatScore(subject.collection?.rate) : formatPersonalScore(subject.collection?.rate) }}</b>
						<span
							v-if="hasVisibleDifference(subject)"
							class="subject-work-row__difference"
							:class="{ 'is-positive': Number(scoreDifference(subject)) > 0, 'is-negative': Number(scoreDifference(subject)) < 0 }"
							:aria-label="`评分差 ${formatDifference(subject)}`"
						>{{ formatDifference(subject) }}</span>
					</dd>
				</div>
				<div v-if="roleVisible(subject, Boolean($slots.role))" class="subject-work-row__role-fact">
					<dt>{{ roleLabel }}</dt>
					<dd><slot name="role" :subject="subject" /></dd>
				</div>
			</dl>

			<div v-if="!compact && $slots.participants" class="subject-work-row__participants">
				<slot name="participants" :subject="subject" />
			</div>

			<section
				v-if="!compact && hasSeriesMembers(subject)"
				class="subject-work-row__series-members"
				:aria-label="`${workbench.subjectName(subject)}的系列作品，共 ${seriesMembers(subject).length} 部`"
			>
				<strong class="subject-work-row__series-members-title">系列作品（{{ seriesMembers(subject).length }}）</strong>
				<ul class="subject-work-row__series-member-list">
					<li v-for="member in seriesMembers(subject)" :key="member.id">
						<n-tooltip
							:show="visibleSeriesMemberTooltip === seriesMemberTooltipKey(subject.id, member.id)"
							trigger="manual"
							placement="top-start"
							:animated="false"
							style="max-width: min(336px, calc(100dvw - 72px));"
							content-class="workbench-tooltip-content"
						>
							<template #trigger>
								<a
									class="subject-work-row__series-member"
									:href="`https://bgm.tv/subject/${member.id}`"
									target="_blank"
									rel="noopener noreferrer"
									@mouseenter="showSeriesMemberTooltip(seriesMemberTooltipKey(subject.id, member.id), $event)"
									@mouseleave="hideSeriesMemberTooltip(seriesMemberTooltipKey(subject.id, member.id))"
									@focus="showSeriesMemberTooltip(seriesMemberTooltipKey(subject.id, member.id), $event)"
									@blur="hideSeriesMemberTooltip(seriesMemberTooltipKey(subject.id, member.id))"
								>
									<SafeImage
										class="subject-work-row__series-member-cover"
										:sources="seriesMemberImageSources(member)"
										alt=""
										kind="subject"
										:width="28"
										decorative
									/>
									<span class="subject-work-row__series-member-copy">
										<span class="subject-work-row__series-member-name">{{ seriesMemberName(member) }}</span>
										<small
											v-if="seriesMemberOriginalName(member)"
											class="subject-work-row__series-member-original"
										>{{ seriesMemberOriginalName(member) }}</small>
									</span>
								</a>
							</template>
							{{ seriesMemberTitle(member) }}
						</n-tooltip>
					</li>
				</ul>
			</section>
		</li>
		<li v-if="!subjects.length" class="subject-work-list__empty person-work-list__empty">{{ emptyText }}</li>
	</ul>
</template>
