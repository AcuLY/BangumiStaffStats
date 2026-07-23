import { describe, expect, it } from 'vitest'
import { overallScoreExplanation, preferenceExplanation } from './metricExplanations'

describe('metric explanations', () => {
	it('adds the current person calculation to the overall-score model', () => {
		expect(overallScoreExplanation({
			isGlobal: false,
			seriesMode: false,
			average: 7.5,
			validCount: 10,
			overall: 6.67,
		})).toContain('本人物：（均分 7.50 × 已评分作品 10 部 + 5 分 × 中性作品 5 部）÷ 15 = 综合分 6.67')
	})

	it('adds the current person evidence to the preference model', () => {
		expect(preferenceExplanation({
			seriesMode: true,
			summary: {
				comparableCount: 14,
				comparableSeriesCount: 10,
				effectiveEvidence: 10,
				evidenceWeight: 2 / 3,
				mean: 0.5,
				score: 0.33,
			},
		})).toContain('本人物：平均偏差 +0.50 × 样本权重 10/15 = 偏好分 +0.33（10 个有效系列，涉及 14 部作品）')
	})

	it('keeps all info explanations free of Chinese periods', () => {
		expect(overallScoreExplanation({ isGlobal: true, seriesMode: false })).not.toContain('。')
		expect(preferenceExplanation({ seriesMode: false })).not.toContain('。')
	})
})
