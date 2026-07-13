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
	CandidateFilter,
	CandidatePerson,
	DesignDirection,
	Person,
	PositionData,
	QueryState,
	RankingMetric,
	SelectedScope,
	Subject,
	WorkbenchMode,
	WorkbenchSnapshot,
} from '../types'

const RANKING_PAGE_SIZE = 10
const CANDIDATE_PAGE_SIZE = 8

const unique = <T>(values: T[]) => [...new Set(values)]
const floorTwo = (value: number) => Math.floor(value * 100) / 100
const roundTwo = (value: number) => Math.round(value * 100) / 100

function average(values: number[]) {
	const rated = values.filter((value) => value > 0)
	return rated.length ? floorTwo(rated.reduce((sum, value) => sum + value, 0) / rated.length) : 0
}

function intersection(sets: Set<number>[]) {
	if (!sets.length) return new Set<number>()
	return new Set([...sets[0]].filter((value) => sets.every((set) => set.has(value))))
}

function union(sets: Set<number>[]) {
	return new Set(sets.flatMap((set) => [...set]))
}

export interface WorkbenchContext {
	snapshot: Ref<WorkbenchSnapshot | null>
	positionData: Ref<PositionData | null>
	mode: Ref<WorkbenchMode>
	direction: Ref<DesignDirection>
	directions: Array<{ label: string; value: DesignDirection; description: string }>
	queryEditing: Ref<boolean>
	query: QueryState
	queryDraft: QueryState
	queryStatus: Ref<string>
	applyQuery: () => void
	restoreQuery: () => void
	peopleById: ComputedRef<Map<number, Person>>
	subjectsById: ComputedRef<Map<number, Subject>>
	positions: ComputedRef<Array<{ label: string; value: number }>>
	personName: (person?: Person | null) => string
	personSecondaryName: (person?: Person | null) => string
	personImageSources: (person?: Person | null, size?: 'small' | 'medium' | 'large') => string[]
	subjectName: (subject?: Subject | null) => string
	subjectImageSources: (subject?: Subject | null, size?: 'small' | 'medium') => string[]
	positionLabel: (positionId: number) => string
	positionSubjectIds: (person: Person, positionId: number) => number[]
	rankingMetric: Ref<RankingMetric>
	rankingAscend: Ref<boolean>
	rankingPage: Ref<number>
	rankingPageSize: Ref<number>
	rankingPeople: ComputedRef<Person[]>
	rankingPageItems: ComputedRef<Person[]>
	rankingPageCount: ComputedRef<number>
	rankingValue: (person: Person, metric?: RankingMetric) => number
	rankingProgress: (person: Person) => number
	focusedPersonId: Ref<number>
	focusedPerson: ComputedRef<Person | null>
	focusedAllSubjects: ComputedRef<Subject[]>
	focusedSubjects: ComputedRef<Subject[]>
	focusedWorkSearch: Ref<string>
	focusedDistribution: ComputedRef<Array<{ label: string; value: number }>>
	browsePositionId: Ref<number>
	candidateSearch: Ref<string>
	candidateFilter: Ref<CandidateFilter>
	candidateSort: Ref<'count' | 'average' | 'name'>
	candidatePage: Ref<number>
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
	analysisStatus: ComputedRef<string>
}

const workbenchKey: InjectionKey<WorkbenchContext> = Symbol('person-workbench')

export function provideWorkbench(
	snapshot: Ref<WorkbenchSnapshot | null>,
	positionData: Ref<PositionData | null>,
) {
	const mode = ref<WorkbenchMode>('co-star')
	const directionFromUrl = new URLSearchParams(window.location.search).get('direction')
	const direction = ref<DesignDirection>(
		directionFromUrl === 'split' || directionFromUrl === 'screening'
			? directionFromUrl
			: 'archive',
	)
	const directions: WorkbenchContext['directions'] = [
		{ label: '社区档案台', value: 'archive', description: '清晰、稳妥，最贴近 Bangumi 社区工具。' },
		{ label: '双色资料室', value: 'split', description: '深色控制区与浅色结果区形成明确分工。' },
		{ label: '夜场审片台', value: 'screening', description: '低眩光石墨界面，适合长时间分析。' },
	]

	const queryEditing = ref(false)
	const query = reactive<QueryState>({
		userId: 'lucay126',
		subjectType: 2,
		positionId: 102,
		collectionTypes: [2, 3],
	})
	const queryDraft = reactive<QueryState>({ ...query, collectionTypes: [...query.collectionTypes] })
	const queryStatus = ref('本地快照已应用')

	const restoreQuery = () => {
		Object.assign(queryDraft, {
			...query,
			collectionTypes: [...query.collectionTypes],
		})
	}

	const subjectsById = computed(() => new Map(
		(snapshot.value?.subjects ?? []).map((subject) => [Number(subject.id), subject]),
	))

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
		const primary = personName(person)
		return [person.name, person.nameCN].find((name) => name && name !== primary) ?? ''
	}

	const personImageSources = (person?: Person | null, size: 'small' | 'medium' | 'large' = 'medium') => {
		if (!person) return []
		const order = size === 'large'
			? ['large', 'medium', 'small'] as const
			: size === 'small'
				? ['small', 'medium', 'large'] as const
				: ['medium', 'large', 'small'] as const
		return unique(order.flatMap((candidate) => [
			person.image?.[candidate],
			person.id ? `https://api.bgm.tv/v0/persons/${person.id}/image?type=${candidate}` : '',
		]).filter((source): source is string => Boolean(source)))
	}

	const subjectName = (subject?: Subject | null) =>
		subject?.displayName || subject?.nameCN || subject?.name || '未命名作品'

	const subjectImageSources = (subject?: Subject | null, size: 'small' | 'medium' = 'small') => {
		if (!subject) return []
		const order = size === 'medium'
			? ['medium', 'common', 'small'] as const
			: ['small', 'common', 'medium'] as const
		return unique(order.flatMap((candidate) => [
			subject.image?.[candidate],
			subject.id ? `https://api.bgm.tv/v0/subjects/${subject.id}/image?type=${candidate}` : '',
		]).filter((source): source is string => Boolean(source)))
	}

	const positionSubjectIds = (person: Person, positionId: number) => {
		const ids = person.positions?.[String(positionId)]?.subjectIds
		if (ids?.length) return ids.map(Number)
		if (Number(person.position?.id) === Number(positionId)) return (person.subjectIds ?? []).map(Number)
		return []
	}

	const averageForIds = (ids: number[]) => average(ids.map((id) =>
		Number(subjectsById.value.get(Number(id))?.collection?.rate || 0),
	))
	const globalAverageForIds = (ids: number[]) => average(ids.map((id) =>
		Number(subjectsById.value.get(Number(id))?.score || 0),
	))

	const queryUserMatchesFixture = computed(() => {
		const fixtureUserId = snapshot.value?.meta.uid || snapshot.value?.meta.userId || ''
		return Boolean(fixtureUserId)
			&& query.userId.trim().toLocaleLowerCase('en-US') === fixtureUserId.toLocaleLowerCase('en-US')
	})
	const queryScopeIds = computed(() => {
		if (!queryUserMatchesFixture.value) return new Set<number>()
		const allowedCollectionTypes = new Set(query.collectionTypes.map(Number))
		return new Set((snapshot.value?.subjects ?? [])
			.filter((subject) => Number(subject.type) === Number(query.subjectType))
			.filter((subject) => allowedCollectionTypes.has(Number(subject.collection?.type)))
			.map((subject) => Number(subject.id)))
	})
	const scopeSubjectIds = (ids: number[]) => ids
		.map(Number)
		.filter((id) => queryScopeIds.value.has(id))

	watch(queryScopeIds, (ids) => {
		if (!snapshot.value) queryStatus.value = '正在载入本地快照'
		else if (!queryUserMatchesFixture.value) queryStatus.value = '该 UID 不在本地快照中'
		else if (!ids.size) queryStatus.value = '本地快照中没有匹配条目'
		else queryStatus.value = `本地快照 · ${ids.size} 部条目`
	}, { immediate: true })

	const rankingMetric = ref<RankingMetric>('count')
	const rankingAscend = ref(false)
	const rankingPage = ref(1)
	const rankingPageSize = ref(RANKING_PAGE_SIZE)
	const focusedPersonId = ref(4697)
	const focusedWorkSearch = ref('')

	const rankingValue = (person: Person, metric = rankingMetric.value) => {
		if (metric === 'average') return Number(person.userAverage || 0)
		if (metric === 'overall') {
			const count = Number(person.subjectCount || 0)
			return roundTwo((count * Number(person.userAverage || 0) + 25) / (count + 5))
		}
		return Number(person.subjectCount || 0)
	}

	const rankingPeople = computed(() => [...peopleById.value.values()]
		.map((person): Person | null => {
			const subjectIds = scopeSubjectIds(positionSubjectIds(person, query.positionId))
			if (!subjectIds.length) return null
			const ratedSubjectCount = subjectIds.filter((id) => Number(subjectsById.value.get(id)?.collection?.rate || 0) > 0).length
			return {
				...person,
				position: { id: query.positionId, label: positionLabel(query.positionId) },
				subjectIds,
				subjectCount: subjectIds.length,
				ratedSubjectCount,
				userAverage: averageForIds(subjectIds),
				globalAverage: globalAverageForIds(subjectIds),
			}
		})
		.filter((person): person is Person => Boolean(person))
		.sort((a, b) => {
			const delta = rankingValue(a) - rankingValue(b)
			if (delta !== 0) return rankingAscend.value ? delta : -delta
			return Number(a.id) - Number(b.id)
		}))

	const rankingPageCount = computed(() => Math.max(1, Math.ceil(rankingPeople.value.length / rankingPageSize.value)))
	const rankingPageItems = computed(() => {
		const start = (rankingPage.value - 1) * rankingPageSize.value
		return rankingPeople.value.slice(start, start + rankingPageSize.value)
	})
	const rankingProgress = (person: Person) => {
		const max = Math.max(1, ...rankingPeople.value.map((item) => rankingValue(item)))
		return Math.max(4, (rankingValue(person) / max) * 100)
	}

	const focusedPerson = computed(() => rankingPeople.value.find((person) => Number(person.id) === Number(focusedPersonId.value)) ?? rankingPeople.value[0] ?? null)
	const focusedAllSubjects = computed(() => (focusedPerson.value?.subjectIds ?? [])
		.map((id) => subjectsById.value.get(Number(id)))
		.filter((subject): subject is Subject => Boolean(subject))
		.sort((a, b) => Number(b.collection?.rate || 0) - Number(a.collection?.rate || 0) || Number(b.score || 0) - Number(a.score || 0)))
	const focusedSubjects = computed(() => {
		const queryValue = focusedWorkSearch.value.trim().toLocaleLowerCase('zh-CN')
		return focusedAllSubjects.value
			.filter((subject) => !queryValue || subjectName(subject).toLocaleLowerCase('zh-CN').includes(queryValue))
	})
	const focusedDistribution = computed(() => Array.from({ length: 10 }, (_, index) => ({
		label: String(index + 1),
		value: focusedAllSubjects.value.filter((subject) => Number(subject.collection?.rate || 0) === index + 1).length,
	})).concat({
		label: '未评',
		value: focusedAllSubjects.value.filter((subject) => !Number(subject.collection?.rate || 0)).length,
	}))

	watch([rankingMetric, rankingAscend, rankingPageSize], () => { rankingPage.value = 1 })
	watch(rankingPageCount, (count) => { rankingPage.value = Math.min(rankingPage.value, count) })

	const browsePositionId = ref(102)
	const candidateSearch = ref('')
	const candidateFilter = ref<CandidateFilter>('all')
	const candidateSort = ref<'count' | 'average' | 'name'>('count')
	const candidatePage = ref(1)
	const selectedScopes = ref<SelectedScope[]>([
		{ personId: 4697, positionId: 102 },
		{ personId: 4765, positionId: 102 },
	])
	const peopleDrawerOpen = ref(false)
	const inspectorDrawerOpen = ref(false)

	const selectionKeys = computed(() => new Set(selectedScopes.value.map((item) => `${item.personId}:${item.positionId}`)))
	const isScopeSelected = (personId: number, positionId: number) => selectionKeys.value.has(`${personId}:${positionId}`)

	const candidatePeople = computed(() => {
		const queryValue = candidateSearch.value.trim().toLocaleLowerCase('zh-CN')
		return [...peopleById.value.values()]
			.map((person): CandidatePerson | null => {
				const ids = scopeSubjectIds(positionSubjectIds(person, browsePositionId.value))
				if (!ids.length) return null
				return {
					...person,
					activePositionId: browsePositionId.value,
					activePositionLabel: positionLabel(browsePositionId.value),
					activeSubjectIds: ids,
					activeSubjectCount: ids.length,
					activeAverage: averageForIds(ids),
				}
			})
			.filter((person): person is CandidatePerson => Boolean(person))
			.filter((person) => {
				if (!queryValue) return true
				return [personName(person), person.name, person.nameCN, ...(person.aliases ?? [])]
					.some((value) => value?.toLocaleLowerCase('zh-CN').includes(queryValue))
			})
			.filter((person) => {
				const selected = isScopeSelected(person.id, browsePositionId.value)
				return candidateFilter.value === 'all'
					|| (candidateFilter.value === 'selected' && selected)
					|| (candidateFilter.value === 'unselected' && !selected)
			})
			.sort((a, b) => {
				if (candidateSort.value === 'name') return personName(a).localeCompare(personName(b), 'zh-CN')
				if (candidateSort.value === 'average') return b.activeAverage - a.activeAverage || a.id - b.id
				return b.activeSubjectCount - a.activeSubjectCount || a.id - b.id
			})
	})
	const candidatePageCount = computed(() => Math.max(1, Math.ceil(candidatePeople.value.length / CANDIDATE_PAGE_SIZE)))
	const candidatePageItems = computed(() => {
		const start = (candidatePage.value - 1) * CANDIDATE_PAGE_SIZE
		return candidatePeople.value.slice(start, start + CANDIDATE_PAGE_SIZE)
	})

	watch([browsePositionId, candidateSearch, candidateFilter, candidateSort], () => { candidatePage.value = 1 })
	watch(candidatePageCount, (count) => { candidatePage.value = Math.min(candidatePage.value, count) })

	const applyQuery = () => {
		Object.assign(query, {
			...queryDraft,
			collectionTypes: [...queryDraft.collectionTypes],
		})
		queryEditing.value = false
		rankingPage.value = 1
		candidatePage.value = 1
		focusedWorkSearch.value = ''
		browsePositionId.value = query.positionId
		focusedPersonId.value = rankingPeople.value[0]?.id ?? 0
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
	const selectedUnionCount = computed(() => union(selectedPeople.value.map((item) => new Set(item.subjectIds))).size)
	const sharedSubjects = computed(() => [...commonSubjectIds.value]
		.map((id) => subjectsById.value.get(id))
		.filter((subject): subject is Subject => Boolean(subject))
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
		values: selectedPeople.value.map((column) => intersection([
			new Set(row.subjectIds),
			new Set(column.subjectIds),
		]).size),
	})))
	const analysisStatus = computed(() => selectedPeople.value.length >= 2
		? `分析已更新 · ${selectedPeople.value.length} 人`
		: '至少再选择 1 人')

	const context: WorkbenchContext = {
		snapshot,
		positionData,
		mode,
		direction,
		directions,
		queryEditing,
		query,
		queryDraft,
		queryStatus,
		applyQuery,
		restoreQuery,
		peopleById,
		subjectsById,
		positions,
		personName,
		personSecondaryName,
		personImageSources,
		subjectName,
		subjectImageSources,
		positionLabel,
		positionSubjectIds,
		rankingMetric,
		rankingAscend,
		rankingPage,
		rankingPageSize,
		rankingPeople,
		rankingPageItems,
		rankingPageCount,
		rankingValue,
		rankingProgress,
		focusedPersonId,
		focusedPerson,
		focusedAllSubjects,
		focusedSubjects,
		focusedWorkSearch,
		focusedDistribution,
		browsePositionId,
		candidateSearch,
		candidateFilter,
		candidateSort,
		candidatePage,
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
		analysisStatus,
	}

	provide(workbenchKey, context)
	return context
}

export function useWorkbench() {
	const context = inject(workbenchKey)
	if (!context) throw new Error('useWorkbench must be used inside WorkbenchApp')
	return context
}
