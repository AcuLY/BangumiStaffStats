export interface RatingSummary {
	validCount: number
	average: number
	overall: number
}

const floorTwo = (value: number) => Math.floor(value * 100) / 100
const roundTwo = (value: number) => Math.round(value * 100) / 100

export const shrinkRatingAverage = (average: number, validCount: number) => validCount > 0
	? roundTwo((validCount * average + 25) / (validCount + 5))
	: 0

/** Matches the backend score contract: ignore unrated values, floor the mean, then shrink it. */
export function summarizeRatings(values: number[]): RatingSummary {
	const valid = values.filter((value) => Number.isFinite(value) && value > 0)
	if (!valid.length) return { validCount: 0, average: 0, overall: 0 }

	const average = floorTwo(valid.reduce((sum, value) => sum + value, 0) / valid.length)
	const overall = shrinkRatingAverage(average, valid.length)
	return { validCount: valid.length, average, overall }
}
