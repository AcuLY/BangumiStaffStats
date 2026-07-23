<script setup lang="ts">
import type { Character, Subject } from '@/api/api'
import { useDisplayStore } from '@/stores/display'
import { useGlobalStore } from '@/stores/global'

const props = defineProps<{
	items: Subject[] | Character[]
}>()

const globalStore = useGlobalStore()
const displayStore = useDisplayStore()

const name = (item: { name: string; nameCN: string }): string => {
	return displayStore.showChinese ? item.nameCN : item.name
}

const SUBJECT_BASE_URL = 'https://bgm.tv/subject/'
const CHARACTER_BASE_URL = 'https://bgm.tv/character/'
</script>

<template>
	<ul
		class="list"
		:style="{ maxHeight: `${displayStore.rowHeight}px` }"
	>
		<li class="list-item" v-for="item in props.items" :key="item.id">
			<template v-if="'subject' in item">
				<n-tooltip
					placement="top-end"
					:content-style="{ maxWidth: globalStore.isMobile ? '250px' : '400px' }"
				>
					<template #trigger>
						<a
							class="name"
							:href="`${CHARACTER_BASE_URL}${item.id}`"
							target="_blank"
							:data-link-id="item.id"
						>
							<TableText :value="name(item)" />
							<span class="subject-name">
								【<TableText
									:value="name(item.subject)"
								/>】
							</span>
						</a>
					</template>

					<TableText :value="`${name(item)}【${name(item.subject)}】`" />
				</n-tooltip>
			</template>

			<template v-else>
				<n-tooltip
					placement="left"
					:content-style="{ maxWidth: globalStore.isMobile ? '180px' : '300px' }"
				>
					<template #trigger>
						<a class="name" :href="`${SUBJECT_BASE_URL}${item.id}`" target="_blank" :data-link-id="item.id">
							<TableText :value="item.rate" bold />
							<TableText :value="' '" />
							<Star :unrated="item.rate === 0" />
							<TableText :value="' '" />
							<TableText :value="name(item)" />
						</a>
					</template>

					<TableText :value="name(item)" />
				</n-tooltip>
			</template>
		</li>
	</ul>
</template>

<style scoped>
.list {
	margin: 2px 8px;
	padding: 0;
	list-style: none;
	background-color: transparent;
	overflow-x: hidden;
	overflow-y: scroll;
}

.list::-webkit-scrollbar {
	width: 4px;
}

.list-item {
	width: 92%;
	padding: 0;
	margin: 4px;
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
	background-color: var(--color-primary-hover);
	border-color: var(--color-primary-hover);
	border-radius: 4px;
	color: #ffffff;
	box-shadow: 0 0 5px var(--color-primary);
}

.subject-name {
	color: var(--color-primary);
}

.name:hover .subject-name {
	color: #ffffff;
}

@media (max-width: 768px) {
	.list {
		margin: 2px 5px;
	}

	.list::-webkit-scrollbar {
		width: 3px;
	}

	.list-item {
		margin: 1px;
	}

	.name {
		padding: 1px 3px 1px 6px;
	}

	.name:hover {
		box-shadow: 0 0 2px var(--color-primary);
	}

	.name:focus {
		background-color: var(--color-primary-hover);
		border-color: var(--color-primary-hover);
		border-radius: 4px;
		color: #ffffff;
		box-shadow: 0 0 2px var(--color-primary);
	}
}
</style>
