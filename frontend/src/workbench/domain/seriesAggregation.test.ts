import { describe, expect, it } from 'vitest'
import type { SeriesMember, Subject } from '../types'
import { summarizeRatings } from './ratingSummary'
import {
	buildSeriesMemberIndex,
	materializeResultSubjects,
	seriesKeyFor,
} from './seriesAggregation'

const subject = (
	id: number,
	seriesId: number | string | undefined,
	userScore: number,
	globalScore: number,
	extra: Partial<Subject> = {},
): Subject => ({
	id,
	seriesId,
	displayName: `作品 ${id}`,
	score: globalScore,
	collection: { rate: userScore },
	...extra,
})

const member = (
	id: number,
	seriesId: number | string,
	sequelOrder: number,
): SeriesMember => ({
	id,
	seriesId,
	sequelOrder,
	displayName: `作品 ${id}`,
})

describe('series result aggregation', () => {
	it('returns the original subject array when series merging is disabled', () => {
		const subjects = [subject(1, 100, 8, 7)]

		expect(materializeResultSubjects(subjects, { mergeSeries: false })).toBe(subjects)
	})

	it('uses the lowest sequel order inside the current result as representative', () => {
		const index = buildSeriesMemberIndex([
			member(1, 100, 0),
			member(2, 100, 2),
			member(3, 100, 1),
		])
		const result = materializeResultSubjects([
			subject(2, 100, 6, 7, { tags: ['第二部'] }),
			subject(3, 100, 8, 9, { tags: ['当前代表'] }),
		], { mergeSeries: true, seriesMemberIndex: index })

		expect(result).toHaveLength(1)
		expect(result[0]).toMatchObject({
			id: 3,
			score: 8,
			collection: { rate: 7 },
			tags: ['当前代表'],
		})
		expect(result[0].series).toMatchObject({
			representativeSubjectId: 3,
			includedSubjectIds: [3, 2],
			membersComplete: true,
		})
		expect(result[0].series?.members.map((item) => item.id)).toEqual([1, 3, 2])
	})

	it('falls back deterministically when the current fixture has no series-member index', () => {
		const snapshotSubjects = [
			subject(403238, 50, 8, 8),
			subject(349441, 50, 7, 7),
			subject(526816, 50, 6, 6),
		]
		const result = materializeResultSubjects([
			snapshotSubjects[0],
			snapshotSubjects[1],
		], {
			mergeSeries: true,
			subjectLookup: new Map(snapshotSubjects.map((item) => [item.id, item])),
		})

		expect(result).toHaveLength(1)
		expect(result[0].id).toBe(349441)
		expect(result[0].series?.membersComplete).toBe(false)
		expect(result[0].series?.members.map((item) => item.id)).toEqual([349441, 403238, 526816])
	})

	it('keeps numeric, string, and missing series identities separate', () => {
		const result = materializeResultSubjects([
			subject(1, 10, 8, 7),
			subject(2, '10', 8, 7),
			subject(3, undefined, 8, 7),
			subject(4, undefined, 8, 7),
		], { mergeSeries: true })

		expect(result).toHaveLength(4)
		expect(seriesKeyFor(10, 1)).not.toBe(seriesKeyFor('10', 2))
		expect(seriesKeyFor(undefined, 3)).not.toBe(seriesKeyFor(undefined, 4))
	})

	it('retains strict shared works and per-person participation inside the series', () => {
		const allSubjects = [
			subject(1, 100, 7, 7),
			subject(2, 100, 8, 8),
			subject(3, 100, 9, 9),
		]
		const index = buildSeriesMemberIndex([
			member(1, 100, 0),
			member(2, 100, 1),
			member(3, 100, 2),
		])
		const [result] = materializeResultSubjects([allSubjects[1]], {
			mergeSeries: true,
			seriesMemberIndex: index,
			subjectLookup: new Map(allSubjects.map((item) => [item.id, item])),
			sharedSubjectIds: [2],
			participantSubjectIds: {
				'10': [1, 2],
				'20': [2, 3],
			},
		})

		expect(result.series?.sharedSubjectIds).toEqual([2])
		expect(result.series?.participantSubjectIds).toEqual({
			'10': [1, 2],
			'20': [2, 3],
		})
	})

	it('averages works inside each series before series-level averages are combined', () => {
		const index = buildSeriesMemberIndex([
			member(1, 100, 0),
			member(2, 100, 1),
			member(3, 200, 0),
		])
		const result = materializeResultSubjects([
			subject(1, 100, 10, 9),
			subject(2, 100, 6, 7),
			subject(3, 200, 2, 3),
		], { mergeSeries: true, seriesMemberIndex: index })

		expect(result.map((item) => item.collection?.rate)).toEqual([8, 2])
		expect(summarizeRatings(result.map((item) => Number(item.collection?.rate))).average).toBe(5)
	})
})
