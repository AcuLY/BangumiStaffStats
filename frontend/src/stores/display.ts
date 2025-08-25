import { STATISTIC_TYPE, type StatisticType } from '@/constants/types'
import { defineStore } from 'pinia'

export const useDisplayStore = defineStore('display', () => {
	const showChinese = ref(false)
	const showImage = ref(false)
	const mergeSeries = ref(false)
	const showCharacter = ref(false)

	const rowHeight = ref(300)
	const tableHeight = ref(1200)

	const hasShowCharacterRequest = ref(false)
	const hasMergeSeriesRequest = ref(false)

	const statisticType = computed((): StatisticType => {
		if (hasShowCharacterRequest.value) {
			return STATISTIC_TYPE.CHARACTER
		}
		if (hasMergeSeriesRequest.value) {
			return STATISTIC_TYPE.SERIES
		}
		return STATISTIC_TYPE.SUBJECT
	})

	return {
		showChinese,
		showImage,
		mergeSeries,
		showCharacter,
		rowHeight,
		tableHeight,
		statisticType,
		hasShowCharacterRequest,
		hasMergeSeriesRequest,
	}
})
