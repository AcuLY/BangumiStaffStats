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
	<span class="switch-wrapper">
		<n-switch
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
	</span>
</template>

<style scoped>
.switch-wrapper {
	display: inline-block;
	font-weight: 600;
	margin: 0 6px 8px 0;
}

.unchecked {
	color: #777777;
}

</style>
