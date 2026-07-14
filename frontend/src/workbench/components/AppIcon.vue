<script setup lang="ts">
withDefaults(defineProps<{
	name: 'brand' | 'ranking' | 'people' | 'sun' | 'moon' | 'search' | 'chevron' | 'close' | 'plus' | 'check' | 'person' | 'image' | 'edit' | 'arrow' | 'info'
	size?: number
}>(), { size: 18 })
</script>

<template>
	<svg
		class="app-icon"
		:viewBox="name === 'brand' ? '0 0 24 24' : '0 0 24 24'"
		:width="size"
		:height="size"
		fill="none"
		aria-hidden="true"
	>
		<template v-if="name === 'brand'">
			<path d="M5 4h8a4 4 0 0 1 0 8H5V4Zm0 8h9a4 4 0 0 1 0 8H5v-8Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
		</template>
		<template v-else-if="name === 'ranking'">
			<path d="M5 19V9m7 10V5m7 14v-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
			<path d="M3 19h18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
		</template>
		<template v-else-if="name === 'people'">
			<circle cx="9" cy="8" r="3" stroke="currentColor" stroke-width="1.8" />
			<path d="M3.5 19c.4-4 2.2-6 5.5-6s5.1 2 5.5 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
			<path d="M15 6.4a3 3 0 0 1 0 5.2M16.5 13.7c2.4.7 3.7 2.4 4 5.3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
		</template>
		<template v-else-if="name === 'sun'">
			<circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="1.8" />
			<path d="M12 2v2m0 16v2M4.9 4.9l1.5 1.5m11.2 11.2 1.5 1.5M2 12h2m16 0h2M4.9 19.1l1.5-1.5M17.6 6.4l1.5-1.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
		</template>
		<template v-else-if="name === 'moon'">
			<path d="M20 15.2A8.5 8.5 0 0 1 8.8 4 8.5 8.5 0 1 0 20 15.2Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
		</template>
		<template v-else-if="name === 'search'">
			<circle cx="10.5" cy="10.5" r="6" stroke="currentColor" stroke-width="1.8" />
			<path d="m15 15 5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
		</template>
		<template v-else-if="name === 'chevron'">
			<path d="m8 10 4 4 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
		</template>
		<template v-else-if="name === 'close'">
			<path d="m7 7 10 10M17 7 7 17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
		</template>
		<template v-else-if="name === 'plus'">
			<path d="M12 6v12M6 12h12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
		</template>
		<template v-else-if="name === 'check'">
			<path d="m6 12.5 3.5 3.5L18 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
		</template>
		<template v-else-if="name === 'person'">
			<circle cx="12" cy="8" r="3.5" stroke="currentColor" stroke-width="1.7" />
			<path d="M5 20c.5-4.7 2.8-7 7-7s6.5 2.3 7 7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
		</template>
		<template v-else-if="name === 'image'">
			<rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" stroke-width="1.7" />
			<circle cx="9" cy="9" r="1.5" fill="currentColor" />
			<path d="m5 18 4.5-4.5 3 3 2-2L19 19" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
		</template>
		<template v-else-if="name === 'edit'">
			<path d="m14.5 5.5 4 4M6 18l2.2-5.2L16.5 4.5a1.4 1.4 0 0 1 2 0l1 1a1.4 1.4 0 0 1 0 2l-8.3 8.3L6 18Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" />
		</template>
		<template v-else-if="name === 'arrow'">
			<path d="M5 12h14m-5-5 5 5-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
		</template>
		<template v-else-if="name === 'info'">
			<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7" />
			<path d="M12 11v6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /><circle cx="12" cy="7.5" r="1" fill="currentColor" />
		</template>
	</svg>
</template>

<style scoped>
.app-icon { display: block; flex: 0 0 auto; }
</style>
