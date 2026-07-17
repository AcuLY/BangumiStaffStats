import type { Subject } from '../types'

export type RatingSource = 'personal' | 'global'

export interface SubjectQuarter {
	year: number
	month: number
	quarter: number
	quarterIndex: number
}

export interface QuarterlyRatingPoint extends SubjectQuarter {
	subject: Subject
	score: number
	date: string
}

export interface QuarterlyRatingAverage extends SubjectQuarter {
	average: number
	works: QuarterlyRatingPoint[]
}

export const subjectRating = (subject: Subject, source: RatingSource) => {
	const score = Number(source === 'personal' ? subject.collection?.rate : subject.score)
	return Number.isFinite(score) && score >= 1 && score <= 10 ? score : null
}

export const buildScoreDistribution = (subjects: Subject[], source: RatingSource) => {
	const buckets = Array.from({ length: 10 }, (_, index) => ({ label: String(index + 1), value: 0 }))
	for (const subject of subjects) {
		const score = subjectRating(subject, source)
		if (score === null) continue
		const bucket = Math.min(10, Math.max(1, Math.round(score)))
		buckets[bucket - 1].value += 1
	}
	return buckets
}

export const subjectQuarter = (date?: string): SubjectQuarter | null => {
	const match = String(date ?? '').trim().match(/^(\d{4})(?:-(\d{1,2}))?/)
	if (!match) return null
	const year = Number(match[1])
	const month = Number(match[2] || 1)
	if (!Number.isInteger(year) || year < 1900 || year > 2200 || !Number.isInteger(month) || month < 1 || month > 12) return null
	const quarter = Math.floor((month - 1) / 3) + 1
	return {
		year,
		month,
		quarter,
		quarterIndex: year * 4 + quarter - 1,
	}
}

export const buildQuarterlyRatingPoints = (subjects: Subject[], source: RatingSource): QuarterlyRatingPoint[] => subjects
	.map((subject): QuarterlyRatingPoint | null => {
		const score = subjectRating(subject, source)
		const quarter = subjectQuarter(subject.date)
		if (score === null || !quarter) return null
		return {
			...quarter,
			subject,
			score,
			date: String(subject.date),
		}
	})
	.filter((point): point is QuarterlyRatingPoint => Boolean(point))
	.sort((left, right) => left.date.localeCompare(right.date)
		|| left.subject.id - right.subject.id)

export const buildQuarterlyRatingAverages = (subjects: Subject[], source: RatingSource): QuarterlyRatingAverage[] => {
	const groups = new Map<number, QuarterlyRatingPoint[]>()
	for (const point of buildQuarterlyRatingPoints(subjects, source)) {
		const group = groups.get(point.quarterIndex) ?? []
		group.push(point)
		groups.set(point.quarterIndex, group)
	}

	return [...groups.entries()]
		.sort((left, right) => left[0] - right[0])
		.map(([, works]) => ({
			year: works[0].year,
			month: works[0].month,
			quarter: works[0].quarter,
			quarterIndex: works[0].quarterIndex,
			average: works.reduce((sum, point) => sum + point.score, 0) / works.length,
			works,
		}))
}
