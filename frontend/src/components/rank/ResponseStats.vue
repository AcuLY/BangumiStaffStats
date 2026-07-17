<script setup lang="ts">
import { STATISTIC_TYPE } from '@/constants/types'
import { useRequestStore } from '@/stores/request'
import { useResponseStore } from '@/stores/response'
import type { NumberAnimationInst } from 'naive-ui'

const requestStore = useRequestStore()

const responseStore = useResponseStore()

const itemName = computed((): string => {
	switch (requestStore.request.statisticType) {
		case STATISTIC_TYPE.SUBJECT:
			return '条目'
		case STATISTIC_TYPE.SERIES:
			return '系列'
		case STATISTIC_TYPE.CHARACTER:
			return '角色'
	}
	return ''
})

const numberAnimationInstRef = ref<NumberAnimationInst | null>(null)
const playNumberAnimation = (): void => {
	numberAnimationInstRef.value?.play()
}

watch(responseStore.response.summaries, playNumberAnimation)
</script>

<template>
	<div v-show="responseStore.response.total" class="stats-wrapper">
		<n-flex>
			<n-statistic label="共统计到" tabular-nums>
				<n-number-animation
					ref="numberAnimationInstRef"
					:from="0"
					:to="responseStore.response.total"
				/>
				<template #suffix> 个人物 , </template>
			</n-statistic>

			<n-statistic :label="'\u200B'" tabular-nums>
				<n-number-animation
					ref="numberAnimationInstRef"
					:from="0"
					:to="responseStore.response.itemCount"
				/>
				<template #suffix> 个{{ itemName }} </template>
			</n-statistic>
		</n-flex>
	</div>
</template>

<style scoped>
.stats-wrapper {
	width: 90vw;
}
</style>
