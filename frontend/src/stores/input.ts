import { EmptyInput, type Input } from '@/api/api'
import { defineStore } from 'pinia'

export const useInputStore = defineStore('input', () => {
	const input = reactive<Input>(EmptyInput)

	const showMoreOptions = ref<boolean>(false)

	const enableRateRange = ref<boolean>(false)
	const enableDateRange = ref<boolean>(false)
	const enableFavoriteRange = ref<boolean>(false)
	const enablePositiveTags = ref<boolean>(false)
	const enableNegativeTags = ref<boolean>(false)

	return {
		input,
		showMoreOptions,
		enableDateRange,
		enableRateRange,
		enableFavoriteRange,
		enablePositiveTags,
		enableNegativeTags,
	}
})
