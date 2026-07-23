import type { SeriesMember, Subject } from '../types'
import { summarizeRatings } from './ratingSummary'

export interface SeriesMemberIndex {
	bySubjectId: ReadonlyMap<number, SeriesMember>
	bySeriesKey: ReadonlyMap<string, readonly SeriesMember[]>
}

export interface MaterializeResultSubjectsOptions {
	mergeSeries: boolean
	seriesMemberIndex?: SeriesMemberIndex
	subjectLookup?: ReadonlyMap<number, Subject>
	sharedSubjectIds?: readonly number[]
	participantSubjectIds?: Readonly<Record<string, readonly number[]>>
}

const EMPTY_SERIES_MEMBER_INDEX: SeriesMemberIndex = {
	bySubjectId: new Map(),
	bySeriesKey: new Map(),
}

const normalizedSeriesId = (value: number | string | undefined) => {
	if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
	if (typeof value !== 'string') return undefined
	const trimmed = value.trim()
	return trimmed || undefined
}

export function seriesKeyFor(seriesId: number | string | undefined, subjectId: number) {
	const normalized = normalizedSeriesId(seriesId)
	if (typeof normalized === 'number') return `series:number:${normalized}`
	if (typeof normalized === 'string') return `series:string:${normalized}`
	return `subject:${subjectId}`
}

const normalizedOrder = (value: number) => Number.isFinite(value) && value >= 0
	? value
	: Number.MAX_SAFE_INTEGER

const compareSeriesMembers = (left: SeriesMember, right: SeriesMember) =>
	normalizedOrder(left.sequelOrder) - normalizedOrder(right.sequelOrder)
		|| Number(left.id) - Number(right.id)

export function buildSeriesMemberIndex(seriesMembers: readonly SeriesMember[] = []): SeriesMemberIndex {
	const bySubjectId = new Map<number, SeriesMember>()
	for (const source of seriesMembers) {
		const id = Number(source.id)
		const seriesId = normalizedSeriesId(source.seriesId)
		if (!Number.isFinite(id) || seriesId === undefined) continue
		bySubjectId.set(id, {
			...source,
			id,
			seriesId,
			sequelOrder: normalizedOrder(Number(source.sequelOrder)),
		})
	}

	const bySeriesKey = new Map<string, SeriesMember[]>()
	for (const member of bySubjectId.values()) {
		const key = seriesKeyFor(member.seriesId, member.id)
		const members = bySeriesKey.get(key) ?? []
		members.push(member)
		bySeriesKey.set(key, members)
	}
	for (const members of bySeriesKey.values()) members.sort(compareSeriesMembers)

	return { bySubjectId, bySeriesKey }
}

const memberFromSubject = (
	subject: Subject,
	seriesId: number | string,
	sequelOrder: number,
): SeriesMember => ({
	id: Number(subject.id),
	seriesId,
	sequelOrder,
	name: subject.name,
	nameCN: subject.nameCN,
	displayName: subject.displayName,
	image: subject.image,
})

const subjectSeriesId = (subject: Subject, index: SeriesMemberIndex) =>
	normalizedSeriesId(subject.seriesId)
		?? normalizedSeriesId(index.bySubjectId.get(Number(subject.id))?.seriesId)
		?? Number(subject.id)

const subjectSeriesKey = (subject: Subject, index: SeriesMemberIndex) =>
	seriesKeyFor(subjectSeriesId(subject, index), Number(subject.id))

const compareSubjectsBySeriesOrder = (
	left: Subject,
	right: Subject,
	index: SeriesMemberIndex,
) => normalizedOrder(Number(index.bySubjectId.get(Number(left.id))?.sequelOrder))
	- normalizedOrder(Number(index.bySubjectId.get(Number(right.id))?.sequelOrder))
	|| Number(left.id) - Number(right.id)

const idsInSeries = (
	ids: readonly number[],
	seriesKey: string,
	index: SeriesMemberIndex,
	subjectLookup: ReadonlyMap<number, Subject>,
) => [...new Set(ids.map(Number).filter(Number.isFinite))]
	.filter((id) => {
		const member = index.bySubjectId.get(id)
		if (member) return seriesKeyFor(member.seriesId, id) === seriesKey
		const subject = subjectLookup.get(id)
		return Boolean(subject) && subjectSeriesKey(subject!, index) === seriesKey
	})
	.sort((left, right) => {
		const leftOrder = normalizedOrder(Number(index.bySubjectId.get(left)?.sequelOrder))
		const rightOrder = normalizedOrder(Number(index.bySubjectId.get(right)?.sequelOrder))
		return leftOrder - rightOrder || left - right
	})

/**
 * Converts query-scoped works into Subject-compatible result units.
 * Query filtering and cooperation intersections must happen before this adapter.
 */
export function materializeResultSubjects(
	subjects: Subject[],
	options: MaterializeResultSubjectsOptions,
): Subject[] {
	if (!options.mergeSeries) return subjects
	if (!subjects.length) return []

	const index = options.seriesMemberIndex ?? EMPTY_SERIES_MEMBER_INDEX
	const subjectLookup = options.subjectLookup ?? new Map(subjects.map((subject) => [Number(subject.id), subject]))
	const groups = new Map<string, Subject[]>()
	for (const subject of subjects) {
		const key = subjectSeriesKey(subject, index)
		const group = groups.get(key) ?? []
		group.push(subject)
		groups.set(key, group)
	}

	return [...groups.entries()].map(([key, sourceGroup]) => {
		const group = [...sourceGroup].sort((left, right) => compareSubjectsBySeriesOrder(left, right, index))
		const representative = group[0]
		const seriesId = subjectSeriesId(representative, index)
		const indexedMembers = index.bySeriesKey.get(key)
		const membersComplete = Boolean(indexedMembers?.length)
			&& group.every((subject) => index.bySubjectId.has(Number(subject.id)))
		const fallbackMemberSubjects = [...subjectLookup.values()]
			.filter((subject) => subjectSeriesKey(subject, index) === key)
			.sort((left, right) => compareSubjectsBySeriesOrder(left, right, index))
		const members = indexedMembers?.length
			? indexedMembers.map((member) => ({ ...member, image: member.image ? { ...member.image } : undefined }))
			: (fallbackMemberSubjects.length ? fallbackMemberSubjects : group)
				.map((subject, order) => memberFromSubject(subject, seriesId, order))
		const includedSubjectIds = group.map((subject) => Number(subject.id))
		const personalSummary = summarizeRatings(group.map((subject) => Number(subject.collection?.rate || 0)))
		const globalSummary = summarizeRatings(group.map((subject) => Number(subject.score || 0)))
		const participantSubjectIds = options.participantSubjectIds
			? Object.fromEntries(Object.entries(options.participantSubjectIds).map(([personId, ids]) => [
				personId,
				idsInSeries(ids, key, index, subjectLookup),
			]))
			: undefined
		const sharedSubjectIds = options.sharedSubjectIds
			? idsInSeries(options.sharedSubjectIds, key, index, subjectLookup)
			: undefined

		return {
			...representative,
			seriesId,
			score: globalSummary.average,
			collection: representative.collection || personalSummary.validCount
				? { ...representative.collection, rate: personalSummary.average }
				: undefined,
			series: {
				id: seriesId,
				key,
				representativeSubjectId: Number(representative.id),
				includedSubjectIds,
				members,
				membersComplete,
				...(sharedSubjectIds ? { sharedSubjectIds } : {}),
				...(participantSubjectIds ? { participantSubjectIds } : {}),
			},
		}
	})
}
