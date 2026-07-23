import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), 'utf8')

const ranking = read('./components/RankingWorkbench.vue')
const picker = read('./components/PersonPicker.vue')
const inspector = read('./components/PersonInspector.vue')
const analysis = read('./components/AnalysisDashboard.vue')
const cooperation = read('./components/SinglePersonCooperation.vue')
const coStarWorkbench = read('./components/CoStarWorkbench.vue')
const workbenchHeader = read('./components/WorkbenchHeader.vue')
const workbenchPage = read('../../person-workbench.html')
const query = read('./components/QueryWorkspace.vue')
const queryDate = read('./components/QueryDateRange.vue')
const browser = read('./composables/useSubjectWorkBrowser.ts')

describe('confirmed selector and placeholder decisions', () => {
	it('uses only the approved short visible placeholders', () => {
		expect(ranking).toContain('search-placeholder="搜索人物"')
		expect(picker).toContain('placeholder="搜索人物"')
		expect(cooperation).toContain('search-placeholder="搜索人物"')
		expect(cooperation).toContain(":search-placeholder=\"seriesMode ? '搜索系列或系列内作品' : '搜索作品'\"")
		expect(analysis).toContain(":search-placeholder=\"seriesMode ? '搜索系列或系列内作品' : '搜索作品'\"")
		expect(inspector).toContain(": seriesMode.value ? '搜索系列或系列内作品' : '搜索作品'")
		expect(queryDate).toContain('placeholder="选择年代"')
		expect(query).toContain('placeholder="不是昵称"')
		expect(query).toContain("? '选择排行职位' : '选择参与职位'")

		for (const source of [ranking, picker, inspector, analysis, cooperation]) {
			expect(source).not.toContain('搜索人物或 ID')
			expect(source).not.toContain('筛选当前结果…')
			expect(source).not.toContain('搜索中日文标题')
		}
	})

	it('keeps detailed search semantics outside the shortened visible placeholders', () => {
		expect(ranking).toContain('search-aria-label="搜索排行人物"')
		expect(picker).toContain(':aria-label="`搜索${candidatePositionLabel}候选人物`"')
		expect(cooperation).toContain('search-aria-label="搜索合作人物"')
		expect(cooperation).toContain(":search-aria-label=\"seriesMode ? '搜索合作系列或系列内作品' : '搜索合作作品'\"")
		expect(analysis).toContain(":search-aria-label=\"seriesMode ? '搜索共同系列或系列内作品' : '搜索共同作品'\"")
		expect(inspector).toContain("creditView.value === 'characters' ? '搜索配音角色' : seriesMode.value ? '搜索参与系列或系列内作品' : '搜索参与作品'")
	})

	it('uses the exact public mode name everywhere covered by the workbench shell', () => {
		expect(workbenchHeader).toContain("{ value: 'co-star', label: '共演分析' }")
		expect(coStarWorkbench).toContain('aria-label="共演分析"')
		expect(workbenchPage).toContain('<meta name="description" content="Bangumi Staff Statistics 人物排行与共演分析静态原型"')
		for (const source of [workbenchHeader, coStarWorkbench, workbenchPage]) {
			expect(source).not.toContain('共同分析')
			expect(source).not.toContain('共演分析结果')
		}
	})

	it('uses the same multi-select interaction for ranking and co-star positions', () => {
		expect(query).toMatch(/<n-select[\s\S]*?v-model:value="draftPositions"[\s\S]*?multiple[\s\S]*?:placeholder="workbench\.mode\.value === 'ranking' \? '选择排行职位' : '选择参与职位'"/)
	})

	it('keeps only 5, 10 and 20 in people, work and character page-size selectors', () => {
		expect(ranking).toContain('const pageSizeOptions = [5, 10, 20]')
		expect(picker).toContain('const candidatePageSizeOptions = [5, 10, 20]')
		expect(cooperation).toContain('const partnerPageSizeOptions = [5, 10, 20]')
		expect(inspector).toContain('const CHARACTER_PAGE_SIZES = [5, 10, 20]')
		expect(browser).toContain('export const SUBJECT_WORK_PAGE_SIZES = [5, 10, 20]')
		for (const source of [ranking, picker, cooperation, inspector, browser]) {
			expect(source).not.toMatch(/(?:PageSizeOptions|PAGE_SIZES)\s*=\s*\[[^\]]*50/)
		}
	})

	it('drops works without collection timestamps only while sorting by collection date', () => {
		for (const source of [inspector, analysis, cooperation]) {
			expect(source).toContain("includeSubject: (subject, sort) => sort !== 'date' || Boolean(subject.collection?.updatedAt)")
			expect(source).toContain('compareSubjectText(a.collection?.updatedAt, b.collection?.updatedAt, direction)')
			expect(source).not.toContain('collection?.updatedAt ?? a.date')
		}
	})

	it('extends the current work sorts with series member count only in series mode', () => {
		expect(inspector).toContain("type WorkSort = 'score' | 'personal' | 'date' | 'seriesCount'")
		expect(inspector).toContain("...(seriesMode.value ? [{ label: '系列作品数量', value: 'seriesCount' as const }] : [])")
		expect(inspector).toContain('seriesCount: (a, b, direction) => compareSubjectNumber(a.series?.members.length, b.series?.members.length, direction)')
		expect(inspector).toContain("!isSeries && workSort.value === 'seriesCount'")
	})

	it('keeps rejected low-value dimensions out of sorting selectors', () => {
		expect(picker).not.toContain("{ label: '人物名', value: 'name' }")
		expect(inspector).not.toContain("{ label: '收藏人数', value: 'collects' }")
		expect(inspector).not.toContain("{ label: 'Bangumi Rank', value: 'rank' }")
		for (const source of [analysis, cooperation]) {
			expect(source).not.toContain("{ label: '作品标题', value: 'title' }")
		}
	})
})
