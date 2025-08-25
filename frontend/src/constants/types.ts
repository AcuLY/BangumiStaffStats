const INPUT_TYPE = {
	USER_ID: 'user-id',
	SUBJECT_TYPE: 'subject-type',
	POSITION: 'position',
	COLLECTION_TYPES: 'collection-types',
	IS_GLOBAL: 'is-global',
	SHOW_NSFW: 'show-nsfw',
	DATE_RANGE: 'date-range',
	RATE_RANGE: 'rate-range',
	FAVORITE_RANGE: 'favorite-range',
	POSITIVE_TAGS: 'positive-tags',
	NEGATIVE_TAGS: 'negative-tags',
}
type InputType = (typeof INPUT_TYPE)[keyof typeof INPUT_TYPE]

const SUBJECT_TYPE = {
	BOOK: 1,
	ANIME: 2,
	MUSIC: 3,
	GAME: 4,
	REAL: 6,
}
type SubjectType = (typeof SUBJECT_TYPE)[keyof typeof SUBJECT_TYPE]

const COLLECTION_TYPE = {
	DONE: 2,
	DOING: 3,
	ON_HOLD: 4,
	DROPPED: 5,
}
type CollectionType = (typeof COLLECTION_TYPE)[keyof typeof COLLECTION_TYPE]

const STATISTIC_TYPE = {
	SUBJECT: 1,
	SERIES: 2,
	CHARACTER: 3,
}
type StatisticType = (typeof STATISTIC_TYPE)[keyof typeof STATISTIC_TYPE]

const SORT_TYPE = {
	COUNT: 1,
	AVERAGE: 2,
	OVERALL: 3,
}
type SortType = (typeof SORT_TYPE)[keyof typeof SORT_TYPE]

export { INPUT_TYPE, SUBJECT_TYPE, COLLECTION_TYPE, STATISTIC_TYPE, SORT_TYPE }

export type { InputType, SubjectType, CollectionType, StatisticType, SortType }
