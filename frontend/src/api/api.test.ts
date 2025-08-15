import { describe, it, expect } from 'vitest'
import { fetchStatistics } from '@/api/api'
import type { StatsRequest, StatsResponse } from '@/api/api'
import {
	COLLECTION_TYPE,
	SORT_TYPE,
	STATISTIC_TYPE,
	SUBJECT_TYPE,
} from '@/constants/types'

describe('fetchStatistics', () => {
	it('basic', async () => {
		const data: StatsRequest = {
			userID: 'lucay126',
			subjectType: SUBJECT_TYPE.ANIME,
			position: '声优（仅主役）',
			collectionTypes: [COLLECTION_TYPE.DONE],
			dateRange: [],
			favoriteRange: [],
			rateRange: [],
			positiveTags: [],
			negativeTags: [],
			showNSFW: true,
			page: 1,
			pageSize: 2,
			statisticType: STATISTIC_TYPE.SUBJECT,
			sortBy: SORT_TYPE.COUNT,
			ascend: false,
		}

		const result: StatsResponse = await fetchStatistics(data)
		console.log(JSON.stringify(result, null, 2))

		expect(true).toBe(true)
	})
})
