<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'

const props = withDefaults(defineProps<{
	sources?: string[]
	alt: string
	kind?: 'person' | 'subject'
	loading?: 'eager' | 'lazy'
	width: number
	height: number
	decorative?: boolean
	priority?: boolean
	timeoutMs?: number
}>(), {
	sources: () => [],
	kind: 'subject',
	loading: 'lazy',
	decorative: false,
	priority: false,
	timeoutMs: 1600,
})

const sourceIndex = ref(0)
const loaded = ref(false)
let timeoutId: number | undefined
const availableSources = computed(() => [...new Set(props.sources.filter(Boolean))])
const sourceKey = computed(() => availableSources.value.join('|'))
const currentSource = computed(() => availableSources.value[sourceIndex.value] ?? '')
const failed = computed(() => !currentSource.value)

const clearImageTimeout = () => {
	if (timeoutId !== undefined) window.clearTimeout(timeoutId)
	timeoutId = undefined
}

const tryNextSource = () => {
	clearImageTimeout()
	loaded.value = false
	sourceIndex.value += 1
}

const markLoaded = () => {
	loaded.value = true
	clearImageTimeout()
}

watch([sourceKey, currentSource], ([key, source], [previousKey]) => {
	clearImageTimeout()
	if (previousKey !== undefined && key !== previousKey && sourceIndex.value > 0) {
		sourceIndex.value = 0
		return
	}
	loaded.value = false
	if (source) timeoutId = window.setTimeout(tryNextSource, props.timeoutMs)
}, { immediate: true })

onBeforeUnmount(clearImageTimeout)

const fallbackLabel = computed(() => props.alt
	? `${props.alt}的图片无法加载`
	: '图片无法加载')

const intrinsicStyle = computed(() => ({
	'--safe-image-width': `${props.width}px`,
	'--safe-image-height': `${props.height}px`,
}))
</script>

<template>
	<span class="safe-image" :class="[`safe-image--${kind}`, { 'is-fallback': failed }]" :style="intrinsicStyle">
		<img
			v-if="!failed"
			:key="currentSource"
			:src="currentSource"
			:alt="decorative ? '' : alt"
			:loading="loading"
			:width="width"
			:height="height"
			:fetchpriority="priority ? 'high' : undefined"
			decoding="async"
			referrerpolicy="no-referrer"
			@load="markLoaded"
			@error="tryNextSource"
		/>
		<span
			v-else
			class="safe-image__fallback"
			:role="decorative ? undefined : 'img'"
			:aria-hidden="decorative ? 'true' : undefined"
			:aria-label="decorative ? undefined : fallbackLabel"
		>
			<AppIcon :name="kind === 'person' ? 'person' : 'image'" :size="kind === 'person' ? 28 : 24" />
		</span>
	</span>
</template>
