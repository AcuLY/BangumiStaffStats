<script setup lang="ts">
import type { Subject } from '../types'
import { useWorkbench } from '../composables/useWorkbench'
import SafeImage from './SafeImage.vue'

withDefaults(defineProps<{
	subjects: Subject[]
	emptyText?: string
}>(), {
	emptyText: '没有符合当前条件的作品。',
})

defineSlots<{
	role(props: { subject: Subject }): unknown
	participants(props: { subject: Subject }): unknown
}>()

const workbench = useWorkbench()
const integerFormatter = new Intl.NumberFormat('zh-CN')
const scoreFormatter = new Intl.NumberFormat('zh-CN', {
	minimumFractionDigits: 2,
	maximumFractionDigits: 2,
})
const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
	timeZone: 'UTC',
})

const subjectSecondaryName = (subject: Subject) => {
	const primary = workbench.subjectName(subject)
	return [subject.name, subject.nameCN].find((name) => name && name !== primary) ?? ''
}
const formatScore = (value?: number | null) => Number(value) > 0
	? scoreFormatter.format(Number(value))
	: '—'
const formatInteger = (value?: number | null) => Number.isFinite(Number(value)) && value !== undefined && value !== null
	? integerFormatter.format(Number(value))
	: '—'
const formatDate = (value?: string) => {
	if (!value) return '—'
	const date = new Date(`${value}T00:00:00Z`)
	return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date)
}
const collectionLabel = (type?: number) => ({
	1: '想看',
	2: '看过',
	3: '在看',
	4: '搁置',
	5: '抛弃',
})[Number(type)] ?? '收藏'
</script>

<template>
	<ul class="subject-work-list person-work-list" aria-label="作品列表">
		<li v-for="subject in subjects" :key="subject.id" class="subject-work-row person-work-row">
			<div class="subject-work-row__work person-work-row__work work-cell">
				<a
					class="subject-work-row__cover-link"
					:href="`https://bgm.tv/subject/${subject.id}`"
					target="_blank"
					rel="noopener noreferrer"
					:aria-label="`打开${workbench.subjectName(subject)}`"
				>
					<SafeImage
						class="subject-work-row__cover"
						:sources="workbench.subjectImageSources(subject)"
						:alt="`${workbench.subjectName(subject)}封面`"
						kind="subject"
						:width="48"
						:height="64"
					/>
				</a>
				<div class="subject-work-row__copy work-cell__copy">
					<a :href="`https://bgm.tv/subject/${subject.id}`" target="_blank" rel="noopener noreferrer">
						<strong>{{ workbench.subjectName(subject) }}</strong>
					</a>
					<div v-if="$slots.role" class="subject-work-row__role work-cell__roles">
						<slot name="role" :subject="subject" />
					</div>
					<small v-if="subjectSecondaryName(subject)" class="subject-work-row__secondary">{{ subjectSecondaryName(subject) }}</small>
				</div>
			</div>

			<dl class="subject-work-row__facts person-work-row__facts">
				<div>
					<dt>日期</dt>
					<dd><time :datetime="subject.date || undefined">{{ formatDate(subject.date) }}</time></dd>
				</div>
				<div>
					<dt translate="no">Bangumi</dt>
					<dd><strong>{{ formatScore(subject.score) }}</strong><small><span translate="no">Rank</span> {{ subject.rank ? integerFormatter.format(subject.rank) : '—' }}</small></dd>
				</div>
				<div>
					<dt>收藏</dt>
					<dd><strong>{{ formatInteger(subject.favoriteCount) }}</strong><small>{{ collectionLabel(subject.collection?.type) }}</small></dd>
				</div>
				<div>
					<dt>我的评分</dt>
					<dd><b>{{ formatScore(subject.collection?.rate) }}</b></dd>
				</div>
			</dl>

			<div v-if="$slots.participants" class="subject-work-row__participants">
				<slot name="participants" :subject="subject" />
			</div>
		</li>
		<li v-if="!subjects.length" class="subject-work-list__empty person-work-list__empty">{{ emptyText }}</li>
	</ul>
</template>
