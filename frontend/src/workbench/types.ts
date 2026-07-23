import type { PreferenceSummary } from './domain/preference'

export type WorkbenchMode = 'ranking' | 'co-star'
export type WorkbenchTheme = 'light' | 'dark'
export type RankingMetric = 'count' | 'average' | 'overall' | 'preference'
export type CandidateSortMetric = 'count' | 'average' | 'globalAverage' | 'name'
export type QueryPositionValue = number | string
export type QueryPositionsByMode = Record<WorkbenchMode, QueryPositionValue[]>
export interface ImageSet {
	small?: string
	medium?: string
	large?: string
	common?: string
}

export interface SeriesMember {
	id: number
	seriesId: number | string
	sequelOrder: number
	name?: string
	nameCN?: string
	displayName?: string
	image?: ImageSet
}

export interface SubjectSeriesView {
	id: number | string
	key: string
	representativeSubjectId: number
	includedSubjectIds: number[]
	members: SeriesMember[]
	membersComplete: boolean
	sharedSubjectIds?: number[]
	participantSubjectIds?: Record<string, number[]>
}

export interface PersonPosition {
	subjectIds: number[]
	rolesBySubject?: Record<string, PersonRole[]>
}

export interface PersonRole {
	characterId?: number
	roleType?: number
	roleLabel?: string
	sortOrder?: number
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
	globalRatedSubjectCount?: number
	userAverage?: number
	globalAverage?: number
	preference?: PreferenceSummary
	rolesBySubject?: Record<string, PersonRole[]>
}

export interface SubjectCollection {
	type?: number
	rate?: number
	comment?: string
	tags?: string[]
	updatedAt?: string
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
	ratingCount?: number
	rank?: number
	favoriteCount?: number
	seriesId?: number | string
	series?: SubjectSeriesView
	image?: ImageSet
	collection?: SubjectCollection
	metaTags?: Array<string | { name?: string }>
	tags?: Array<string | { name?: string }>
}

export interface CharacterCreditAppearance {
	subject: Subject
	roleType?: number
	roleLabel: string
	sortOrder: number
}

export interface CharacterCredit {
	key: string
	characterId?: number
	displayName: string
	name?: string
	nameCN?: string
	appearances: CharacterCreditAppearance[]
	roleLabels: string[]
	primaryRolePriority: number
	subjectCount: number
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
	preference?: {
		priorSeriesCount?: number
	}
}

export interface WorkbenchSnapshot {
	meta: SnapshotMeta
	people: Person[]
	subjects: Subject[]
	seriesMembers?: SeriesMember[]
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
	activeGlobalAverage: number
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
	mergeSeries: boolean
	userId: string
	subjectType: number
	positionsByMode: QueryPositionsByMode
	collectionTypes: number[]
	date: QueryRangeCondition
	collectionDate: QueryRangeCondition
	userRate: QueryRangeCondition
	globalRate: QueryRangeCondition
	scoreDifference: QueryRangeCondition
	ratingCount: QueryRangeCondition
	positiveTags: QueryTagCondition
	negativeTags: QueryTagCondition
}
