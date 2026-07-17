<script setup lang="ts">
import { INPUT_TYPE, type InputType } from '@/constants/types'
import { useInputStore } from '@/stores/input'
import { storeToRefs } from 'pinia'

const props = defineProps<{
	type: InputType
}>()

const inputStore = useInputStore()
const inputStoreRef = storeToRefs(inputStore)

let title: string
let enable: Ref<boolean> | null = null

switch (props.type) {
	case INPUT_TYPE.USER_ID:
		title = '用户 UID'
		break
	case INPUT_TYPE.SUBJECT_TYPE:
		title = '条目类型'
		break
	case INPUT_TYPE.POSITION:
		title = '职位'
		break
	case INPUT_TYPE.COLLECTION_TYPES:
		title = '收藏类型'
		break
	case INPUT_TYPE.DATE_RANGE:
		title = '播出时间'
		enable = inputStoreRef.enableDateRange
		break
	case INPUT_TYPE.RATE_RANGE:
		title = '评分'
		enable = inputStoreRef.enableRateRange
		break
	case INPUT_TYPE.FAVORITE_RANGE:
		title = '收藏人数'
		enable = inputStoreRef.enableFavoriteRange
		break
	case INPUT_TYPE.POSITIVE_TAGS:
		title = '正向标签'
		enable = inputStoreRef.enablePositiveTags
		break
	case INPUT_TYPE.NEGATIVE_TAGS:
		title = '反向标签'
		enable = inputStoreRef.enableNegativeTags
		break
}

const closable = enable !== null
</script>

<template>
	<div class="option">
		<n-card size="small" hoverable :closable="closable" @close="enable = false">
			<template #header>
				<h3 class="title">{{ title }}</h3>
			</template>

			<template #header-extra>
				<slot name="header-extra" />
			</template>

			<template #action>
				<n-flex justify="center" align="center">
					<slot />
				</n-flex>
			</template>
		</n-card>
	</div>
</template>

<style scoped>
.option {
	width: 320px;
}

.title {
	margin: 0;
}

@media (max-width: 768px) {
	.title {
		font-size: 16px;
	}
}
</style>
