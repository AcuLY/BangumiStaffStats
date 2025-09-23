<script setup lang="ts">
import type { PersonSummary } from '@/api/api'
import { useDisplayStore } from '@/stores/display'

const props = defineProps<{ row: PersonSummary }>()

const items = computed(() => (props.row.subjects ? props.row.subjects : props.row.characters!))

const displayStore = useDisplayStore()
</script>

<template>
	<ItemImages v-if="displayStore.showImage" :items="items" />
	<ItemNames v-else :items="items" />
</template>
