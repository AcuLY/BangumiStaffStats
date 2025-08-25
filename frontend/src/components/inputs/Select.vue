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

const title = props.type === INPUT_TYPE.SUBJECT_TYPE ? '条目类型' : '职位'
const options = computed(() =>
	props.type === INPUT_TYPE.SUBJECT_TYPE
		? SUBJECT_TYPE_OPTIONS
		: subjectType.value
		? POSITION_OPTIONS[subjectType.value]
		: []
)
const value = props.type === INPUT_TYPE.SUBJECT_TYPE ? subjectType : position

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
