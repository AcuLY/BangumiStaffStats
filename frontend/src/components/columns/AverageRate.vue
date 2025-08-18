<script setup lang="ts">
import type { PersonalSummary } from '@/api/api'
import { useGlobalStore } from '@/stores/global'

const props = defineProps<{
	row: PersonalSummary
}>()

const globalStore = useGlobalStore()

const rate = computed((): string | number =>
	globalStore.isMobile ? props.row.averageRate.toFixed(1) : props.row.averageRate
)
</script>

<template>
	<div v-if="props.row.averageRate">
		<TableText :value="rate" />
        <TableText :value="' '" />
		<Star />
	</div>
	<Star v-else unrated />
</template>
