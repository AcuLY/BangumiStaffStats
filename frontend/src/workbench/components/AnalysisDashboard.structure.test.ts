import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./AnalysisDashboard.vue', import.meta.url), 'utf8')

describe('AnalysisDashboard section structure', () => {
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

	it('shows only the four ranking-style shared-work metrics', () => {
		expect(source).not.toContain('id="rating-title"')
		expect(source).not.toContain('aria-labelledby="rating-title"')
		expect(source).not.toContain('从总体评分、分布和多人组合三个层次比较共同作品。')

		const match = source.match(
			/<div class="[^"]*\bprofile-metrics\b[^"]*\bprofile-metrics--extended\b[^"]*" aria-label="共同作品评分概览">([\s\S]*?)<\/div>/,
		)
		expect(match).not.toBeNull()

		const labels = [...(match?.[1] ?? '').matchAll(/<small>([^<]+)<\/small>/g)]
			.map((item) => item[1])

		expect(labels).toEqual(['共同作品', '已评作品', '全站均分', '我的均分'])
	})

	it('delegates rating comparison with shared works first', () => {
		expect(source).toContain("import ComparisonRatingDistribution from './ComparisonRatingDistribution.vue'")
		expect(source).toContain('<ComparisonRatingDistribution')
		expect(source).toContain('return [sharedWorks, ...people]')
		expect(source).not.toContain('人物与共同作品 · 1–10 分同组同轴对比。')
		expect(source).not.toContain('均分 {{ formatScore(series.average) }} · {{ series.ratedCount }} 部已评')
	})
})
