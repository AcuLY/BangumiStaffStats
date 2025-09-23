<script setup lang="ts">
import type { PersonSummary } from '@/api/api'
import { useGlobalStore } from '@/stores/global'

const props = defineProps<{
	row: PersonSummary
}>()

const globalStore = useGlobalStore()

const rate = computed((): string | number =>
	props.row.average ? (globalStore.isMobile ? props.row.average.toFixed(1) : props.row.average) : 0
)
</script>

<template>
	<div v-if="props.row.average">
		<TableText :value="rate" />
		<TableText :value="' '" />
		<Star />
	</div>
	<Star v-else unrated />
</template>
