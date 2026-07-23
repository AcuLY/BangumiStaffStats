<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ParticipationEntry } from '../domain/participationEntries'
import AdaptiveRoleList from './AdaptiveRoleList.vue'

const props = defineProps<{
	name: string
	entries: ParticipationEntry[]
	support?: string
}>()

const root = ref<HTMLElement | null>(null)
const isInline = ref(false)
let resizeObserver: ResizeObserver | null = null
let measureFrame = 0
const participantEntries = computed(() => props.entries.map((entry) => ({
	name: entry.label,
	tagOnly: true,
	count: entry.count,
})))

const measure = () => {
	const element = root.value
	if (!element) return
	if (props.support) {
		isInline.value = false
		return
	}
	const identity = element.querySelector<HTMLElement>('.shared-work-participant__identity')
	const entries = Array.from(element.querySelectorAll<HTMLElement>('[data-role-measure]'))
	if (!identity || !entries.length) {
		isInline.value = false
		return
	}

	const textWidth = (target?: HTMLElement | null) => {
		if (!target) return 0
		const range = document.createRange()
		range.selectNodeContents(target)
		return Math.ceil(range.getBoundingClientRect().width)
	}
	const roleWidth = Math.max(...entries.map((entry) => Math.ceil(entry.getBoundingClientRect().width)))
	const style = getComputedStyle(element)
	const gap = Number.parseFloat(style.columnGap) || 0
	const reserve = Number.parseFloat(style.getPropertyValue('--space-3')) || 12
	const fitsInline = textWidth(identity) + roleWidth + gap + reserve <= element.clientWidth
	if (isInline.value !== fitsInline) isInline.value = fitsInline
}

const scheduleMeasure = () => {
	cancelAnimationFrame(measureFrame)
	measureFrame = requestAnimationFrame(measure)
}

watch(() => [props.name, props.support, props.entries], async () => {
	await nextTick()
	scheduleMeasure()
}, { deep: true })

onMounted(() => {
	resizeObserver = new ResizeObserver(scheduleMeasure)
	if (root.value) resizeObserver.observe(root.value)
	scheduleMeasure()
})

onBeforeUnmount(() => {
	resizeObserver?.disconnect()
	cancelAnimationFrame(measureFrame)
})
</script>

<template>
	<span
		ref="root"
		class="shared-work-participant__body"
		:class="{
			'shared-work-participant__body--inline': isInline && !support,
			'shared-work-participant__body--series': Boolean(support),
		}"
	>
		<span class="shared-work-participant__identity">
			<strong class="shared-work-participant__name">{{ name }}</strong>
			<small v-if="support" class="shared-work-participant__support">{{ support }}</small>
		</span>
		<AdaptiveRoleList v-if="participantEntries.length" class="shared-work-participant__roles" :entries="participantEntries" mode="co-star" :max-visible-items="2" />
	</span>
</template>
