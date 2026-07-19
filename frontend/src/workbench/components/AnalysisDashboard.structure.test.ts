import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./AnalysisDashboard.vue', import.meta.url), 'utf8')
const summarySource = readFileSync(new URL('./SharedRatingSummary.vue', import.meta.url), 'utf8')

describe('AnalysisDashboard section structure', () => {
	it('keeps passive analysis empty states free of CTA buttons', () => {
		const noSelectionState = source.match(/<div v-if="!workbench\.selectedPeople\.value\.length"[\s\S]*?<\/div>/)?.[0] ?? ''
		const noSharedWorksState = source.match(/<section v-if="!workbench\.sharedSubjects\.value\.length"[\s\S]*?<\/section>/)?.[0] ?? ''

		expect(noSelectionState).not.toContain('<n-button')
		expect(noSharedWorksState).not.toContain('<n-button')
	})

	it('places work tags before ratings and uses the ranking-style preference section', () => {
		const tagsIndex = source.indexOf('heading-id="analysis-tags-title"')
		const ratingsIndex = source.indexOf('aria-label="评分表现"')

		expect(tagsIndex).toBeGreaterThan(-1)
		expect(ratingsIndex).toBeGreaterThan(-1)
		expect(tagsIndex).toBeLessThan(ratingsIndex)
		expect(source).toContain('title="作品标签"')
		expect(source).toContain('<h2 id="shared-preference-title">相对偏好</h2>')
		expect(source).not.toContain('preference-model-info')
		expect(source).not.toContain('仅基于当前人物的共同作品')
		expect(source).not.toContain('class="preference-overview"')
	})

	it('reuses one six-metric shared-work summary in the pair and group placements', () => {
		expect(source).not.toContain('id="rating-title"')
		expect(source).not.toContain('aria-labelledby="rating-title"')
		expect(source).not.toContain('从总体评分、分布和多人组合三个层次比较共同作品。')
		expect(source).not.toContain('class="profile-metrics profile-metrics--extended rating-summary"')
		expect([...source.matchAll(/<SharedRatingSummary/g)]).toHaveLength(2)
		expect(source).toContain('v-if="workbench.selectedPeople.value.length === 2 && index === 0"')
		expect(source).toContain('v-if="workbench.selectedPeople.value.length > 2"')
		expect(source).toContain('placement="pair"')
		expect(source).toContain('placement="below"')

		const labels = [...summarySource.matchAll(/<dt>([^<]+)<\/dt>/g)]
			.map((item) => item[1])

		expect(labels).toEqual(['共同作品', '已评作品', '全站均分', '我的均分', '我的最高', '我的最低'])
	})

	it('delegates rating comparison with shared works first', () => {
		expect(source).toContain("import ComparisonRatingDistribution from './ComparisonRatingDistribution.vue'")
		expect(source).toContain('<ComparisonRatingDistribution')
		expect(source).toContain("const seriesColors = ['#c60475', '#158486', '#d15c56', '#8f68cb', '#a77400', '#549957', '#1a89c5', '#6b70c5', '#d55e89', '#b9683d']")
		expect(source).toContain('return [sharedWorks, ...people]')
		expect(source).not.toContain('人物与共同作品 · 1–10 分同组同轴对比。')
		expect(source).not.toContain('均分 {{ formatScore(series.average) }} · {{ series.ratedCount }} 部已评')
	})
})
