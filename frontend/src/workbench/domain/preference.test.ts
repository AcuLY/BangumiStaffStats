import { describe, expect, it } from 'vitest'
import {
	normalizePreferenceObservations,
	preferenceContribution,
	summarizePreference,
} from './preference'

describe('strict linear preference contribution', () => {
	it('uses the readable score difference without marginal effects', () => {
		const highScoreEdge = preferenceContribution({
			subjectId: 1,
			userScore: 9,
			globalScore: 8.5,
		})
		const lowConsensusFavorite = preferenceContribution({
			subjectId: 2,
			userScore: 8,
			globalScore: 5,
		})

		expect(highScoreEdge?.difference).toBeCloseTo(0.5, 12)
		expect(lowConsensusFavorite?.difference).toBeCloseTo(3, 12)
	})

	it('uses the raw global score without vote-based correction', () => {
		const contribution = preferenceContribution({
			subjectId: 1,
			userScore: 8,
			globalScore: 5,
		})

		expect(contribution?.difference).toBeCloseTo(3, 12)
	})

	it('keeps one direct score pair as one valid unit', () => {
		const contribution = preferenceContribution({
			subjectId: 1,
			userScore: 8,
			globalScore: 5,
		})
		const summary = summarizePreference([{
			subjectId: 1,
			userScore: 8,
			globalScore: 5,
		}])

		expect(contribution?.difference).toBeCloseTo(3, 12)
		expect(summary.effectiveEvidence).toBe(1)
		expect(summary.score).toBeCloseTo(3 / 6, 12)
	})
})

describe('production-parity work-count shrinkage', () => {
	it('uses integer work count and the same n over n plus five weight as overall score', () => {
		const summary = summarizePreference([
			{ subjectId: 1, userScore: 8, globalScore: 7 },
			{ subjectId: 2, userScore: 8, globalScore: 7 },
			{ subjectId: 3, userScore: 8, globalScore: 7 },
		])

		expect(summary.comparableCount).toBe(3)
		expect(summary.effectiveEvidence).toBe(3)
		expect(summary.mean).toBeCloseTo(1, 12)
		expect(summary.evidenceWeight).toBeCloseTo(3 / 8, 12)
		expect(summary.score).toBeCloseTo(3 / 8, 12)
	})

	it('treats each work independently when series merging is off', () => {
		const observations = [
			{ subjectId: 1, seriesId: 100, userScore: 8, globalScore: 7 },
			{ subjectId: 2, seriesId: 100, userScore: 6, globalScore: 7 },
			{ subjectId: 3, seriesId: 200, userScore: 9, globalScore: 8 },
		]
		const summary = summarizePreference(observations, { mergeSeries: false })

		expect(summary.comparableCount).toBe(3)
		expect(summary.comparableSeriesCount).toBe(2)
		expect(summary.effectiveEvidence).toBe(3)
		expect(summary.mean).toBeCloseTo(1 / 3, 12)
		expect(summary.score).toBeCloseTo(1 / 8, 12)
	})

	it('averages works inside a series before applying integer series count', () => {
		const observations = [
			{ subjectId: 1, seriesId: 100, userScore: 8, globalScore: 7 },
			{ subjectId: 2, seriesId: 100, userScore: 6, globalScore: 7 },
			{ subjectId: 3, seriesId: 200, userScore: 9, globalScore: 8 },
		]
		const summary = summarizePreference(observations, { mergeSeries: true })

		expect(summary.comparableCount).toBe(3)
		expect(summary.comparableSeriesCount).toBe(2)
		expect(summary.effectiveEvidence).toBe(2)
		expect(summary.mean).toBeCloseTo(0.5, 12)
		expect(summary.evidenceWeight).toBeCloseTo(2 / 7, 12)
		expect(summary.score).toBeCloseTo(1 / 7, 12)
	})

	it('keeps the merged series count integer', () => {
		const summary = summarizePreference([
			{ subjectId: 1, seriesId: 100, userScore: 8, globalScore: 7 },
			{ subjectId: 2, seriesId: 100, userScore: 7, globalScore: 6 },
		], { mergeSeries: true })

		expect(summary.effectiveEvidence).toBe(1)
		expect(summary.evidenceWeight).toBeCloseTo(1 / 6, 12)
	})
})

describe('preference input normalization', () => {
	it('deduplicates subjects deterministically and drops invalid score pairs', () => {
		const normalized = normalizePreferenceObservations([
			{ subjectId: 2, userScore: 7, globalScore: 7 },
			{ subjectId: 1, userScore: 9, globalScore: 8 },
			{ subjectId: 2, userScore: 4, globalScore: 4 },
			{ subjectId: 3, userScore: 0, globalScore: 7 },
			{ subjectId: 4, userScore: 8, globalScore: Number.NaN },
		])

		expect(normalized.map((item) => item.subjectId)).toEqual([1, 2])
		expect(normalized.find((item) => item.subjectId === 2)?.userScore).toBe(4)
	})

	it('distinguishes numeric and string series identifiers', () => {
		const summary = summarizePreference([
			{ subjectId: 1, seriesId: 1, userScore: 8, globalScore: 7 },
			{ subjectId: 2, seriesId: '1', userScore: 8, globalScore: 7 },
		], { mergeSeries: true })

		expect(summary.comparableSeriesCount).toBe(2)
		expect(summary.effectiveEvidence).toBe(2)
	})

	it('returns an unavailable score for empty input and never exposes negative zero', () => {
		const empty = summarizePreference([])
		const neutral = summarizePreference([{ subjectId: 1, userScore: 7, globalScore: 7 }])

		expect(empty).toEqual({
			comparableCount: 0,
			comparableSeriesCount: 0,
			effectiveEvidence: 0,
			evidenceWeight: 0,
			mean: null,
			score: null,
		})
		expect(Object.is(neutral.score, -0)).toBe(false)
	})
})
