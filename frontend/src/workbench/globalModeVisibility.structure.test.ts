import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), 'utf8')

const ranking = read('./components/RankingWorkbench.vue')
const rankedList = read('./components/RankedPersonList.vue')
const inspector = read('./components/PersonInspector.vue')
const analysis = read('./components/AnalysisDashboard.vue')
const cooperation = read('./components/SinglePersonCooperation.vue')
const subjectWorks = read('./components/SubjectWorkList.vue')
const subjectTags = read('./components/SubjectTagSummary.vue')
const sharedSummary = read('./components/SharedRatingSummary.vue')
const ratingChart = read('./components/RatingDistributionChart.vue')
const comparisonChart = read('./components/ComparisonRatingDistribution.vue')
const workbench = read('./composables/useWorkbench.ts')

describe('full-site mode visibility and rating source contract', () => {
	it('uses global averages and effective global rating counts for ranking values', () => {
		expect(workbench).toContain('? Number(person.globalRatedSubjectCount || 0)')
		expect(workbench).toContain('? Number(person.globalAverage || 0)')
		expect(workbench).toContain('globalRatedSubjectCount: globalSummary.validCount')
		expect(workbench).toContain('globalAverage: globalSummary.average')
		expect(ranking).toContain("{ label: '均分', value: 'average' }")
		expect(ranking).toContain("const averageLabel = computed(() => '均分')")
	})

	it('renders three ranking metrics in full-site mode and no preference placeholder', () => {
		expect(rankedList).toContain('<span v-if="showPreference">偏好</span>')
		expect(rankedList).toContain('<span v-if="showPreference" class="person-row__metric"')
		expect(rankedList).toContain("...(showPreference.value ? [`相对偏好 ${formatPreference(person)}`] : [])")
	})

	it('removes personal-only sections, controls and work metadata instead of disabling them', () => {
		expect(inspector).toContain('<section v-if="!workbench.query.isGlobal" class="inspector-section" aria-labelledby="preference-title">')
		expect(analysis).toContain('workbench.sharedSubjects.value.length && !workbench.query.isGlobal')
		expect(cooperation).toContain("...(workbench.query.isGlobal ? [] : [{ label: '相对偏好'")
		expect(cooperation).toContain("...(workbench.query.isGlobal ? [] : [{ label: '偏好分最高'")
		expect(subjectWorks).toContain('v-if="!workbench.query.isGlobal && !subject.series" class="subject-work-row__collection-meta"')
		expect(subjectWorks).toContain('v-if="!workbench.query.isGlobal" class="subject-work-row__score subject-work-row__score--mine"')
		expect(subjectTags).toContain('<div v-if="showPersonal" class="tag-row"><strong>收藏标签</strong>')
		expect(sharedSummary).toContain("<div v-if=\"props.showPersonal\" class=\"metric-unit\"><dd class=\"metric-unit__value\">{{ props.ratedCount }}</dd><dt class=\"metric-unit__label\">{{ props.seriesMode ? '已评系列' : '已评作品' }}</dt>")
		expect(analysis).toContain(':show-personal="!workbench.query.isGlobal"')
		expect(inspector).toContain("<span v-if=\"!workbench.query.isGlobal\" class=\"metric-unit\"><small class=\"metric-unit__label\">{{ seriesMode ? '已评系列' : '已评分' }}</small>")
		for (const source of [ratingChart, comparisonChart]) {
			expect(source).toContain('v-if="!isGlobalQuery" class="rating-distribution-panel__control-group"')
			expect(source).not.toContain(':disabled="isGlobalQuery"')
		}
	})
})
