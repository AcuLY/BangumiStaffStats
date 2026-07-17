<script setup lang="ts">
import { computed } from 'vue'
import type { SubjectWorkSortOrder } from '../composables/useSubjectWorkBrowser'
import AppIcon from './AppIcon.vue'

type SortDirectionButtonSize = 'tiny' | 'small' | 'medium' | 'large'

const props = withDefaults(defineProps<{
	order: SubjectWorkSortOrder
	contextLabel: string
	size?: SortDirectionButtonSize
}>(), {
	size: 'medium',
})

const emit = defineEmits<{
	'update:order': [value: SubjectWorkSortOrder]
}>()

const ascending = computed(() => props.order === 'asc')
const nextOrder = computed<SubjectWorkSortOrder>(() => ascending.value ? 'desc' : 'asc')
const currentLabel = computed(() => ascending.value ? '升序' : '降序')
const nextLabel = computed(() => ascending.value ? '降序' : '升序')
const accessibleLabel = computed(() => `${props.contextLabel}：当前${currentLabel.value}，切换为${nextLabel.value}`)
</script>

<template>
	<n-button
		class="sort-direction-button"
		:size="size"
		secondary
		attr-type="button"
		:aria-label="accessibleLabel"
		:title="accessibleLabel"
		@click="emit('update:order', nextOrder)"
	>
		<template #icon>
			<AppIcon
				class="sort-direction-button__icon"
				:class="{ 'is-ascending': ascending }"
				name="chevron"
			/>
		</template>
		{{ currentLabel }}
	</n-button>
</template>

<style scoped>
.sort-direction-button {
	white-space: nowrap;
}

.sort-direction-button__icon {
	transform: rotate(0deg);
	transition: transform 160ms cubic-bezier(0.22, 1, 0.36, 1);
}

.sort-direction-button__icon.is-ascending {
	transform: rotate(180deg);
}

@media (prefers-reduced-motion: reduce) {
	.sort-direction-button__icon {
		transition: none;
	}
}
</style>
