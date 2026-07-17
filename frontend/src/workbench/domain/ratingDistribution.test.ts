import { describe, expect, it } from 'vitest'
import type { Subject } from '../types'
import {
	buildQuarterlyRatingPoints,
	buildQuarterlyRatingAverages,
	buildScoreDistribution,
	subjectQuarter,
	subjectRating,
} from './ratingDistribution'

const subjects: Subject[] = [
	{ id: 1, date: '2024-01-10', score: 8.4, collection: { rate: 9 } },
	{ id: 2, date: '2024-03-31', score: 8.5, collection: { rate: 8 } },
	{ id: 3, date: '2024-04-01', score: 7.2, collection: { rate: 0 } },
	{ id: 4, score: 9.1, collection: { rate: 10 } },
]

describe('rating distribution data', () => {
	it('builds personal and rounded global 1–10 score buckets', () => {
		const personal = buildScoreDistribution(subjects, 'personal')
		const global = buildScoreDistribution(subjects, 'global')

		expect(personal[7].value).toBe(1)
		expect(personal[8].value).toBe(1)
		expect(personal[9].value).toBe(1)
		expect(global[6].value).toBe(1)
		expect(global[7].value).toBe(1)
		expect(global[8].value).toBe(2)
	})

	it('parses quarter boundaries from broadcast dates', () => {
		expect(subjectQuarter('2024-01-01')).toMatchObject({ year: 2024, quarter: 1 })
		expect(subjectQuarter('2024-03-31')).toMatchObject({ year: 2024, quarter: 1 })
		expect(subjectQuarter('2024-04-01')).toMatchObject({ year: 2024, quarter: 2 })
		expect(subjectQuarter('not-a-date')).toBeNull()
	})

	it('keeps one dated point per rated work and sorts chronologically', () => {
		const points = buildQuarterlyRatingPoints(subjects, 'global')

		expect(points.map((point) => point.subject.id)).toEqual([1, 2, 3])
		expect(points.map((point) => point.quarter)).toEqual([1, 1, 2])
		expect(points.map((point) => point.score)).toEqual([8.4, 8.5, 7.2])
		expect(subjectRating(subjects[2], 'personal')).toBeNull()
	})

	it('aggregates one average point per quarter while retaining contributing works', () => {
		const quarters = buildQuarterlyRatingAverages(subjects, 'global')

		expect(quarters).toHaveLength(2)
		expect(quarters[0]).toMatchObject({ year: 2024, quarter: 1, average: 8.45 })
		expect(quarters[0].works.map((point) => point.subject.id)).toEqual([1, 2])
		expect(quarters[1]).toMatchObject({ year: 2024, quarter: 2, average: 7.2 })
	})
})
