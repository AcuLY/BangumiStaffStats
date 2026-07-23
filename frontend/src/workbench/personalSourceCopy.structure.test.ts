import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), 'utf8')

const ranking = read('./components/RankingWorkbench.vue')
const rankedList = read('./components/RankedPersonList.vue')
const cooperation = read('./components/SinglePersonCooperation.vue')
const analysis = read('./components/AnalysisDashboard.vue')
const selectedPersonCard = read('./components/SelectedPersonCard.vue')
const inspector = read('./components/PersonInspector.vue')
const sharedSummary = read('./components/SharedRatingSummary.vue')
const subjectTags = read('./components/SubjectTagSummary.vue')
const subjectBrowser = read('./components/SubjectWorkBrowser.vue')
const subjectWorks = read('./components/SubjectWorkList.vue')
const picker = read('./components/PersonPicker.vue')
const ratingChart = read('./components/RatingDistributionChart.vue')
const comparisonChart = read('./components/ComparisonRatingDistribution.vue')
const preferenceWorks = read('./components/PreferenceWorkList.vue')
const query = read('./components/QueryWorkspace.vue')

describe('rating source copy policy', () => {
	it('omits source qualifiers when the current mode already determines the only source', () => {
		expect(ranking).toContain("{ label: '均分', value: 'average' }")
		expect(ranking).toContain("const averageLabel = computed(() => '均分')")
		expect(rankedList).toContain("averageLabel: '均分'")
		expect(cooperation).toContain("const sourceScoreLabel = computed(() => '均分')")
		expect(selectedPersonCard).toContain("workbench.query.mergeSeries ? '参与系列' : workbench.query.isGlobal ? '参与作品' : '收藏作品'")
		expect(cooperation).toContain("workbench.query.isGlobal ? '评分' : '全站评分'")
		expect(selectedPersonCard).toContain('<dt class="metric-unit__label">均分</dt>')
		expect(analysis).toContain('<SelectedPersonCard')
		expect(cooperation).toContain('<SelectedPersonCard')
		expect(analysis).toContain("workbench.query.isGlobal ? '评分' : '全站评分'")
		expect(inspector).toContain("workbench.query.isGlobal ? '评分' : '全站评分'")
		expect(inspector).toContain("workbench.query.isGlobal ? '均分' : '全站均分'")
		expect(inspector).toContain("metric-unit__label\">{{ seriesMode ? '最高均分' : '最高评分' }}</small>")
		expect(inspector).toContain("metric-unit__label\">{{ seriesMode ? '最低均分' : '最低评分' }}</small>")
		expect(inspector).toContain('<h2 id="preference-title">相对偏好</h2>')
		expect(sharedSummary).toContain("props.showPersonal ? '全站均分' : '均分'")
		expect(sharedSummary).toContain("metric-unit__label\">{{ props.seriesMode ? '最高均分' : '最高评分' }}</dt>")
		expect(sharedSummary).toContain("metric-unit__label\">{{ props.seriesMode ? '最低均分' : '最低评分' }}</dt>")
		expect(subjectTags).toContain('<strong>收藏标签</strong>')
		expect(subjectBrowser).toContain("|| '仅显示序号、双语名和评分'")
		expect(subjectWorks).toContain("const currentScoreLabel = (subject: Subject) => subject.series ? '均分' : '评分'")
		for (const source of [ratingChart, comparisonChart]) {
			expect(source).toContain("props.isGlobalQuery ? '评分' : '全站评分'")
		}
		expect(query).toContain("option.key === 'globalRate' && workbench.queryDraft.isGlobal ? '评分范围' : option.title")
		expect(query).toContain("minLabel: '评分下限', maxLabel: '评分上限'")

		for (const source of [ranking, rankedList, cooperation, analysis, selectedPersonCard, inspector, sharedSummary, subjectTags]) {
			expect(source).not.toContain('我的收藏')
			expect(source).not.toContain('我的最高')
			expect(source).not.toContain('我的最低')
			expect(source).not.toContain('我的偏好')
			expect(source).not.toContain('我的收藏标签')
		}
	})

	it('keeps 我的 where personal and full-site sources are directly contrasted', () => {
		expect(picker).toContain("{ label: '我的均分', value: 'average' as const }")
		expect(picker).toContain("{ label: workbench.query.isGlobal ? '均分' : '全站均分', value: 'globalAverage' }")
		expect(sharedSummary).toContain("props.showPersonal ? '全站均分' : '均分'")
		expect(sharedSummary).toContain('metric-unit__label">我的均分</dt>')
		expect(inspector).toContain("workbench.query.isGlobal ? '均分' : '全站均分'")
		expect(inspector).toContain('metric-unit__label">我的均分</small>')
		expect(subjectWorks).toContain("workbench.query.isGlobal ? subject.series ? '均分' : '评分' : subject.series ? '全站均分' : '全站评分'")
		expect(subjectWorks).toContain("<dt>{{ subject.series ? '我的均分' : '我的评分' }}</dt>")
		for (const source of [ratingChart, comparisonChart]) {
			expect(source).toContain('<n-radio-button value="personal">我的评分</n-radio-button>')
			expect(source).toContain('<n-radio-button value="global">全站评分</n-radio-button>')
		}
		expect(preferenceWorks).toContain("{{ seriesMode ? '我的均分' : '我的评分' }} {{ formatPersonalScore(item.userScore) }} · {{ seriesMode ? '全站均分' : '全站评分' }}")
		expect(query).toContain("{ key: 'userRate', title: '我的评分范围'")
		expect(query).toContain("{ key: 'globalRate', title: '全站评分范围'")
	})

	it('uses 我的 rather than 个人 in direct rating comparisons', () => {
		for (const source of [analysis, inspector, query]) {
			expect(source).not.toContain('个人评分')
			expect(source).not.toContain('个人－全站')
		}
		expect(analysis).toContain('我的评分与有效全站评分')
		expect(inspector).toContain('我的评分与有效全站评分')
		expect(query).toContain('我的评分减去全站评分')
		expect(query).toContain('我的评分与全站评分差范围')
	})

	it('uses generic rating-count copy because it has no personal counterpart', () => {
		expect(query).toContain("key: 'ratingCount'")
		expect(query).toContain("title: '评分人数范围'")
		expect(query).toContain("minLabel: '评分人数下限', maxLabel: '评分人数上限'")
		expect(query).not.toContain('全站评分人数')
	})
})
