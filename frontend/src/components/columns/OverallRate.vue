<script setup lang="ts">
import type { PersonSummary } from '@/api/api'
import { useGlobalStore } from '@/stores/global'

const props = defineProps<{
	row: PersonSummary
}>()

const globalStore = useGlobalStore()

const rate = computed((): string | number =>
	props.row.overall ? (globalStore.isMobile ? props.row.overall.toFixed(1) : props.row.overall) : 0
)
</script>

<template>
	<div v-if="props.row.overall">
		<TableText :value="rate" pink />
	</div>
	<TableText v-else :value="'无'" />
</template>
