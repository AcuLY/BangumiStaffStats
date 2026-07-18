import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const componentUrl = new URL('./ComparisonRatingDistribution.vue', import.meta.url)
const source = existsSync(componentUrl) ? readFileSync(componentUrl, 'utf8') : ''

describe('ComparisonRatingDistribution structure', () => {
	it('matches the ranking score and time controls', () => {
		expect(source).toContain('aria-label="评分图表维度"')
		expect(source).toContain('<n-radio-button value="score">按分数</n-radio-button>')
		expect(source).toContain('<n-radio-button value="time">按时间</n-radio-button>')
		expect(source).toContain('aria-label="评分数据来源"')
		expect(source).toContain('<n-radio-button value="personal" :disabled="isGlobalQuery">我的分数</n-radio-button>')
		expect(source).toContain('<n-radio-button value="global">全站分数</n-radio-button>')
	})

	it('renders a concise legend and a quarterly comparison chart', () => {
		expect(source).toContain('buildQuarterlyRatingAverages')
		expect(source).toContain('class="comparison-time-chart__series"')
		expect(source).toContain('<i aria-hidden="true" /><b><template v-if="series.marker">{{ series.marker }} · </template>{{ series.label }}</b>')
		expect(source).not.toContain('series.ratedCount')
		expect(source).not.toContain('series.average')
	})
})
