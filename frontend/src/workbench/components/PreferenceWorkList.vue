<script setup lang="ts">
import type { PreferenceContribution } from '../domain/preference'
import type { Subject } from '../types'
import { useWorkbench } from '../composables/useWorkbench'
import SafeImage from './SafeImage.vue'

type PreferenceWorkItem = PreferenceContribution & { subject: Subject }

const props = withDefaults(defineProps<{
	preferred: PreferenceWorkItem[]
	conservative: PreferenceWorkItem[]
	locationScope?: string
	seriesMode?: boolean
}>(), {
	locationScope: '参与作品',
	seriesMode: false,
})

const emit = defineEmits<{
	select: [subject: Subject]
}>()

const workbench = useWorkbench()
const formatScore = (value: number | null | undefined) => Number.isFinite(value) ? Number(value).toFixed(2) : '—'
const formatPersonalScore = (value: number | null | undefined) => Number(value) > 0
	? props.seriesMode ? Number(value).toFixed(2) : String(Number(value))
	: '—'
const formatSigned = (value: number | null | undefined) => value === null || value === undefined || !Number.isFinite(value)
	? '—'
	: `${value > 0 ? '+' : ''}${Number(value).toFixed(2)}`
</script>

<template>
	<div class="preference-list">
		<div class="preference-columns">
			<div>
				<h3>我更偏爱</h3>
				<ul>
					<li v-for="item in preferred" :key="item.subject.id">
						<button class="preference-work preference-work--positive" type="button" :aria-label="`在${locationScope}中定位${workbench.subjectName(item.subject)}`" @click="emit('select', item.subject)">
							<SafeImage :sources="workbench.subjectImageSources(item.subject)" :alt="`${workbench.subjectName(item.subject)}封面`" kind="subject" :width="32" decorative />
							<span class="preference-work__copy">
								<strong>{{ workbench.subjectName(item.subject) }}</strong>
								<small>{{ seriesMode ? '我的均分' : '我的评分' }} {{ formatPersonalScore(item.userScore) }} · {{ seriesMode ? '全站均分' : '全站评分' }} {{ formatScore(item.globalScore) }}</small>
							</span>
							<b>{{ formatSigned(item.difference) }}</b>
						</button>
					</li>
					<li v-if="!preferred.length" class="muted-row">没有高于全站{{ seriesMode ? '均分的系列' : '评分的作品' }}</li>
				</ul>
			</div>
			<div>
				<h3>我更保守</h3>
				<ul>
					<li v-for="item in conservative" :key="item.subject.id">
						<button class="preference-work preference-work--negative" type="button" :aria-label="`在${locationScope}中定位${workbench.subjectName(item.subject)}`" @click="emit('select', item.subject)">
							<SafeImage :sources="workbench.subjectImageSources(item.subject)" :alt="`${workbench.subjectName(item.subject)}封面`" kind="subject" :width="32" decorative />
							<span class="preference-work__copy">
								<strong>{{ workbench.subjectName(item.subject) }}</strong>
								<small>{{ seriesMode ? '我的均分' : '我的评分' }} {{ formatPersonalScore(item.userScore) }} · {{ seriesMode ? '全站均分' : '全站评分' }} {{ formatScore(item.globalScore) }}</small>
							</span>
							<b>{{ formatSigned(item.difference) }}</b>
						</button>
					</li>
					<li v-if="!conservative.length" class="muted-row">没有低于全站{{ seriesMode ? '均分的系列' : '评分的作品' }}</li>
				</ul>
			</div>
		</div>
	</div>
</template>
