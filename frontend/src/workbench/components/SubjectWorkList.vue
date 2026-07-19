<script setup lang="ts">
import type { Subject } from '../types'
import { useWorkbench } from '../composables/useWorkbench'
import SafeImage from './SafeImage.vue'

const props = withDefaults(defineProps<{
	subjects: Subject[]
	emptyText?: string
	ariaLabel?: string
	compact?: boolean
	startIndex?: number
}>(), {
	emptyText: '没有符合当前条件的作品。',
	ariaLabel: '作品列表',
	compact: false,
	startIndex: 0,
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
				'subject-work-row--with-role': !compact && Boolean($slots.role),
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
				<dl class="subject-work-row__compact-score" :aria-label="Number(subject.collection?.rate) > 0 ? `我的分数 ${formatPersonalScore(subject.collection?.rate)}` : '我的分数 未评分'">
					<dt class="sr-only">我的分数</dt>
					<dd aria-hidden="true">
						<span v-if="Number(subject.collection?.rate) > 0">{{ formatPersonalScore(subject.collection?.rate) }}</span>
						<Star :unrated="Number(subject.collection?.rate) <= 0" />
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
						<span class="subject-work-row__collection-meta">
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
					<ul v-if="subjectMetaTags(subject).length" class="subject-work-row__meta" aria-label="条目属性">
						<li v-for="tag in subjectMetaTags(subject)" :key="tag">{{ tag }}</li>
					</ul>
				</div>
			</div>

			<dl v-if="!compact" class="subject-work-row__facts person-work-row__facts" :class="{ 'subject-work-row__facts--with-role': Boolean($slots.role) }">
				<div class="subject-work-row__score subject-work-row__score--global">
					<dt>全站评分</dt>
					<dd>
						<strong>{{ formatScore(subject.score) }}</strong>
						<small v-if="hasRatingCount(subject.ratingCount)" class="subject-work-row__rating-count">{{ formatRatingCount(subject.ratingCount) }} 人</small>
					</dd>
				</div>
				<div class="subject-work-row__score subject-work-row__score--mine">
					<dt>我的评分</dt>
					<dd>
						<b>{{ formatPersonalScore(subject.collection?.rate) }}</b>
						<span
							v-if="hasVisibleDifference(subject)"
							class="subject-work-row__difference"
							:class="{ 'is-positive': Number(scoreDifference(subject)) > 0, 'is-negative': Number(scoreDifference(subject)) < 0 }"
							:aria-label="`评分差 ${formatDifference(subject)}`"
						>{{ formatDifference(subject) }}</span>
					</dd>
				</div>
				<div v-if="$slots.role" class="subject-work-row__role-fact">
					<dt>参与身份</dt>
					<dd><slot name="role" :subject="subject" /></dd>
				</div>
			</dl>

			<div v-if="!compact && $slots.participants" class="subject-work-row__participants">
				<slot name="participants" :subject="subject" />
			</div>
		</li>
		<li v-if="!subjects.length" class="subject-work-list__empty person-work-list__empty">{{ emptyText }}</li>
	</ul>
</template>
