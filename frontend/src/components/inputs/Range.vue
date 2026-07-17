<script setup lang="ts">
import { INPUT_TYPE, type InputType } from '@/constants/types'
import { useInputStore } from '@/stores/input'
import { storeToRefs } from 'pinia'

const props = defineProps<{
	type: InputType
}>()

const inputStore = useInputStore()
const inputStoreRef = storeToRefs(inputStore)
const { dateRange, rateRange, favoriteRange } = toRefs(inputStoreRef.input.value)

let enable: Ref<boolean>
let max: number | undefined
let step: number
let range: Ref<[any, any]>

switch (props.type) {
	case INPUT_TYPE.DATE_RANGE:
		enable = inputStoreRef.enableDateRange
		range = dateRange
		break
	case INPUT_TYPE.RATE_RANGE:
		enable = inputStoreRef.enableRateRange
		max = 10
		step = 0.5
		range = rateRange
		break
	case INPUT_TYPE.FAVORITE_RANGE:
		enable = inputStoreRef.enableFavoriteRange
		max = undefined
		step = 100
		range = favoriteRange
		break
}
</script>

<template>
	<InputCard :type="props.type" v-show="enable">
		<n-flex justify="space-between">
			<div v-if="props.type != INPUT_TYPE.DATE_RANGE" class="range-control">
				<n-input-number
					v-model:value="range[0]"
					size="medium"
					:step="step"
					:max="max"
					:min="0"
					clearable
					button-placement="both"
				/>
			</div>

			<div v-else class="range-control">
				<n-date-picker
					v-model:value="range[0]"
					size="medium"
					type="month"
					clearable
					update-value-on-close
				/>
			</div>

			<span style="font-size: large">~</span>

			<div v-if="props.type != INPUT_TYPE.DATE_RANGE" class="range-control">
				<n-input-number
					v-model:value="range[1]"
					size="medium"
					:step="step"
					:max="max"
					:min="0"
					clearable
					button-placement="both"
				/>
			</div>

			<div v-else class="range-control">
				<n-date-picker
					v-model:value="range[1]"
					size="medium"
					type="month"
					clearable
					update-value-on-close
				/>
			</div>
		</n-flex>
	</InputCard>
</template>

<style scoped>
.range-control {
	width: 120px;
}
</style>
