import { nextTick, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import type { Subject } from '../types'
import {
	compareSubjectNumber,
	compareSubjectText,
	useSubjectWorkBrowser,
} from './useSubjectWorkBrowser'

const subjects: Subject[] = [
	{ id: 1, nameCN: '第一部', score: 7.2, collection: { rate: 8 } },
	{ id: 2, nameCN: '第二 部', score: 8.4, collection: { rate: 6 } },
	{ id: 3, nameCN: '未评分', score: 0, collection: { rate: 0 } },
]

describe('useSubjectWorkBrowser', () => {
	it('shares filtering, sorting and pagination state without fixing page-specific fields', async () => {
		const source = ref(subjects)
		const browser = useSubjectWorkBrowser<'personal' | 'title'>({
			subjects: source,
			searchTerms: (subject) => [subject.nameCN],
			initialSort: 'personal',
			initialPageSize: 2,
			comparators: {
				personal: (a, b, direction) => compareSubjectNumber(a.collection?.rate, b.collection?.rate, direction),
				title: (a, b, direction) => compareSubjectText(a.nameCN, b.nameCN, direction),
			},
		})

		expect(browser.sortedSubjects.value.map((subject) => subject.id)).toEqual([1, 2, 3])
		expect(browser.visibleSubjects.value.map((subject) => subject.id)).toEqual([1, 2])

		browser.page.value = 2
		browser.search.value = '第二-部'
		await nextTick()

		expect(browser.page.value).toBe(1)
		expect(browser.sortedSubjects.value.map((subject) => subject.id)).toEqual([2])
		expect(browser.rangeLabel.value).toBe('1—1 / 1')
	})

	it('keeps missing numeric values last in either direction', () => {
		expect(compareSubjectNumber(0, 8, 1)).toBe(1)
		expect(compareSubjectNumber(0, 8, -1)).toBe(1)
		expect(compareSubjectNumber(8, 0, 1)).toBe(-1)
		expect(compareSubjectNumber(8, 0, -1)).toBe(-1)
	})
})
