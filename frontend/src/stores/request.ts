import { EmptyRequest, fetchStatistics, type StatsRequest } from '@/api/api'
import { useDisplayStore } from '@/stores/display'
import { useGlobalStore } from '@/stores/global'
import { useInputStore } from '@/stores/input'
import { usePaginationStore } from '@/stores/pagination'
import { useResponseStore } from '@/stores/response'
import axios, { isAxiosError } from 'axios'
import { defineStore } from 'pinia'
import { createDiscreteApi } from 'naive-ui'

class InvalidInputError extends Error {
	constructor(message: string) {
		super(message)
		Object.setPrototypeOf(this, new.target.prototype)
	}
}

export const useRequestStore = defineStore('request', () => {
	const request = reactive<StatsRequest>(EmptyRequest)

	const isCV = computed<boolean>((): boolean => {
		return request.position.includes('声优')
	})

	const updateRequestInput = (): void => {
		const inputStore = useInputStore()

		request.userID = inputStore.input.userID
		request.subjectType = inputStore.input.subjectType
		request.position = inputStore.input.position
		request.collectionTypes = inputStore.input.collectionTypes.slice()
		request.isGlobal = inputStore.input.isGlobal
		request.showNSFW = inputStore.input.showNSFW
		request.dateRange = inputStore.enableDateRange ? [...inputStore.input.dateRange] : [null, null]
		request.rateRange = inputStore.enableRateRange ? [...inputStore.input.rateRange] : [null, null]
		request.favoriteRange = inputStore.enableFavoriteRange
			? [...inputStore.input.favoriteRange]
			: [null, null]
		request.positiveTags = inputStore.enablePositiveTags ? [...inputStore.input.positiveTags] : []
		request.negativeTags = inputStore.enableNegativeTags ? [...inputStore.input.negativeTags] : []
	}

	const updateRequestDisplay = (): void => {
		const displayStore = useDisplayStore()

		request.statisticType = displayStore.statisticType
	}

	const updateRequestPagination = (): void => {
		const paginationStore = usePaginationStore()

		request.page = paginationStore.page
		request.pageSize = paginationStore.pageSize
		request.sortBy = paginationStore.sortBy
		request.ascend = paginationStore.ascend
	}

	const validateInput = (): void => {
		const inputStore = useInputStore()

		if (!inputStore.input.userID && !inputStore.input.isGlobal) {
			throw new InvalidInputError('请输入用户 ID')
		}
		if (!inputStore.input.subjectType) {
			throw new InvalidInputError('请选择条目类型')
		}
		if (!inputStore.input.position) {
			throw new InvalidInputError('请选择职位')
		}
		if (inputStore.input.collectionTypes.length === 0 && !inputStore.input.isGlobal) {
			throw new InvalidInputError('请选择至少一种收藏类型')
		}
	}

	const updateAndFetch = async (isInput: boolean): Promise<void> => {
		const { notification } = createDiscreteApi(['notification'])

		const globalStore = useGlobalStore()
		const { startLoading, stopLoading } = globalStore

		const responseStore = useResponseStore()
		const { updateResponse, clearResponse } = responseStore

		startLoading()

		try {
			if (isInput) {
				validateInput()
				updateRequestInput()
			} else {
				if (!responseStore.hasResponse) {
					return
				}

				updateRequestDisplay()
				updateRequestPagination()
			}

			const resp = await fetchStatistics(request)
			updateResponse(resp)
		} catch (error) {
			clearResponse()
			
			switch (true) {
				case axios.isCancel(error):
					notification.warning({
						title: '查询取消',
						duration: 5000,
					})
					break

				case error instanceof InvalidInputError:
					notification.warning({
						title: error.message,
						duration: 5000,
					})
					break

				case isAxiosError(error) && error.response !== undefined:
					notification.warning({
						title: error.response.data.error,
						duration: 5000,
					})
					break

				case error instanceof Error && error.message === 'Network Error':
					notification.error({
						title: '网络错误，可能是服务器暂时关闭了，请稍后再来',
						duration: 5000,
					})
					break

				case error instanceof Error:
					notification.error({
						title: `未知错误：${error.message}`,
						duration: 5000,
					})
					break

				default:
					notification.error({
						title: `未知错误：${String(error)}`,
						duration: 5000,
					})
			}
		} finally {
			stopLoading()
		}
	}

	return {
		request,
		updateRequestInput,
		updateRequestDisplay,
		updateRequestPagination,
		isCV,
		updateAndFetch,
	}
})
