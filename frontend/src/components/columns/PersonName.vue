<script setup lang="ts">
import type { Person } from '@/api/api'
import { useDisplayStore } from '@/stores/display'

const displayStore = useDisplayStore()

const props = defineProps<{
	person: Person
}>()

const name = computed((): string =>
	displayStore.showChinese ? props.person.nameCN : props.person.name
)
const link = computed((): string => `https://bgm.tv/person/${props.person.id}`)
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
