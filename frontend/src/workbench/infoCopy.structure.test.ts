import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), 'utf8')

const query = read('./components/QueryWorkspace.vue')
const inspector = read('./components/PersonInspector.vue')
const cooperation = read('./components/SinglePersonCooperation.vue')
const ratingChart = read('./components/RatingDistributionChart.vue')
const comparisonChart = read('./components/ComparisonRatingDistribution.vue')
const metricExplanations = read('./domain/metricExplanations.ts')

describe('info copy', () => {
	it('keeps query help concise and omits Chinese periods', () => {
		expect(query).toContain("help: '我的评分减去全站评分；正数表示你打得更高，负数表示更低'")
		expect(query).not.toContain('仅统计双方都有评分的条目')
		for (const copy of [
			'按收藏记录最后更新时间筛选；修改收藏状态、评分或短评都会更新时间，不等同于首次收藏时间',
			'按续作关系把条目合并为系列；人物、共同范围和数量按系列去重，系列评分取当前范围内成员作品的均分',
			'按作品的全站有效评分人数筛选；该条件只过滤作品，不参与综合分加权',
			'每个正向标签项都必须命中；同一项中用 / 分隔表示满足任一标签',
			'命中任一反向标签项即排除；同一项中用 + 分隔表示同时包含这些标签时才排除',
			'仅统计同时具备全部已选职位的人物；参与作品按已选职位合并并去重',
			'每个职位分别生成候选人物；第一项作为默认浏览职位',
			'进入 Bangumi 个人主页，取网址 /user/ 后的一段；例如 bgm.tv/user/lucay126 的 UID 是 lucay126',
			'UID 是 Bangumi 个人主页地址中 /user/ 后的标识，不是昵称',
		]) {
			expect(query).toContain(copy)
			expect(query).not.toContain(`${copy}。`)
		}
	})

	it('explains both metric models and their current calculations', () => {
		expect(inspector).toContain('overallScoreExplanation({')
		expect(inspector).toContain('preferenceExplanation({')
		expect(metricExplanations).toContain('避免样本很少时均分过度靠前`')
		expect(metricExplanations).toContain('避免样本很少时偏好分过度极端`')
		expect(metricExplanations).toContain("options.subjectLabel ?? '本人物'")
		expect(metricExplanations).not.toContain('。')
	})

	it('makes cooperation metrics and chart encodings discoverable', () => {
		expect(cooperation).toContain(':aria-label="`合作人物指标说明：${cooperationMetricHelp}`"')
		expect(cooperation).toContain("subjectLabel: '当前合作人物'")
		expect(ratingChart).toContain('圆点表示单部作品评分 · 折线表示季度均分')
		expect(comparisonChart).toContain('圆点与折线均表示各对比系列的季度均分')
	})
})
