<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'

const CONTENT_IMAGE_ASPECT_WIDTH = 3
const CONTENT_IMAGE_ASPECT_HEIGHT = 4

const props = withDefaults(defineProps<{
	sources?: string[]
	alt: string
	kind?: 'person' | 'subject' | 'character'
	loading?: 'eager' | 'lazy'
	width: number
	decorative?: boolean
	priority?: boolean
	timeoutMs?: number
}>(), {
	sources: () => [],
	kind: 'subject',
	loading: 'lazy',
	decorative: false,
	priority: false,
	timeoutMs: 10000,
})

const sourceIndex = ref(0)
const loaded = ref(false)
const containerRef = ref<HTMLElement | null>(null)
const isNearViewport = ref(false)
let timeoutId: number | undefined
let intersectionObserver: IntersectionObserver | undefined
const availableSources = computed(() => [...new Set(props.sources.filter(Boolean))])
const sourceKey = computed(() => availableSources.value.join('|'))
const currentSource = computed(() => availableSources.value[sourceIndex.value] ?? '')
const failed = computed(() => !currentSource.value)

const clearImageTimeout = () => {
	if (timeoutId !== undefined) window.clearTimeout(timeoutId)
	timeoutId = undefined
}

const scheduleImageTimeout = () => {
	clearImageTimeout()
	if (!currentSource.value || loaded.value) return
	if (props.loading === 'lazy' && !isNearViewport.value) return
	timeoutId = window.setTimeout(tryNextSource, props.timeoutMs)
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

watch([sourceKey, currentSource], ([key, source], [previousKey, previousSource]) => {
	if (previousKey !== undefined && key !== previousKey && sourceIndex.value > 0) {
		clearImageTimeout()
		sourceIndex.value = 0
		return
	}
	if (previousSource !== undefined && source === previousSource) return
	clearImageTimeout()
	loaded.value = false
	if (source) scheduleImageTimeout()
}, { immediate: true })

watch(isNearViewport, (isVisible) => {
	if (isVisible) scheduleImageTimeout()
})

onMounted(() => {
	if (props.loading === 'eager' || typeof IntersectionObserver === 'undefined') {
		isNearViewport.value = true
		return
	}

	intersectionObserver = new IntersectionObserver((entries) => {
		if (!entries.some((entry) => entry.isIntersecting)) return
		isNearViewport.value = true
		intersectionObserver?.disconnect()
		intersectionObserver = undefined
	}, { rootMargin: '0px' })

	if (containerRef.value) intersectionObserver.observe(containerRef.value)
})

onBeforeUnmount(() => {
	clearImageTimeout()
	intersectionObserver?.disconnect()
})

const fallbackLabel = computed(() => props.alt
	? `${props.alt}的图片无法加载`
	: '图片无法加载')

const intrinsicStyle = computed(() => ({
	'--safe-image-width': `${props.width}px`,
}))
const intrinsicWidth = computed(() => props.width * CONTENT_IMAGE_ASPECT_WIDTH)
const intrinsicHeight = computed(() => props.width * CONTENT_IMAGE_ASPECT_HEIGHT)
const portraitKind = computed(() => props.kind === 'person' || props.kind === 'character')
</script>

<template>
	<span ref="containerRef" class="safe-image" :class="[`safe-image--${kind}`, { 'is-fallback': failed }]" :style="intrinsicStyle">
		<span v-if="!failed && !loaded" class="safe-image__fallback safe-image__fallback--loading" aria-hidden="true">
			<AppIcon :name="portraitKind ? 'person' : 'image'" :size="portraitKind ? 28 : 24" />
		</span>
		<img
			v-if="!failed"
			:key="currentSource"
			:src="currentSource"
			:alt="decorative ? '' : alt"
			:loading="loading"
			:width="intrinsicWidth"
			:height="intrinsicHeight"
			:fetchpriority="priority ? 'high' : undefined"
			decoding="async"
			referrerpolicy="no-referrer"
			:class="{ 'is-loaded': loaded }"
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
			<AppIcon :name="portraitKind ? 'person' : 'image'" :size="portraitKind ? 28 : 24" />
		</span>
	</span>
</template>
