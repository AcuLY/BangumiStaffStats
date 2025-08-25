import { SORT_TYPE, type SortType } from '@/constants/types'
import { defineStore } from 'pinia'

export const usePaginationStore = defineStore('pagination', () => {
	const page = ref<number>(1)
	const pageSize = ref<number>(10)
	const sortBy = ref<SortType>(SORT_TYPE.COUNT)
	const ascend = ref<boolean>(false)

	return {
		page,
		pageSize,
		sortBy,
		ascend,
	}
})
