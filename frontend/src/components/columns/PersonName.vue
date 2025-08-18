<script setup lang="ts">
import type { PersonalSummary } from '@/api/api'
import { useDisplayStore } from '@/stores/display'

const displayStore = useDisplayStore()

const props = defineProps<{
	row: PersonalSummary
}>()

const name = computed((): string =>
	displayStore.showChinese ? props.row.personNameCN : props.row.personName
)
const link = computed((): string => `https://bgm.tv/person/${props.row.personID}`)
</script>

<template>
	<a class="person-name" :href="link" :title="link" target="_blank">
		<TableText :value="name" pink />
	</a>
</template>

<style scoped>
.person-name {
	color: (--color-primary);
	display: inline-block;
	text-decoration: none;
	line-height: 1.4;
}
</style>
