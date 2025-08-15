<script setup lang="ts">
import { INPUT_TYPE, type InputType } from '@/constants/types'
import { useGlobalStore } from '@/stores/global'
import { useInputStore } from '@/stores/input'
import { storeToRefs } from 'pinia'

const props = defineProps<{
	type: InputType
}>()

const globalStore = useGlobalStore()

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
	<n-card
		class="option"
		:header-style="{ padding: globalStore.isMobile ? '8px 18px' : '8px 14px' }"
		size="small"
		hoverable
		:closable="closable"
		@close="enable = false"
	>
		<template #header>
			<h3 class="title">{{ title }}</h3>
		</template>

		<template #header-extra>
			<slot name="header-extra" />
		</template>

		<template #action>
			<n-flex class="action" justify="center" align="center">
				<slot />
			</n-flex>
		</template>
	</n-card>
</template>

<style scoped>
.option {
	width: 320px;
}

.title {
	margin: 0;
}

.action {
	min-height: 34px;
}

@media (max-width: 768px) {
	.title {
		font-size: 16px;
	}
}
</style>
