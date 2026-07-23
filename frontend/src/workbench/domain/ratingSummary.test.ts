import { describe, expect, it } from 'vitest'
import { shrinkRatingAverage, summarizeRatings } from './ratingSummary'

describe('summarizeRatings', () => {
	it('ignores missing ratings in both the average and shrinkage count', () => {
		expect(summarizeRatings([8, 0, 0])).toEqual({
			validCount: 1,
			average: 8,
			overall: 5.5,
		})
	})

	it('floors the mean before rounding the overall score', () => {
		expect(summarizeRatings([6, 7, 7])).toEqual({
			validCount: 3,
			average: 6.66,
			overall: 5.62,
		})
	})

	it('returns zeroed metrics when no rating is effective', () => {
		expect(summarizeRatings([0, Number.NaN])).toEqual({
			validCount: 0,
			average: 0,
			overall: 0,
		})
	})

	it('can shrink an already-normalized average', () => {
		expect(shrinkRatingAverage(6.66, 3)).toBe(5.62)
	})
})
