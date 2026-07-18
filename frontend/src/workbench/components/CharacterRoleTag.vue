<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
	label: string
}>()

const isProminent = computed(() => /主角|主役/.test(props.label))
</script>

<template>
	<small class="character-role-tag" :class="{ 'character-role-tag--prominent': isProminent }">{{ label }}</small>
</template>

<style scoped>
.character-role-tag {
	display: inline-flex;
	flex: 0 0 auto;
	align-items: center;
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

.character-role-tag--prominent {
	border-color: color-mix(in oklab, var(--primary) 28%, var(--border));
	background: var(--primary-soft);
	color: var(--primary-text);
}
</style>
