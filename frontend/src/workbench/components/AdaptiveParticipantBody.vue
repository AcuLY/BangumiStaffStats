<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AdaptiveRoleList from './AdaptiveRoleList.vue'

const props = defineProps<{
	name: string
	entries: Array<{
		displayName: string
		roleLabel: string
		kind: 'character' | 'position'
	}>
}>()

const root = ref<HTMLElement | null>(null)
const isInline = ref(false)
let resizeObserver: ResizeObserver | null = null
let measureFrame = 0
const roleEntries = computed(() => props.entries.map((entry) => ({
	name: entry.displayName,
	label: entry.roleLabel,
})))

const measure = () => {
	const element = root.value
	if (!element) return
	const name = element.querySelector<HTMLElement>('.shared-work-participant__name')
	const entries = Array.from(element.querySelectorAll<HTMLElement>('.adaptive-role-list__item'))
	if (!name || !entries.length) {
		isInline.value = false
		return
	}

	const textWidth = (target?: HTMLElement | null) => {
		if (!target) return 0
		const range = document.createRange()
		range.selectNodeContents(target)
		return Math.ceil(range.getBoundingClientRect().width)
	}
	const roleWidth = Math.max(...entries.map((entry) => {
		const displayName = entry.querySelector<HTMLElement>('strong')
		const label = entry.querySelector<HTMLElement>('small')
		const copy = entry.querySelector<HTMLElement>('.adaptive-role-list__copy')
		const gap = label && copy ? Number.parseFloat(getComputedStyle(copy).columnGap) || 0 : 0
		return textWidth(displayName) + textWidth(label) + gap
	}))
	const style = getComputedStyle(element)
	const gap = Number.parseFloat(style.columnGap) || 0
	const reserve = Number.parseFloat(style.getPropertyValue('--space-3')) || 12
	const fitsInline = textWidth(name) + roleWidth + gap + reserve <= element.clientWidth
	if (isInline.value !== fitsInline) isInline.value = fitsInline
}

const scheduleMeasure = () => {
	cancelAnimationFrame(measureFrame)
	measureFrame = requestAnimationFrame(measure)
}

watch(() => [props.name, props.entries], async () => {
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
	<span ref="root" class="shared-work-participant__body" :class="{ 'shared-work-participant__body--inline': isInline }">
		<strong class="shared-work-participant__name">{{ name }}</strong>
		<AdaptiveRoleList class="shared-work-participant__roles" :entries="roleEntries" />
	</span>
</template>
