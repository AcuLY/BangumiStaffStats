import axios from 'axios'
import {
	COLLECTION_TYPE,
	SORT_TYPE,
	STATISTIC_TYPE,
	SUBJECT_TYPE,
	type CollectionType,
	type SortType,
	type StatisticType,
	type SubjectType,
} from '@/constants/types'

interface Input {
	userID: string | null
	subjectType: SubjectType | null
	position: string | null
	collectionTypes: CollectionType[]
	positiveTags: string[]
	negativeTags: string[]
	rateRange: [number | null, number | null]
	favoriteRange: [number | null, number | null]
	dateRange: [number | null, number | null] // 时间戳
	isGlobal: boolean
	showNSFW: boolean
}

const EmptyInput: Input = {
	userID: import.meta.env.VITE_API_USERID === '' ? null : import.meta.env.VITE_API_USERID,
	subjectType: SUBJECT_TYPE.ANIME,
	position: import.meta.env.VITE_API_POSITION === '' ? null : import.meta.env.VITE_API_POSITION,
	collectionTypes: [COLLECTION_TYPE.DOING, COLLECTION_TYPE.DONE],
	positiveTags: [],
	negativeTags: [],
	rateRange: [null, null],
	favoriteRange: [null, null],
	dateRange: [null, null],
	isGlobal: false,
	showNSFW: false,
}

interface Pagination {
	page: number
	pageSize: number
	sortBy: SortType
	ascend: boolean
}

const EmptyPagination: Pagination = {
	page: 1,
	pageSize: 10,
	sortBy: SORT_TYPE.COUNT,
	ascend: false,
}

interface StatsRequest {
	userID: string
	subjectType: SubjectType
	position: string
	collectionTypes: CollectionType[]
	positiveTags: string[]
	negativeTags: string[]
	rateRange: [number | null, number | null]
	favoriteRange: [number | null, number | null]
	dateRange: [number | null, number | null] // 时间戳
	isGlobal: boolean
	showNSFW: boolean
	statisticType: StatisticType
	page: number
	pageSize: number
	sortBy: SortType
	ascend: boolean
}

const EmptyRequest: StatsRequest = {
	userID: import.meta.env.VITE_API_USERID,
	subjectType: SUBJECT_TYPE.ANIME,
	position: import.meta.env.VITE_API_POSITION,
	collectionTypes: [COLLECTION_TYPE.DOING, COLLECTION_TYPE.DONE],
	positiveTags: [],
	negativeTags: [],
	rateRange: [null, null],
	favoriteRange: [null, null],
	dateRange: [null, null],
	isGlobal: false,
	showNSFW: false,
	statisticType: STATISTIC_TYPE.SUBJECT,
	...EmptyPagination,
}

interface Person {
	id: number
	name: string
	nameCN: string
}

interface Subject {
	id: number
	name: string
	nameCN: string
	image: string
	rate: number
}

interface Character {
	id: number
	name: string
	nameCN: string
	image: string
	subject: Subject
}

interface PersonSummary {
	person: Person

	subjects?: Subject[]
	characters?: Character[]

	average?: number
	overall?: number
}

interface StatsResponse {
	summaries: PersonSummary[]
	total: number
	itemCount: number
}

const EmptyResponse: StatsResponse = {
	summaries: [],
	total: 0,
	itemCount: 0,
}

let abortController: AbortController

const cancel = (): void => {
	abortController.abort()
}

const fetchStatistics = async (data: StatsRequest): Promise<StatsResponse> => {
	abortController = new AbortController()
	const url = `${import.meta.env.VITE_API_URL}/statistics`
	const resp = await axios.post(url, data, { signal: abortController.signal })
	return resp.data
}

export { fetchStatistics, cancel, EmptyInput, EmptyRequest, EmptyResponse }
export type { Input, Pagination, Person, Subject, Character, PersonSummary, StatsRequest, StatsResponse }
