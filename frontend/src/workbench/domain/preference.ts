export interface PreferenceObservation {
	subjectId: number
	userScore: number
	globalScore: number
	seriesId?: number | string
}

export interface PreferenceContribution {
	subjectId: number
	seriesId?: number | string
	userScore: number
	globalScore: number
	difference: number
}

export interface PreferenceSummary {
	comparableCount: number
	comparableSeriesCount: number
	effectiveEvidence: number
	evidenceWeight: number
	mean: number | null
	score: number | null
}

export interface PreferenceOptions {
	priorWorkCount: number
	mergeSeries: boolean
}

const SCORE_MIN = 1
const SCORE_MAX = 10

export const DEFAULT_PREFERENCE_OPTIONS: Readonly<PreferenceOptions> = Object.freeze({
	priorWorkCount: 5,
	mergeSeries: false,
})

const isFiniteScore = (value: number) => Number.isFinite(value) && value >= SCORE_MIN && value <= SCORE_MAX

const cleanNumber = (value: number) => Object.is(value, -0) ? 0 : value

const finiteOrDefault = (value: number | undefined, fallback: number, minimum = 0) =>
	Number.isFinite(value) && Number(value) >= minimum ? Number(value) : fallback

function resolveOptions(options: Partial<PreferenceOptions> = {}): PreferenceOptions {
	return {
		priorWorkCount: finiteOrDefault(options.priorWorkCount, DEFAULT_PREFERENCE_OPTIONS.priorWorkCount),
		mergeSeries: options.mergeSeries ?? DEFAULT_PREFERENCE_OPTIONS.mergeSeries,
	}
}

function normalizedSeriesId(value: PreferenceObservation['seriesId']) {
	if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
	if (typeof value !== 'string') return undefined
	const trimmed = value.trim()
	return trimmed ? trimmed : undefined
}

export function normalizePreferenceObservations(input: PreferenceObservation[]): PreferenceObservation[] {
	const bySubjectId = new Map<number, PreferenceObservation>()

	for (const source of input) {
		const subjectId = Number(source.subjectId)
		const userScore = Number(source.userScore)
		const globalScore = Number(source.globalScore)
		if (!Number.isFinite(subjectId) || !isFiniteScore(userScore) || !isFiniteScore(globalScore)) continue

		const observation: PreferenceObservation = { subjectId, userScore, globalScore }
		const seriesId = normalizedSeriesId(source.seriesId)
		if (seriesId !== undefined) observation.seriesId = seriesId
		bySubjectId.set(subjectId, observation)
	}

	return [...bySubjectId.values()].sort((left, right) => left.subjectId - right.subjectId)
}

function contributionFromObservation(
	observation: PreferenceObservation,
): PreferenceContribution {
	return {
		subjectId: observation.subjectId,
		seriesId: observation.seriesId,
		userScore: observation.userScore,
		globalScore: observation.globalScore,
		difference: cleanNumber(observation.userScore - observation.globalScore),
	}
}

export function preferenceContribution(
	observation: PreferenceObservation,
): PreferenceContribution | null {
	const normalized = normalizePreferenceObservations([observation])[0]
	return normalized ? contributionFromObservation(normalized) : null
}

function naturalSeriesKey(contribution: PreferenceContribution) {
	if (typeof contribution.seriesId === 'number') return `series:number:${contribution.seriesId}`
	if (typeof contribution.seriesId === 'string') return `series:string:${contribution.seriesId}`
	return `subject:${contribution.subjectId}`
}

function aggregationKey(contribution: PreferenceContribution, mergeSeries: boolean) {
	return mergeSeries ? naturalSeriesKey(contribution) : `subject:${contribution.subjectId}`
}

export function summarizePreference(
	observations: PreferenceObservation[],
	options: Partial<PreferenceOptions> = {},
): PreferenceSummary {
	const resolved = resolveOptions(options)
	const contributions = normalizePreferenceObservations(observations)
		.map((observation) => contributionFromObservation(observation))
	const naturalSeries = new Set(contributions.map(naturalSeriesKey))
	const groupedDifferences = new Map<string, number[]>()

	for (const contribution of contributions) {
		const key = aggregationKey(contribution, resolved.mergeSeries)
		const differences = groupedDifferences.get(key) ?? []
		differences.push(contribution.difference)
		groupedDifferences.set(key, differences)
	}

	const unitMeans = [...groupedDifferences.values()].map((differences) =>
		differences.reduce((sum, difference) => sum + difference, 0) / differences.length)
	const evidenceCount = unitMeans.length
	if (!evidenceCount) {
		return {
			comparableCount: 0,
			comparableSeriesCount: 0,
			effectiveEvidence: 0,
			evidenceWeight: 0,
			mean: null,
			score: null,
		}
	}

	const differenceTotal = unitMeans.reduce((sum, difference) => sum + difference, 0)
	const denominator = evidenceCount + resolved.priorWorkCount
	return {
		comparableCount: contributions.length,
		comparableSeriesCount: naturalSeries.size,
		effectiveEvidence: evidenceCount,
		evidenceWeight: cleanNumber(evidenceCount / denominator),
		mean: cleanNumber(differenceTotal / evidenceCount),
		score: cleanNumber(differenceTotal / denominator),
	}
}
