<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
	label: string
	count?: number
}>()

const isProminent = computed(() => /主角|主役/.test(props.label))
const displayCount = computed(() => Number.isInteger(props.count) && Number(props.count) > 0
	? Number(props.count)
	: null)
const accessibleLabel = computed(() => displayCount.value
	? `${props.label}，参与 ${displayCount.value} 部`
	: props.label)
</script>

<template>
	<small
		class="character-role-tag"
		:class="{ 'character-role-tag--prominent': isProminent }"
		:title="accessibleLabel"
		:aria-label="accessibleLabel"
	>
		<span class="character-role-tag__text">{{ label }}</span>
		<span v-if="displayCount" class="character-role-tag__count" aria-hidden="true">{{ displayCount }}</span>
	</small>
</template>

<style scoped>
.character-role-tag {
	display: inline-flex;
	flex: 0 0 auto;
	align-items: center;
	align-self: center;
	gap: var(--space-1);
	max-width: 100%;
	min-height: 18px;
	padding: 0 var(--space-1);
	border: 1px solid var(--border);
	border-radius: 999px;
	background: var(--surface-subtle);
	color: var(--text-2);
	font-size: var(--text-caption);
	font-weight: 600;
	line-height: 16px;
	white-space: nowrap;
}

.character-role-tag__text {
	display: block;
	flex: 1 1 auto;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.character-role-tag__count {
	flex: 0 0 auto;
	color: var(--text-3);
	font-variant-numeric: tabular-nums;
	font-weight: 700;
}

.character-role-tag--prominent {
	border-color: var(--control-border);
	background: var(--surface-sunken);
	color: var(--text-1);
}
</style>
