<script setup lang="ts">
const props = defineProps<{
	unrated?: boolean
}>()

const src = computed((): string => (props.unrated ? '/star_unrated.png' : '/star.png'))
</script>

<template>
	<img class="star" :src="src" />
</template>

<style scoped>
.star {
	width: 10px;
}

@media (max-width: 768px) {
	.star {
		width: 8px;
	}
}
</style>
