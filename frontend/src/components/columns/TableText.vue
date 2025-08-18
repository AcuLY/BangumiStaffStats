<script setup lang="ts">
const props = defineProps<{
	value?: string | number
	pink?: boolean
	bold?: boolean
	style?: any
}>()
</script>

<template>
	<span
		v-show="props.value"
		class="text"
		:style="[
			{
				color: props.pink ? '#FF1493' : 'inherit',
				fontWeight: props.bold ? 'bold' : 'normal',
				...props.style,
			},
		]"
	>
		{{ props.value }}
	</span>
</template>

<style scoped>
.text {
	font-size: 14px;
}

@media (max-width: 768px) {
	.text {
		font-size: 10px;
	}
}
</style>
