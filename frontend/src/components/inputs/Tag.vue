<script setup lang="ts">
import { PRIMARY_COLOR } from '@/constants/themes'
import { INPUT_TYPE, type InputType } from '@/constants/types'
import { useInputStore } from '@/stores/input'
import { storeToRefs } from 'pinia'

const props = defineProps<{
	type: InputType
}>()

const isPositive = props.type === INPUT_TYPE.POSITIVE_TAGS

const inputStore = useInputStore()
const inputStoreRef = storeToRefs(inputStore)
const { positiveTags, negativeTags } = toRefs(inputStoreRef.input.value)

let enable: Ref<boolean>
let tags: Ref<string[]>

if (isPositive) {
	enable = inputStoreRef.enablePositiveTags
	tags = positiveTags
} else {
	enable = inputStoreRef.enableNegativeTags
	tags = negativeTags
}
</script>

<template>
	<InputCard :type="props.type" v-show="enable">
		<div class="tag-field">
			<n-dynamic-tags
				v-model:value="tags"
				size="medium"
				round
				:color="{ borderColor: PRIMARY_COLOR, textColor: PRIMARY_COLOR }"
			/>
		</div>
	</InputCard>
</template>

<style scoped>
.tag-field {
	width: 300px;
}
</style>
