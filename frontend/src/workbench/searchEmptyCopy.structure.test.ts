import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { RESULT_EMPTY_COPY, SEARCH_EMPTY_COPY } from './searchEmptyCopy'

const read = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), 'utf8')

describe('search empty copy', () => {
	it('uses one punctuation-free message for each searchable entity', () => {
		expect(SEARCH_EMPTY_COPY).toEqual({
			person: '没有符合搜索条件的人物',
			work: '没有符合搜索条件的作品',
			character: '没有符合搜索条件的角色',
		})
		expect(Object.values(SEARCH_EMPTY_COPY).every((copy) => !/[。.!！?？]$/.test(copy))).toBe(true)
		expect(RESULT_EMPTY_COPY).toEqual({
			person: '没有符合条件的人物',
			work: '没有符合条件的作品',
			character: '没有符合条件的角色',
		})
		expect(Object.values(RESULT_EMPTY_COPY).every((copy) => !/[。.!！?？]$/.test(copy))).toBe(true)
	})

	it('reuses the shared messages across all seven search entry points', () => {
		const ranking = read('./components/RankingWorkbench.vue')
		const picker = read('./components/PersonPicker.vue')
		const cooperation = read('./components/SinglePersonCooperation.vue')
		const analysis = read('./components/AnalysisDashboard.vue')
		const inspector = read('./components/PersonInspector.vue')

		expect(ranking).toContain('SEARCH_EMPTY_COPY.person')
		expect(picker).toContain('SEARCH_EMPTY_COPY.person')
		expect(cooperation).toContain("partnerSearch.trim() ? SEARCH_EMPTY_COPY.person")
		expect(cooperation).toContain("workSearch.trim() ? SEARCH_EMPTY_COPY.work")
		expect(analysis).toContain("sharedSearch.trim() ? SEARCH_EMPTY_COPY.work")
		expect(inspector).toContain('SEARCH_EMPTY_COPY.character')
		expect(inspector).toContain('SEARCH_EMPTY_COPY.work')
		expect(ranking).toContain('SEARCH_EMPTY_COPY.person : RESULT_EMPTY_COPY.person')
		expect(inspector).toContain('SEARCH_EMPTY_COPY.person : RESULT_EMPTY_COPY.person')
		expect(cooperation).toContain('SEARCH_EMPTY_COPY.person : RESULT_EMPTY_COPY.person')
		expect(cooperation).toContain('SEARCH_EMPTY_COPY.work : RESULT_EMPTY_COPY.work')
		expect(analysis).toContain('SEARCH_EMPTY_COPY.work : RESULT_EMPTY_COPY.work')
		expect(ranking).not.toContain('查询没有匹配人物')
		expect(inspector).not.toContain('查询没有匹配人物')
		expect(cooperation).not.toMatch(/没有符合条件的合作(?:人物|作品)/)
		expect(analysis).not.toContain('没有符合条件的共同作品')
	})
})
