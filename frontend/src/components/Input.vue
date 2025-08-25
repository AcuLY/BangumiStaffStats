<script setup lang="ts">
import { PRIMARY_COLOR } from '@/constants/themes'
import { INPUT_TYPE } from '@/constants/types'
import { useGlobalStore } from '@/stores/global'
import { useInputStore } from '@/stores/input'
import { cancel } from '@/api/api'
import { useRequestStore } from '@/stores/request'

const globalStore = useGlobalStore()

const inputStore = useInputStore()

const requestStore = useRequestStore()
const { updateAndFetch } = requestStore

const handleButtonClick = (): void => {
	updateAndFetch(true)
}

onMounted(() => {
	const paramUser = new URLSearchParams(window.location.search).get('user')
	if (paramUser) {
		inputStore.input.userID = paramUser
	}
})
</script>

<template>
	<n-flex class="request-wrapper" justify="center" align="center" ref="request-wrapper">
		<n-flex class="input-wrapper" justify="center" size="large">
			<UserID />
			<Select :type="INPUT_TYPE.SUBJECT_TYPE" />
			<Select :type="INPUT_TYPE.POSITION" />
			<CollectionType />
			<Range :type="INPUT_TYPE.DATE_RANGE" />
			<Range :type="INPUT_TYPE.RATE_RANGE" />
			<Range :type="INPUT_TYPE.FAVORITE_RANGE" />
			<Tag :type="INPUT_TYPE.POSITIVE_TAGS" />
			<Tag :type="INPUT_TYPE.NEGATIVE_TAGS" />
		</n-flex>

		<n-flex justify="center">
			<n-button
				class="button"
				@click="inputStore.showMoreOptions = true"
				ghost
				:color="PRIMARY_COLOR"
			>
				更多选项
			</n-button>

			<n-button
				class="button"
				@click="handleButtonClick"
				type="primary"
				:loading="globalStore.isLoading"
			>
				查询
			</n-button>

			<n-button
				class="button"
				@click="cancel"
				strong
				secondary
				type="primary"
				:disabled="!globalStore.isLoading"
			>
				取消查询
			</n-button>
		</n-flex>
	</n-flex>
</template>

<style scoped>
.request-wrapper {
	position: relative;
	width: 90vw;
	padding: 12px;
}

.input-wrapper {
	margin-bottom: 10px;
}

.button {
	width: 100px;
	transform: translateY(8px);
}
</style>
