export type WorkbenchMode = 'ranking' | 'co-star'
export type WorkbenchTheme = 'light' | 'dark'
export type RankingMetric = 'count' | 'average' | 'overall'
export type CandidateFilter = 'all' | 'selected' | 'unselected'

export interface ImageSet {
	small?: string
	medium?: string
	large?: string
	common?: string
}

export interface PersonPosition {
	subjectIds: number[]
	rolesBySubject?: Record<string, PersonRole[]>
}

export interface PersonRole {
	roleLabel?: string
	displayName?: string
	name?: string
	nameCN?: string
}

export interface Person {
	id: number
	rank?: number
	name?: string
	nameCN?: string
	displayName?: string
	aliases?: string[]
	career?: string[]
	careers?: string[]
	image?: ImageSet
	position?: { id: number; label: string }
	positions?: Record<string, PersonPosition>
	subjectIds?: number[]
	subjectCount?: number
	ratedSubjectCount?: number
	userAverage?: number
	globalAverage?: number
	rolesBySubject?: Record<string, PersonRole[]>
}

export interface SubjectCollection {
	type?: number
	rate?: number
	comment?: string
	tags?: string[]
}

export interface Subject {
	id: number
	type?: number
	nsfw?: boolean
	name?: string
	nameCN?: string
	displayName?: string
	date?: string
	score?: number
	rank?: number
	favoriteCount?: number
	image?: ImageSet
	collection?: SubjectCollection
	metaTags?: Array<string | { name?: string }>
	tags?: Array<string | { name?: string }>
}

export interface SnapshotMeta {
	uid?: string
	userId?: string
	generatedAt?: string
	ui?: {
		pageSize?: number
		summaryThreshold?: number
	}
	query?: {
		positionId?: number
		positionLabel?: string
		subjectType?: number
		collectionTypes?: number[]
	}
}

export interface WorkbenchSnapshot {
	meta: SnapshotMeta
	people: Person[]
	subjects: Subject[]
	characters?: unknown[]
	casts?: unknown[]
}

export interface PositionOption {
	id: number
	label: string
}

export interface PositionData {
	positions: PositionOption[]
	people: Person[]
}

export interface SelectedScope {
	personId: number
	positionId: number
}

export interface CandidatePerson extends Person {
	activePositionId: number
	activePositionLabel: string
	activeSubjectIds: number[]
	activeSubjectCount: number
	activeAverage: number
}

export interface QueryRangeCondition {
	enabled: boolean
	value: [string, string]
}

export interface QueryTagCondition {
	enabled: boolean
	value: string[]
}

export interface QueryState {
	isGlobal: boolean
	showNSFW: boolean
	userId: string
	subjectType: number
	positionId: number
	position: number | string
	collectionTypes: number[]
	date: QueryRangeCondition
	rate: QueryRangeCondition
	favorite: QueryRangeCondition
	positiveTags: QueryTagCondition
	negativeTags: QueryTagCondition
}
