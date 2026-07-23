import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), 'utf8')

const stateSources = [
	read('./searchEmptyCopy.ts'),
	read('./WorkbenchApp.vue'),
	read('./components/SubjectTagSummary.vue'),
	read('./components/SubjectWorkList.vue'),
	read('./components/RankingWorkbench.vue'),
	read('./components/PersonInspector.vue'),
	read('./components/AnalysisDashboard.vue'),
	read('./components/RatingDistributionChart.vue'),
	read('./components/ComparisonRatingDistribution.vue'),
	read('./components/PreferenceWorkList.vue'),
].join('\n')

const singleSentenceStateCopy = [
	'请稍后重试',
	'正在准备人物、作品与职位信息',
	'暂无可用标签',
	'没有符合条件的作品',
	'没有符合条件的人物',
	"没有同时具备我的评分与有效全站评分的{{ seriesMode ? '系列' : '作品' }}",
	"暂无全员共同{{ seriesMode ? '系列' : '作品' }}",
	"共同{{ seriesMode ? '系列' : '作品' }}中没有同时具备我的评分与有效全站评分的{{ seriesMode ? '系列' : '作品' }}",
	'没有同时具备播出时间和${sourceLabel.value}的作品',
	'没有可用于统计的{{ sourceLabel }}',
	'没有可用于比较的{{ sourceLabel }}',
	"没有高于全站{{ seriesMode ? '均分的系列' : '评分的作品' }}",
	"没有低于全站{{ seriesMode ? '均分的系列' : '评分的作品' }}",
]

describe('single-sentence state copy punctuation', () => {
	it('omits terminal periods from empty, missing-data, loading, and error states', () => {
		for (const copy of singleSentenceStateCopy) {
			expect(stateSources).toContain(copy)
			expect(stateSources).not.toContain(`${copy}。`)
		}
	})

	it('does not interpolate record values into state copy', () => {
		expect(stateSources).not.toContain('${props.personName}没有同时具备播出时间')
	})
})
