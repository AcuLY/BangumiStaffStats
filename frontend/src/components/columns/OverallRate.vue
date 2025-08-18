<script setup lang="ts">
import type { PersonalSummary } from '@/api/api';
import { useGlobalStore } from '@/stores/global';

const props = defineProps<{
    row: PersonalSummary
}>()

const globalStore = useGlobalStore()

const rate = computed((): string | number =>
	globalStore.isMobile ? props.row.overallRate.toFixed(1) : props.row.overallRate
)
</script>

<template>
    <div v-if="props.row.overallRate">
        <TableText :value="rate" pink />
    </div>
    <TableText v-else :value="'无'" />
</template>