<script setup lang="ts">
import { COLLECTION_TYPE, INPUT_TYPE } from '@/constants/types'
import { useInputStore } from '@/stores/input'
import { calcActionName } from '@/utils/utils'
import { storeToRefs } from 'pinia'

const inputStore = useInputStore()
const { input } = storeToRefs(inputStore)
const { subjectType, collectionTypes, isGlobal } = toRefs(input.value)

const actionName = computed<string>(() => calcActionName(subjectType.value))
</script>

<template>
	<InputCard :type="INPUT_TYPE.COLLECTION_TYPES">
		<n-checkbox-group v-model:value="collectionTypes" :disabled="isGlobal">
			<n-flex justify="center">
				<n-checkbox :value="COLLECTION_TYPE.DONE" :label="actionName + '过'" />
				<n-checkbox :value="COLLECTION_TYPE.DOING" :label="'在' + actionName" />
				<n-checkbox :value="COLLECTION_TYPE.ON_HOLD" label="搁置" />
				<n-checkbox :value="COLLECTION_TYPE.DROPPED" label="抛弃" />
			</n-flex>
		</n-checkbox-group>
	</InputCard>
</template>
