import {
	computed,
	inject,
	provide,
	reactive,
	ref,
	watch,
	type ComputedRef,
	type InjectionKey,
	type Ref,
} from 'vue'
import type {
	CandidatePerson,
	CandidateSortMetric,
	CharacterCredit,
	Person,
	PersonRole,
	PositionData,
	QueryState,
	RankingMetric,
	SelectedScope,
	Subject,
	WorkbenchMode,
	WorkbenchSnapshot,
	WorkbenchTheme,
} from '../types'
import { bangumiImageUrl } from '../data/bangumiImages'
import {
	buildCharacterCredits,
	characterCreditKey,
} from '../domain/characterCredits'
import {
	preferenceContribution,
	summarizePreference,
	type PreferenceContribution,
	type PreferenceObservation,
} from '../domain/preference'
import { matchesLocalizedNameSearch } from '../domain/nameSearch'
import { shrinkRatingAverage, summarizeRatings } from '../domain/ratingSummary'
import {
	buildSeriesMemberIndex,
	materializeResultSubjects,
} from '../domain/seriesAggregation'

const RANKING_PAGE_SIZE = 10
const CANDIDATE_PAGE_SIZE = 10

const unique = <T>(values: T[]) => [...new Set(values)]
const compactSearch = (value: unknown) => String(value ?? '')
	.toLocaleLowerCase('zh-CN')
	.replace(/[\s·・_-]/g, '')

function average(values: number[]) {
	return summarizeRatings(values).average
}

function intersection(sets: Set<number>[]) {
	if (!sets.length) return new Set<number>()
	return new Set([...sets[0]].filter((value) => sets.every((set) => set.has(value))))
}

function union(sets: Set<number>[]) {
	return new Set(sets.flatMap((set) => [...set]))
}

export function retainSelectedScopesForPositions(
	scopes: readonly SelectedScope[],
	positionIds: ReadonlySet<number>,
) {
	return scopes.filter((scope) => positionIds.has(Number(scope.positionId)))
}

export interface RankingProgress {
	signed: boolean
	direction: 'positive' | 'negative' | 'neutral'
	percent: number
}

export type SubjectPreferenceContribution = PreferenceContribution & { subject: Subject }

export interface WorkbenchContext {
	snapshot: Ref<WorkbenchSnapshot | null>
	positionData: Ref<PositionData | null>
	mode: Ref<WorkbenchMode>
	theme: Ref<WorkbenchTheme>
	toggleTheme: () => void
	hasAppliedQuery: Ref<boolean>
	queryEditing: Ref<boolean>
	query: QueryState
	queryDraft: QueryState
	queryStatus: Ref<string>
	queryLoading: Ref<boolean>
	queryError: Ref<string>
	queryDraftDirty: ComputedRef<boolean>
	queryDraftStatus: ComputedRef<string>
	queryScopeCount: ComputedRef<number>
	queryScopeSubjectIds: ComputedRef<Set<number>>
	resultSubjectsForIds: (
		subjectIds: readonly number[],
		options?: {
			sharedSubjectIds?: readonly number[]
			participantSubjectIds?: Readonly<Record<string, readonly number[]>>
		},
	) => Subject[]
	resultSubjectCount: (subjectIds: readonly number[]) => number
	rankingPositionIds: ComputedRef<number[]>
	coStarPositionIds: ComputedRef<number[]>
	applyQuery: () => boolean
	cancelQuery: () => void
	clearQueryFeedback: () => void
	restoreQuery: () => void
	peopleById: ComputedRef<Map<number, Person>>
	subjectsById: ComputedRef<Map<number, Subject>>
	positions: ComputedRef<Array<{ label: string; value: number }>>
	personName: (person?: Person | null) => string
	personSecondaryName: (person?: Person | null) => string
	personImageSources: (person?: Person | null) => string[]
	characterImageSources: (characterId?: number | null) => string[]
	subjectName: (subject?: Subject | null) => string
	subjectImageSources: (subject?: Subject | null) => string[]
	positionLabel: (positionId: number) => string
	positionSubjectIds: (person: Person, positionId: number) => number[]
	personSubjectRoles: (person: Person, subjectId: number, positionId?: number) => PersonRole[]
	rankingMetric: Ref<RankingMetric>
	rankingAscend: Ref<boolean>
	rankingSearch: Ref<string>
	rankingPage: Ref<number>
	rankingPageSize: Ref<number>
	rankingResultPeople: ComputedRef<Person[]>
	rankingPeople: ComputedRef<Person[]>
	rankingCharacterCount: ComputedRef<number>
	rankingPageItems: ComputedRef<Person[]>
	rankingPageCount: ComputedRef<number>
	rankingValue: (person: Person, metric?: RankingMetric) => number | null
	rankingProgress: (person: Person) => RankingProgress
	focusedPersonId: Ref<number>
	focusedPerson: ComputedRef<Person | null>
	focusedAllSubjects: ComputedRef<Subject[]>
	focusedCharacterCredits: ComputedRef<CharacterCredit[]>
	focusedWorkSearch: Ref<string>
	focusedDistribution: ComputedRef<Array<{ label: string; value: number }>>
	focusedPreferenceContributions: ComputedRef<SubjectPreferenceContribution[]>
	candidateSearch: Ref<string>
	candidateSortMetric: Ref<CandidateSortMetric>
	candidateAscend: Ref<boolean>
	candidatePage: Ref<number>
	candidatePageSize: Ref<number>
	candidatePositionId: Ref<number>
	candidatePositionOptions: ComputedRef<Array<{ label: string; value: number; count: number }>>
	candidatePeople: ComputedRef<CandidatePerson[]>
	candidatePageItems: ComputedRef<CandidatePerson[]>
	candidatePageCount: ComputedRef<number>
	selectedScopes: Ref<SelectedScope[]>
	selectedPeople: ComputedRef<Array<{ person: Person; positionIds: number[]; subjectIds: number[] }>>
	selectionKeys: ComputedRef<Set<string>>
	isScopeSelected: (personId: number, positionId: number) => boolean
	toggleScope: (personId: number, positionId: number) => void
	removePerson: (personId: number) => void
	sharedSubjects: ComputedRef<Subject[]>
	ratingDistribution: ComputedRef<Array<{ label: string; value: number }>>
	cooperationIndex: ComputedRef<number>
	selectedUnionCount: ComputedRef<number>
	relationshipMatrix: ComputedRef<Array<{ person: Person; values: number[] }>>
	peopleDrawerOpen: Ref<boolean>
	inspectorDrawerOpen: Ref<boolean>
}

const workbenchKey: InjectionKey<WorkbenchContext> = Symbol('person-workbench')

export function provideWorkbench(
	snapshot: Ref<WorkbenchSnapshot | null>,
	positionData: Ref<PositionData | null>,
) {
	const routeSearch = new URLSearchParams(window.location.search)
	const mode = ref<WorkbenchMode>(routeSearch.get('mode') === 'ranking' ? 'ranking' : 'co-star')
	const requestedTheme = routeSearch.get('theme')
	const storedTheme = (() => {
		try {
			return window.localStorage.getItem('bgmss-workbench-theme')
		} catch {
			return null
		}
	})()
	const theme = ref<WorkbenchTheme>(
		requestedTheme === 'dark' || requestedTheme === 'light'
			? requestedTheme
			: storedTheme === 'dark' || storedTheme === 'light'
				? storedTheme
				: 'light',
	)
	const toggleTheme = () => {
		theme.value = theme.value === 'dark' ? 'light' : 'dark'
	}

	const showsInitialQueryState = window.location.pathname.endsWith('/person-workbench-empty.html')
	const hasAppliedQuery = ref(!showsInitialQueryState)
	const queryEditing = ref(showsInitialQueryState)
	const querySimulationDelayMs = showsInitialQueryState ? 1200 : 520
	const requestedUserId = routeSearch.get('user')?.trim()
	const makeQueryState = (): QueryState => ({
		isGlobal: false,
		showNSFW: false,
		mergeSeries: routeSearch.get('result') === 'series',
		userId: requestedUserId || (showsInitialQueryState ? '' : 'lucay126'),
		subjectType: 2,
		positionsByMode: {
			ranking: [102],
			'co-star': [102, 3, 10, 6],
		},
		collectionTypes: [2, 3],
		date: { enabled: false, value: ['', ''] },
		collectionDate: { enabled: false, value: ['', ''] },
		userRate: { enabled: false, value: ['', ''] },
		globalRate: { enabled: false, value: ['', ''] },
		scoreDifference: { enabled: false, value: ['', ''] },
		ratingCount: { enabled: false, value: ['', ''] },
		positiveTags: { enabled: false, value: [] },
		negativeTags: { enabled: false, value: [] },
	})
	const cloneQuery = (source: QueryState): QueryState => ({
		...source,
		positionsByMode: {
			ranking: [...source.positionsByMode.ranking],
			'co-star': [...source.positionsByMode['co-star']],
		},
		collectionTypes: [...source.collectionTypes],
		date: { ...source.date, value: [...source.date.value] as [string, string] },
		collectionDate: { ...source.collectionDate, value: [...source.collectionDate.value] as [string, string] },
		userRate: { ...source.userRate, value: [...source.userRate.value] as [string, string] },
		globalRate: { ...source.globalRate, value: [...source.globalRate.value] as [string, string] },
		scoreDifference: { ...source.scoreDifference, value: [...source.scoreDifference.value] as [string, string] },
		ratingCount: { ...source.ratingCount, value: [...source.ratingCount.value] as [string, string] },
		positiveTags: { ...source.positiveTags, value: [...source.positiveTags.value] },
		negativeTags: { ...source.negativeTags, value: [...source.negativeTags.value] },
	})
	const querySignature = (source: QueryState) => JSON.stringify({
		...cloneQuery(source),
		collectionTypes: [...source.collectionTypes].map(Number).sort((a, b) => a - b),
		positiveTags: {
			...source.positiveTags,
			value: source.positiveTags.value.map((tag) => tag.trim()).filter(Boolean),
		},
		negativeTags: {
			...source.negativeTags,
			value: source.negativeTags.value.map((tag) => tag.trim()).filter(Boolean),
		},
	})
	const query = reactive<QueryState>(makeQueryState())
	const queryDraft = reactive<QueryState>(cloneQuery(query))
	const numericPositionIds = (source: QueryState, sourceMode: WorkbenchMode) => source.positionsByMode[sourceMode]
		.map(Number)
		.filter((value) => Number.isFinite(value))
	const rankingPositionIds = computed(() => numericPositionIds(query, 'ranking'))
	const coStarPositionIds = computed(() => numericPositionIds(query, 'co-star'))
	const queryStatus = ref('正在加载')
	const queryLoading = ref(false)
	const queryError = ref('')
	const queryFeedback = ref('')
	const queryDraftDirty = computed(() => querySignature(queryDraft) !== querySignature(query))
	const queryDraftStatus = computed(() => {
		if (queryLoading.value) return '正在查询人物与作品…'
		if (queryFeedback.value) return queryFeedback.value
		if (!hasAppliedQuery.value) return ''
		return queryDraftDirty.value ? '有未提交的更改' : '条件未更改'
	})
	let queryTimer: ReturnType<typeof setTimeout> | null = null

	const restoreQuery = () => {
		Object.assign(queryDraft, cloneQuery(query))
		queryError.value = ''
		queryFeedback.value = '已撤销更改'
	}
	const clearQueryFeedback = () => {
		queryError.value = ''
		queryFeedback.value = ''
	}

	const subjectsById = computed(() => new Map(
		(snapshot.value?.subjects ?? []).map((subject) => [Number(subject.id), subject]),
	))
	const seriesMemberIndex = computed(() => buildSeriesMemberIndex(snapshot.value?.seriesMembers))
	const resultSubjectsForIds: WorkbenchContext['resultSubjectsForIds'] = (subjectIds, options = {}) => {
		const subjects = subjectIds
			.map(Number)
			.map((id) => subjectsById.value.get(id))
			.filter((subject): subject is Subject => Boolean(subject))
		return materializeResultSubjects(subjects, {
			mergeSeries: query.mergeSeries,
			seriesMemberIndex: seriesMemberIndex.value,
			subjectLookup: subjectsById.value,
			...options,
		})
	}
	const resultSubjectCount = (subjectIds: readonly number[]) => resultSubjectsForIds(subjectIds).length

	const peopleById = computed(() => {
		const people = new Map<number, Person>()
		for (const source of positionData.value?.people ?? []) {
			people.set(Number(source.id), {
				...source,
				aliases: [...(source.aliases ?? [])],
				positions: { ...(source.positions ?? {}) },
			})
		}
		for (const source of snapshot.value?.people ?? []) {
			const existing = people.get(Number(source.id))
			const positions = { ...(existing?.positions ?? {}), ...(source.positions ?? {}) }
			if (source.position && source.subjectIds) {
				positions[String(source.position.id)] = { subjectIds: [...source.subjectIds] }
			}
			people.set(Number(source.id), {
				...existing,
				...source,
				aliases: unique([...(existing?.aliases ?? []), ...(source.aliases ?? [])]),
				positions,
			})
		}
		return people
	})

	const positions = computed(() => (positionData.value?.positions ?? []).map((item) => ({
		label: item.label,
		value: Number(item.id),
	})))

	const positionLabel = (positionId: number) =>
		positions.value.find((item) => item.value === Number(positionId))?.label ?? `职位 ${positionId}`

	const personName = (person?: Person | null) =>
		person?.displayName || person?.nameCN || person?.name || '未命名人物'

	const personSecondaryName = (person?: Person | null) => {
		if (!person) return ''
		return person.name || person.nameCN || ''
	}

	const personImageSources = (person?: Person | null) => person?.id
		? [bangumiImageUrl('persons', person.id)]
		: []
	const characterImageSources = (characterId?: number | null) => Number(characterId) > 0
		? [bangumiImageUrl('characters', Number(characterId))]
		: []

	const subjectName = (subject?: Subject | null) =>
		subject?.displayName || subject?.nameCN || subject?.name || '未命名作品'

	const subjectImageSources = (subject?: Subject | null) => subject?.id
		? [bangumiImageUrl('subjects', subject.id)]
		: []

	const positionSubjectIds = (person: Person, positionId: number) => {
		const ids = person.positions?.[String(positionId)]?.subjectIds
		if (ids?.length) return ids.map(Number)
		if (Number(person.position?.id) === Number(positionId)) return (person.subjectIds ?? []).map(Number)
		return []
	}
	const personSubjectRolesAtPosition = (person: Person, subjectId: number, positionId: number) => {
		const positionRoles = person.positions?.[String(positionId)]?.rolesBySubject
		if (positionRoles?.[String(subjectId)]) return positionRoles[String(subjectId)]
		if (Number(positionId) !== 102) return []
		return person.rolesBySubject?.[String(subjectId)] ?? []
	}
	const personSubjectRoles = (person: Person, subjectId: number, positionId?: number) => {
		const positionIds = positionId === undefined ? rankingPositionIds.value : [positionId]
		const seen = new Set<string>()
		return positionIds.flatMap((id) => personSubjectRolesAtPosition(person, subjectId, id))
			.filter((role) => {
				const key = [role.characterId, role.displayName, role.nameCN, role.name, role.roleLabel].join('|')
				if (seen.has(key)) return false
				seen.add(key)
				return true
			})
	}

	const queryUserMatchesFixture = computed(() => {
		const fixtureUserId = snapshot.value?.meta.uid || snapshot.value?.meta.userId || ''
		return query.isGlobal || (Boolean(fixtureUserId)
			&& query.userId.trim().toLocaleLowerCase('en-US') === fixtureUserId.toLocaleLowerCase('en-US')
		)
	})
	const preferenceOptions = computed(() => ({
		priorWorkCount: Number(snapshot.value?.meta.preference?.priorSeriesCount) || 5,
		mergeSeries: query.mergeSeries,
	}))
	const preferenceObservationForSubject = (subject: Subject): PreferenceObservation => ({
		subjectId: Number(subject.id),
		userScore: Number(subject.collection?.rate || 0),
		globalScore: Number(subject.score || 0),
		seriesId: subject.seriesId,
	})
	const preferenceForIds = (ids: number[]) => summarizePreference(
		ids
			.map((id) => subjectsById.value.get(Number(id)))
			.filter((subject): subject is Subject => Boolean(subject))
			.map(preferenceObservationForSubject),
		preferenceOptions.value,
	)
	const insideQueryRange = (value: number, range: QueryState['userRate']) => {
		if (!range.enabled) return true
		const [start, end] = range.value
		return (start === '' || value >= Number(start)) && (end === '' || value <= Number(end))
	}
	const insideMonthRange = (value: string | undefined, range: QueryState['date']) => {
		if (!range.enabled) return true
		const month = String(value ?? '').slice(0, 7)
		const [start, end] = range.value
		return (!start || Boolean(month) && month >= start) && (!end || Boolean(month) && month <= end)
	}
	const subjectTagSet = (subject: Subject) => new Set([
		...(subject.metaTags ?? []),
		...(subject.tags ?? []),
		...(subject.collection?.tags ?? []),
	]
		.map((tag) => typeof tag === 'string' ? tag : tag?.name)
		.map(compactSearch)
		.filter(Boolean))
	const tagMatches = (tags: Set<string>, value: string) => [...tags]
		.some((tag) => tag.includes(compactSearch(value)) || compactSearch(value).includes(tag))
	const queryScopeIds = computed(() => {
		if (!hasAppliedQuery.value) return new Set<number>()
		if (!queryUserMatchesFixture.value) return new Set<number>()
		const allowedCollectionTypes = new Set(query.collectionTypes.map(Number))
		return new Set((snapshot.value?.subjects ?? [])
			.filter((subject) => Number(subject.type) === Number(query.subjectType))
			.filter((subject) => query.showNSFW || !subject.nsfw)
			.filter((subject) => query.isGlobal || allowedCollectionTypes.has(Number(subject.collection?.type)))
			.filter((subject) => insideMonthRange(subject.date, query.date))
			.filter((subject) => query.isGlobal || insideMonthRange(subject.collection?.updatedAt, query.collectionDate))
			.filter((subject) => query.isGlobal || insideQueryRange(Number(subject.collection?.rate || 0), query.userRate))
			.filter((subject) => insideQueryRange(Number(subject.score || 0), query.globalRate))
			.filter((subject) => {
				if (query.isGlobal || !query.scoreDifference.enabled) return true
				const userScore = Number(subject.collection?.rate || 0)
				const globalScore = Number(subject.score || 0)
				return userScore > 0 && globalScore > 0
					&& insideQueryRange(userScore - globalScore, query.scoreDifference)
			})
			.filter((subject) => insideQueryRange(Number(subject.ratingCount || 0), query.ratingCount))
			.filter((subject) => {
				const tags = subjectTagSet(subject)
				const positive = query.positiveTags.value.map((group) => group.trim()).filter(Boolean)
				if (query.positiveTags.enabled && positive.length) {
					const matchesEveryGroup = positive.every((group) => group
						.split('/')
						.map((tag) => tag.trim())
						.filter(Boolean)
						.some((tag) => tagMatches(tags, tag)))
					if (!matchesEveryGroup) return false
				}
				const negative = query.negativeTags.value.map((group) => group.trim()).filter(Boolean)
				if (query.negativeTags.enabled && negative.length) {
					const matchesExcludedGroup = negative.some((group) => group
						.split('+')
						.map((tag) => tag.trim())
						.filter(Boolean)
						.every((tag) => tagMatches(tags, tag)))
					if (matchesExcludedGroup) return false
				}
				return true
			})
			.map((subject) => Number(subject.id)))
	})
	const queryScopeCount = computed(() => resultSubjectCount([...queryScopeIds.value]))
	const scopeSubjectIds = (ids: number[]) => ids
		.map(Number)
		.filter((id) => queryScopeIds.value.has(id))

	watch([queryScopeIds, queryScopeCount, () => query.mergeSeries], ([ids]) => {
		if (!hasAppliedQuery.value) queryStatus.value = '尚未查询'
		else if (!snapshot.value) queryStatus.value = '正在加载'
		else if (!queryUserMatchesFixture.value) queryStatus.value = '未找到此用户数据'
		else if (!ids.size) queryStatus.value = query.mergeSeries ? '没有符合条件的系列' : '没有符合条件的条目'
		else queryStatus.value = `已应用 · ${queryScopeCount.value} ${query.mergeSeries ? '个系列' : '部'}`
	}, { immediate: true })

	const rankingMetric = ref<RankingMetric>('count')
	const rankingAscend = ref(false)
	const rankingSearch = ref('')
	const rankingPage = ref(1)
	const rankingPageSize = ref(RANKING_PAGE_SIZE)
	const focusedPersonId = ref(showsInitialQueryState ? 0 : 4697)
	const focusedWorkSearch = ref('')
	const workbenchRatingCount = (person: Person) => query.isGlobal
		? Number(person.globalRatedSubjectCount || 0)
		: Number(person.ratedSubjectCount || 0)
	const workbenchAverage = (person: Person) => query.isGlobal
		? Number(person.globalAverage || 0)
		: Number(person.userAverage || 0)

	const rankingValue = (person: Person, metric = rankingMetric.value) => {
		const ratedCount = Number(workbenchRatingCount(person))
		const averageValue = workbenchAverage(person)
		if (metric === 'average') {
			return ratedCount ? averageValue : null
		}
		if (metric === 'overall') {
			if (!ratedCount) return null
			return shrinkRatingAverage(averageValue, ratedCount)
		}
		if (metric === 'preference') return query.isGlobal ? null : person.preference?.score ?? null
		return Number(person.subjectCount || 0)
	}

	const rankingResultPeople = computed(() => {
		return [...peopleById.value.values()]
		.map((person): Person | null => {
			const positionSubjectSets = rankingPositionIds.value.map((positionId) =>
				scopeSubjectIds(positionSubjectIds(person, positionId)))
			// Ranking multi-position means the person satisfies every requested role;
			// metrics use the de-duplicated union of the matching works.
			if (!positionSubjectSets.length || positionSubjectSets.some((ids) => !ids.length)) return null
			const subjectIds = [...union(positionSubjectSets.map((ids) => new Set(ids)))]
			const resultSubjects = resultSubjectsForIds(subjectIds)
			const personalSummary = summarizeRatings(resultSubjects.map((subject) =>
				Number(subject.collection?.rate || 0)))
			const globalSummary = summarizeRatings(resultSubjects.map((subject) =>
				Number(subject.score || 0)))
			return {
				...person,
				position: rankingPositionIds.value[0]
					? { id: rankingPositionIds.value[0], label: positionLabel(rankingPositionIds.value[0]) }
					: undefined,
				subjectIds,
				subjectCount: resultSubjects.length,
				ratedSubjectCount: personalSummary.validCount,
				globalRatedSubjectCount: globalSummary.validCount,
				userAverage: personalSummary.average,
				globalAverage: globalSummary.average,
				preference: query.isGlobal ? undefined : preferenceForIds(subjectIds),
			}
		})
		.filter((person): person is Person => Boolean(person))
	})
	const rankingPeople = computed(() => {
		return rankingResultPeople.value
		.filter((person) => matchesLocalizedNameSearch(person, rankingSearch.value))
		.sort((a, b) => {
			const aValue = rankingValue(a)
			const bValue = rankingValue(b)
			const aHasMetric = aValue !== null && Number.isFinite(aValue)
			const bHasMetric = bValue !== null && Number.isFinite(bValue)
			if (aHasMetric !== bHasMetric) return aHasMetric ? -1 : 1
			const delta = Number(aValue || 0) - Number(bValue || 0)
			if (delta !== 0) return rankingAscend.value ? delta : -delta
			if (rankingMetric.value === 'preference') {
				const evidenceDelta = Number(b.preference?.effectiveEvidence || 0) - Number(a.preference?.effectiveEvidence || 0)
				if (evidenceDelta !== 0) return evidenceDelta
			}
			return Number(b.subjectCount || 0) - Number(a.subjectCount || 0)
				|| workbenchAverage(b) - workbenchAverage(a)
				|| Number(a.id) - Number(b.id)
		})
	})
	const rankingCharacterCount = computed(() => {
		if (!rankingPositionIds.value.includes(102)) return 0
		const characterKeys = new Set<string>()
		for (const person of rankingResultPeople.value) {
			for (const subjectId of scopeSubjectIds(positionSubjectIds(person, 102))) {
				for (const role of personSubjectRoles(person, subjectId, 102)) {
					characterKeys.add(characterCreditKey(role))
				}
			}
		}
		return characterKeys.size
	})

	const rankingPageCount = computed(() => Math.max(1, Math.ceil(rankingPeople.value.length / rankingPageSize.value)))
	const rankingPageItems = computed(() => {
		const start = (rankingPage.value - 1) * rankingPageSize.value
		return rankingPeople.value.slice(start, start + rankingPageSize.value)
	})
	const rankingProgress = (person: Person): RankingProgress => {
		const value = rankingValue(person)
		if (rankingMetric.value === 'preference') {
			const maxAbsolute = Math.max(0, ...rankingPeople.value
				.map((item) => rankingValue(item, 'preference'))
				.filter((item): item is number => item !== null && Number.isFinite(item))
				.map(Math.abs))
			if (value === null || !Number.isFinite(value) || Math.abs(value) < 1e-12 || maxAbsolute <= 0) {
				return { signed: true, direction: 'neutral', percent: 0 }
			}
			return {
				signed: true,
				direction: value > 0 ? 'positive' : 'negative',
				percent: Math.min(50, Math.abs(value) / maxAbsolute * 50),
			}
		}
		const values = rankingPeople.value
			.map((item) => rankingValue(item))
			.filter((item): item is number => item !== null && Number.isFinite(item))
		const max = Math.max(1, ...values)
		const percent = value === null || !Number.isFinite(value) || value <= 0
			? 0
			: Math.max(4, value / max * 100)
		return { signed: false, direction: 'neutral', percent }
	}

	const focusedPerson = computed(() => rankingPeople.value.find((person) => Number(person.id) === Number(focusedPersonId.value)) ?? rankingPeople.value[0] ?? null)
	const focusedRawSubjects = computed(() => (focusedPerson.value?.subjectIds ?? [])
		.map((id) => subjectsById.value.get(Number(id)))
		.filter((subject): subject is Subject => Boolean(subject))
		.sort((a, b) => Number(b.collection?.rate || 0) - Number(a.collection?.rate || 0) || Number(b.score || 0) - Number(a.score || 0)))
	const focusedAllSubjects = computed(() => resultSubjectsForIds(focusedPerson.value?.subjectIds ?? [])
		.sort((a, b) => Number(b.collection?.rate || 0) - Number(a.collection?.rate || 0) || Number(b.score || 0) - Number(a.score || 0)))
	const focusedCharacterCredits = computed(() => {
		if (!focusedPerson.value || !rankingPositionIds.value.includes(102)) return []
		return buildCharacterCredits(
			focusedRawSubjects.value,
			(subject) => personSubjectRoles(focusedPerson.value!, subject.id, 102),
		)
	})
	const focusedDistribution = computed(() => Array.from({ length: 10 }, (_, index) => ({
		label: String(index + 1),
		value: focusedAllSubjects.value.filter((subject) => Number(subject.collection?.rate || 0) === index + 1).length,
	})).concat({
		label: '未评',
		value: focusedAllSubjects.value.filter((subject) => !Number(subject.collection?.rate || 0)).length,
	}))
	const focusedPreferenceContributions = computed(() => {
		if (query.isGlobal) return []
		return focusedAllSubjects.value
			.map((subject): SubjectPreferenceContribution | null => {
				const contribution = preferenceContribution(preferenceObservationForSubject(subject))
				return contribution ? { ...contribution, subject } : null
			})
			.filter((item): item is SubjectPreferenceContribution => Boolean(item))
			.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference)
				|| Number(a.subjectId) - Number(b.subjectId))
	})

	watch([rankingMetric, rankingAscend, rankingSearch, rankingPageSize], () => { rankingPage.value = 1 })
	watch([rankingMetric, rankingAscend], () => {
		focusedPersonId.value = rankingPeople.value[0]?.id ?? 0
		focusedWorkSearch.value = ''
	})
	watch(() => query.isGlobal, (isGlobal) => {
		if (isGlobal && rankingMetric.value === 'preference') rankingMetric.value = 'count'
	})
	watch(rankingPageCount, (count) => { rankingPage.value = Math.min(rankingPage.value, count) })
	watch(rankingPeople, (people) => {
		if (people.some((person) => Number(person.id) === Number(focusedPersonId.value))) return
		focusedPersonId.value = people[0]?.id ?? 0
		focusedWorkSearch.value = ''
	})

	const candidateSearch = ref('')
	const candidateSortMetric = ref<CandidateSortMetric>('count')
	const candidateAscend = ref(false)
	const candidatePage = ref(1)
	const candidatePositionId = ref(102)
	const candidatePageSize = ref(CANDIDATE_PAGE_SIZE)
	const selectedScopes = ref<SelectedScope[]>([
		{ personId: 5745, positionId: 102 },
		{ personId: 262, positionId: 3 },
		{ personId: 262, positionId: 10 },
		{ personId: 9962, positionId: 6 },
	])
	const peopleDrawerOpen = ref(false)
	const inspectorDrawerOpen = ref(false)

	const selectionKeys = computed(() => new Set(selectedScopes.value.map((item) => `${item.personId}:${item.positionId}`)))
	const isScopeSelected = (personId: number, positionId: number) => selectionKeys.value.has(`${personId}:${positionId}`)
	const candidatePositionOptions = computed(() => coStarPositionIds.value.map((positionId) => ({
		label: positionLabel(positionId),
		value: positionId,
		count: [...peopleById.value.values()].filter((person) =>
			scopeSubjectIds(positionSubjectIds(person, positionId)).length > 0).length,
	})))

	const candidatePeople = computed(() => {
		return [...peopleById.value.values()]
			.map((person): CandidatePerson | null => {
				const ids = scopeSubjectIds(positionSubjectIds(person, candidatePositionId.value))
				if (!ids.length) return null
				const resultSubjects = resultSubjectsForIds(ids)
				return {
					...person,
					activePositionId: candidatePositionId.value,
					activePositionLabel: positionLabel(candidatePositionId.value),
					activeSubjectIds: ids,
					activeSubjectCount: resultSubjects.length,
					activeAverage: average(resultSubjects.map((subject) => Number(subject.collection?.rate || 0))),
					activeGlobalAverage: average(resultSubjects.map((subject) => Number(subject.score || 0))),
				}
			})
			.filter((person): person is CandidatePerson => Boolean(person))
			.filter((person) => matchesLocalizedNameSearch(person, candidateSearch.value))
			.sort((a, b) => {
				let comparison = 0
				switch (candidateSortMetric.value) {
					case 'average':
						comparison = a.activeAverage - b.activeAverage
						break
					case 'globalAverage':
						comparison = a.activeGlobalAverage - b.activeGlobalAverage
						break
					default:
						comparison = a.activeSubjectCount - b.activeSubjectCount
				}
				if (comparison) return candidateAscend.value ? comparison : -comparison
				return b.activeSubjectCount - a.activeSubjectCount
					|| (query.isGlobal ? b.activeGlobalAverage - a.activeGlobalAverage : b.activeAverage - a.activeAverage)
					|| a.id - b.id
			})
	})
	const candidatePageCount = computed(() => Math.max(1, Math.ceil(candidatePeople.value.length / candidatePageSize.value)))
	const candidatePageItems = computed(() => {
		const start = (candidatePage.value - 1) * candidatePageSize.value
		return candidatePeople.value.slice(start, start + candidatePageSize.value)
	})

	watch(coStarPositionIds, (positionIds) => {
		if (!positionIds.includes(candidatePositionId.value)) candidatePositionId.value = positionIds[0] ?? 0
	}, { immediate: true })
	watch(candidatePositionId, () => {
		candidateSearch.value = ''
		candidatePage.value = 1
	})
	watch([candidateSearch, candidateSortMetric, candidateAscend, candidatePageSize], () => { candidatePage.value = 1 })
	watch(() => query.isGlobal, (isGlobal) => {
		if (isGlobal && candidateSortMetric.value === 'average') candidateSortMetric.value = 'globalAverage'
	})
	watch(candidatePageCount, (count) => { candidatePage.value = Math.min(candidatePage.value, count) })

	const validateQuery = (source: QueryState) => {
		if (!source.isGlobal && !source.userId.trim()) return '用户 UID 未填写'
		if (!source.subjectType) return '条目类型未选择'
		if (!source.positionsByMode[mode.value].length) return mode.value === 'ranking' ? '排行职位未选择' : '参与职位未选择'
		if (!source.isGlobal && !source.collectionTypes.length) return '收藏类型未选择'
		const globalRateLabel = source.isGlobal ? '评分' : '全站评分'
		const ranges: Array<[QueryState['date'], string, 'date' | 'number']> = [
			[source.date, '播出时间', 'date'],
		]
		if (!source.isGlobal) ranges.push(
			[source.collectionDate, '收藏时间', 'date'],
			[source.userRate, '我的评分', 'number'],
		)
		ranges.push([source.globalRate, globalRateLabel, 'number'])
		if (!source.isGlobal) ranges.push([source.scoreDifference, '我的评分与全站评分差', 'number'])
		ranges.push([source.ratingCount, '评分人数', 'number'])
		for (const [range, label, kind] of ranges) {
			if (!range.enabled) continue
			const [start, end] = range.value
			if (start !== '' && end !== '') {
				const inverted = kind === 'date' ? start > end : Number(start) > Number(end)
				if (inverted) return `${label}起点大于终点`
			}
		}
		if (!source.isGlobal && source.userRate.enabled && source.userRate.value.some((value) => value !== '' && (Number(value) < 0 || Number(value) > 10))) {
			return '我的评分超出 0–10'
		}
		if (source.globalRate.enabled && source.globalRate.value.some((value) => value !== '' && (Number(value) < 0 || Number(value) > 10))) {
			return `${globalRateLabel}超出 0–10`
		}
		if (!source.isGlobal && source.scoreDifference.enabled && source.scoreDifference.value.some((value) => value !== '' && (Number(value) < -10 || Number(value) > 10))) {
			return '我的评分与全站评分差超出 -10–10'
		}
		if (source.ratingCount.enabled && source.ratingCount.value.some((value) => value !== '' && Number(value) < 0)) {
			return '评分人数小于 0'
		}
		return ''
	}

	const applyQuery = () => {
		if (queryLoading.value) return false
		const invalid = validateQuery(queryDraft)
		if (invalid) {
			queryError.value = invalid
			queryFeedback.value = '查询条件存在错误'
			return false
		}
		const next = cloneQuery(queryDraft)
		const nextCoStarPositionIds = mode.value === 'co-star'
			? new Set(numericPositionIds(next, 'co-star'))
			: null
		queryError.value = ''
		queryFeedback.value = ''
		queryLoading.value = true
		queryTimer = setTimeout(() => {
			queryTimer = null
			Object.assign(query, cloneQuery(next))
			if (nextCoStarPositionIds) {
				selectedScopes.value = retainSelectedScopesForPositions(selectedScopes.value, nextCoStarPositionIds)
			}
			hasAppliedQuery.value = true
			candidatePositionId.value = numericPositionIds(next, 'co-star')[0] ?? 0
			queryLoading.value = false
			queryEditing.value = false
			rankingPage.value = 1
			candidatePage.value = 1
			rankingSearch.value = ''
			focusedWorkSearch.value = ''
			focusedPersonId.value = rankingPeople.value[0]?.id ?? 0
		}, querySimulationDelayMs)
		return true
	}

	const cancelQuery = () => {
		if (!queryLoading.value) return
		if (queryTimer) clearTimeout(queryTimer)
		queryTimer = null
		queryLoading.value = false
		queryFeedback.value = hasAppliedQuery.value ? '已取消 · 结果未变' : '已取消 · 尚未查询'
	}

	const toggleScope = (personId: number, positionId: number) => {
		const index = selectedScopes.value.findIndex((item) => item.personId === personId && item.positionId === positionId)
		if (index >= 0) selectedScopes.value.splice(index, 1)
		else selectedScopes.value.push({ personId, positionId })
	}

	const removePerson = (personId: number) => {
		selectedScopes.value = selectedScopes.value.filter((item) => item.personId !== personId)
	}

	const selectedPeople = computed(() => {
		const groups = new Map<number, number[]>()
		for (const scope of selectedScopes.value) {
			groups.set(scope.personId, unique([...(groups.get(scope.personId) ?? []), scope.positionId]))
		}
		return [...groups.entries()].flatMap(([personId, positionIds]) => {
			const person = peopleById.value.get(personId)
			if (!person) return []
			const subjectIds = [...union(positionIds.map((positionId) => new Set(scopeSubjectIds(positionSubjectIds(person, positionId)))))]
			return [{ person, positionIds, subjectIds }]
		})
	})

	const commonSubjectIds = computed(() => {
		if (selectedPeople.value.length < 2) return new Set<number>()
		return intersection(selectedPeople.value.map((item) => new Set(item.subjectIds)))
	})
	const selectedUnionSubjectIds = computed(() => [...union(selectedPeople.value.map((item) => new Set(item.subjectIds)))])
	const selectedUnionCount = computed(() => resultSubjectCount(selectedUnionSubjectIds.value))
	const participantSubjectIds = computed(() => Object.fromEntries(selectedPeople.value.map((item) => [
		String(item.person.id),
		item.subjectIds,
	])))
	const sharedSubjects = computed(() => resultSubjectsForIds([...commonSubjectIds.value], {
		sharedSubjectIds: [...commonSubjectIds.value],
		participantSubjectIds: participantSubjectIds.value,
	})
		.sort((a, b) => Number(b.collection?.rate || 0) - Number(a.collection?.rate || 0) || Number(b.score || 0) - Number(a.score || 0)))
	const ratingDistribution = computed(() => Array.from({ length: 10 }, (_, index) => ({
		label: String(index + 1),
		value: sharedSubjects.value.filter((subject) => Number(subject.collection?.rate || 0) === index + 1).length,
	})).concat({
		label: '未评',
		value: sharedSubjects.value.filter((subject) => !Number(subject.collection?.rate || 0)).length,
	}))
	const cooperationIndex = computed(() => selectedUnionCount.value
		? Math.round((sharedSubjects.value.length / selectedUnionCount.value) * 100)
		: 0)
	const relationshipMatrix = computed(() => selectedPeople.value.map((row) => ({
		person: row.person,
		values: selectedPeople.value.map((column) => resultSubjectCount([...intersection([
			new Set(row.subjectIds),
			new Set(column.subjectIds),
		])])),
	})))
	const context: WorkbenchContext = {
		snapshot,
		positionData,
		mode,
		theme,
		toggleTheme,
		hasAppliedQuery,
		queryEditing,
		query,
		queryDraft,
		queryStatus,
		queryLoading,
		queryError,
		queryDraftDirty,
		queryDraftStatus,
		queryScopeCount,
		queryScopeSubjectIds: queryScopeIds,
		resultSubjectsForIds,
		resultSubjectCount,
		rankingPositionIds,
		coStarPositionIds,
		applyQuery,
		cancelQuery,
		clearQueryFeedback,
		restoreQuery,
		peopleById,
		subjectsById,
		positions,
		personName,
		personSecondaryName,
		personImageSources,
		characterImageSources,
		subjectName,
		subjectImageSources,
		positionLabel,
		positionSubjectIds,
		personSubjectRoles,
		rankingMetric,
		rankingAscend,
		rankingSearch,
		rankingPage,
		rankingPageSize,
		rankingResultPeople,
		rankingPeople,
		rankingCharacterCount,
		rankingPageItems,
		rankingPageCount,
		rankingValue,
		rankingProgress,
		focusedPersonId,
		focusedPerson,
		focusedAllSubjects,
		focusedCharacterCredits,
		focusedWorkSearch,
		focusedDistribution,
		focusedPreferenceContributions,
		candidateSearch,
		candidateSortMetric,
		candidateAscend,
		candidatePage,
		candidatePageSize,
		candidatePositionId,
		candidatePositionOptions,
		candidatePeople,
		candidatePageItems,
		candidatePageCount,
		selectedScopes,
		selectedPeople,
		selectionKeys,
		isScopeSelected,
		toggleScope,
		removePerson,
		sharedSubjects,
		ratingDistribution,
		cooperationIndex,
		selectedUnionCount,
		relationshipMatrix,
		peopleDrawerOpen,
		inspectorDrawerOpen,
	}

	provide(workbenchKey, context)
	return context
}

export function useWorkbench() {
	const context = inject(workbenchKey)
	if (!context) throw new Error('useWorkbench must be used inside WorkbenchApp')
	return context
}
