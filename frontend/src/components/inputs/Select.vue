<script setup lang="ts">
import { POSITION_OPTIONS, SUBJECT_TYPE_OPTIONS } from '@/constants/options'
import { INPUT_TYPE, type InputType } from '@/constants/types'
import { useInputStore } from '@/stores/input'
import { storeToRefs } from 'pinia'

const props = defineProps<{
	type: InputType
}>()

const inputStore = useInputStore()
const { input } = storeToRefs(inputStore)
const { subjectType, position } = toRefs(input.value)

let title: string
let options: {
	label: string
	value: string | number
}[]
let value: Ref<number | string | null>

if (props.type == INPUT_TYPE.SUBJECT_TYPE) {
	title = '条目类型'
	options = SUBJECT_TYPE_OPTIONS
	value = subjectType
} else if (props.type == INPUT_TYPE.POSITION) {
	title = '职位'
	options = subjectType.value ? POSITION_OPTIONS[subjectType.value] : []
	value = position
}

watch(subjectType, () => {
	position.value = null
})
</script>

<template>
	<InputCard :type="props.type">
		<n-select
			v-model:value="value"
			:options="options"
			:placeholder="`请选择${title}`"
			clearable
			filterable
		/>
	</InputCard>
</template>
