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
const { isGlobal, showNSFW } = toRefs(inputStoreRef.input.value)

let value: Ref<boolean>
let title: string
let description: string

switch (props.type) {
	case INPUT_TYPE.IS_GLOBAL:
		value = isGlobal
		title = '查询全站'
		description = '开启后使用 Bangumi 全站的评分<br/>数据进行统计，默认只统计收藏人数大于 50 的条目'
		break
	case INPUT_TYPE.SHOW_NSFW:
		value = showNSFW
		title = '显示 NSFW 条目'
		description = '开启后不再过滤在 Bangumi 标记为 NSFW 的条目'
		break
	case INPUT_TYPE.DATE_RANGE:
		value = inputStoreRef.enableDateRange
		title = '播出时间范围'
		description = '按照条目播出 / 出版 / 发行的月份<br/>对条目进行筛选，留空则不做限制'
		break
	case INPUT_TYPE.RATE_RANGE:
		value = inputStoreRef.enableRateRange
		title = '分数范围'
		description =
			'按照当前账号的评分对条目进行<br/>筛选，开启查询全站则按照全站的<br/>评分筛选，留空则不做限制'
		break
	case INPUT_TYPE.FAVORITE_RANGE:
		value = inputStoreRef.enableFavoriteRange
		title = '收藏人数范围'
		description = '按照条目的收藏人数对条目<br/>进行筛选，留空则不做限制'
		break
	case INPUT_TYPE.POSITIVE_TAGS:
		value = inputStoreRef.enablePositiveTags
		title = '正向标签'
		description =
			'仅保留有选定的标签的条目，在单个标签里添加 "/" 可以表示“或”<br/><br>例："原创/漫画改, 百合" <br>以上两个标签表示“有百合标签的原创或漫画改作品”。'
		break
	case INPUT_TYPE.NEGATIVE_TAGS:
		value = inputStoreRef.enableNegativeTags
		title = '反向标签'
		description =
			'排除有选定的标签的条目，在单个标签里添加 "+" 可以表示“与”<br/><br>例："原创, 百合+后宫" <br>以上两个标签表示“排除所有原创作品，然后排除所有同时有百合和后宫标签的作品”。<br>'
		break
}

const size = globalStore.isMobile ? 'small' : 'medium'
</script>

<template>
	<n-card class="enabler-wrapper" :size="size">
		<template #header>
			<span class="title">{{ title }}</span>
		</template>

		<template #header-extra>
			<n-switch v-model:value="value" :size="size" />
		</template>

		<span class="description" v-html="description" />
	</n-card>
</template>

<style scoped>
.enabler-wrapper {
	width: 280px;
}

.title {
	margin: 0;
}

.description {
	color: #808080;
}

@media (max-width: 768px) {
	.title {
		font-size: 16px;
	}

	.description {
		font-size: 12px;
	}
}
</style>
