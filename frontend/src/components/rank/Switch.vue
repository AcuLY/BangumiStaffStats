<script setup lang="ts">
const props = defineProps<{
	label: string
	callback?: () => Promise<void>
}>()

const value = defineModel<boolean>()

const isLoading = ref(false)

const handleUpdateValue = async (): Promise<void> => {
	if (props.callback) {
		isLoading.value = true
		await props.callback()
	}

	value.value = !value.value
	isLoading.value = false
}
</script>

<template>
	<n-switch
		class="switch"
		:value="value"
		size="large"
		@update:value="handleUpdateValue"
		:loading="isLoading"
	>
		<template #checked>
			<span>{{ props.label }}</span>
		</template>
		<template #unchecked>
			<span class="unchecked">{{ props.label }}</span>
		</template>
	</n-switch>
</template>

<style scoped>
.switch {
	font-weight: 600;
	margin: 0 6px 8px 0;
}

.unchecked {
	color: #777777;
}

@media (max-width: 768px) {
	.switch {
		font-size: 12px;
	}
}
</style>
