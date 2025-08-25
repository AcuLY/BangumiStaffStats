import { EmptyResponse, type StatsResponse } from '@/api/api'
import { defineStore } from 'pinia'
import isEqual from 'lodash/isEqual'

export const useResponseStore = defineStore('response', () => {
	const response = reactive<StatsResponse>(EmptyResponse)

	const hasResponse = computed((): boolean => isEqual(response, EmptyResponse))

	const updateResponse = (resp: StatsResponse): void => {
		Object.assign(response, resp)
	}

	const clearResponse = (): void => {
		Object.assign(response, EmptyResponse)
	}

	return {
		response,
		hasResponse,
		updateResponse,
		clearResponse,
	}
})
