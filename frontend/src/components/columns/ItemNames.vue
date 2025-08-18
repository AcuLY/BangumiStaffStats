<script setup lang="ts">
import { useDisplayStore } from '@/stores/display'
import { useGlobalStore } from '@/stores/global'

const props = defineProps<{
	ids?: number[]
	names?: string[]
	characterSubjectNames?: string[]
	rates?: number[]
}>()

const globalStore = useGlobalStore()

const name = (index: number): string => (props.names ? props.names[index] : '')
const characterSubjectName = (index: number): string =>
	props.characterSubjectNames ? props.characterSubjectNames[index] : ''
const rate = (index: number): number => (props.rates ? props.rates[index] : 0)

const displayStore = useDisplayStore()

const SUBJECT_BASE_URL = 'https://bgm.tv/subject/'
const CHARACTER_BASE_URL = 'https://bgm.tv/character/'
</script>

<template>
	<n-list
		class="list"
		:style="{ maxHeight: `${displayStore.rowHeight}px` }"
		clickable
		:show-divider="false"
	>
		<n-list-item class="list-item" v-for="(id, index) in props.ids">
			<template v-if="displayStore.showCharacter">
				<n-tooltip
					placement="top-end"
					:content-style="{ maxWidth: globalStore.isMobile ? '250px' : '400px' }"
				>
					<template #trigger>
						<a class="name" :href="`${CHARACTER_BASE_URL}${id}`" target="_blank">
							<TableText :value="name(index)" />
							<span class="subject-name">
								【<TableText :value="characterSubjectName(index)" />】
							</span>
						</a>
					</template>

					<TableText :value="`${name(index)}【${characterSubjectName(index)}】`" />
				</n-tooltip>
			</template>

			<template v-else>
				<n-tooltip
					placement="left"
					:content-style="{ maxWidth: globalStore.isMobile ? '180px' : '300px' }"
				>
					<template #trigger>
						<a class="name" :href="`${SUBJECT_BASE_URL}${id}`" target="_blank">
							<TableText :value="rate(index)" bold />
							<TableText :value="' '" />
							<Star :unrated="rate(index) === 0" />
							<TableText :value="' '" />
							<TableText :value="name(index)" />
						</a>
					</template>

					<TableText :value="name(index)" />
				</n-tooltip>
			</template>
		</n-list-item>
	</n-list>
</template>

<style scoped>
.list {
	overflow-x: hidden;
	overflow-y: scroll;
}

.n-list {
	background-color: transparent;
	margin: 2px 8px;
}

.n-list::-webkit-scrollbar {
	width: 4px;
}

:deep(.n-list-item) {
	width: 92%;
	padding: 0;
	margin: 4px;
}

:deep(.n-list-item__main) {
	width: 100%;
}

.name {
	display: block;
	width: 97%;
	padding: 2px 8px;
	border-bottom: 1px solid #0000000c;
	border-radius: 0;
	color: var(--color-primary);
	text-decoration: none;
	line-height: 2;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	transition: all 0.1s;
}

.name:hover {
	background-color: #ec468c;
	border-color: #ec468c;
	border-radius: 4px;
	color: #ffffff;
	box-shadow: 0px 0px 5px #ff1493;
}

.subject-name {
	color: #c3809a;
}

.name:hover .subject-name {
	color: #ffd0f4;
}

@media (max-width: 768px) {
	.n-list {
		margin: 2px 5px;
	}

	.n-list::-webkit-scrollbar {
		width: 3px;
	}

	:deep(.n-list-item) {
		margin: 1px;
	}

	.name {
		padding: 1px 3px 1px 6px;
	}

	.name:hover {
		box-shadow: 0px 0px 2px #ff1493;
	}

	.name:focus {
		background-color: #ec468c;
		border-color: #ec468c;
		border-radius: 4px;
		color: #ffffff;
		box-shadow: 0px 0px 2px #ff1493;
	}
}
</style>
