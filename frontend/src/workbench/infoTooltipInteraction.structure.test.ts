import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), 'utf8')

const query = read('./components/QueryWorkspace.vue')
const inspector = read('./components/PersonInspector.vue')
const cooperation = read('./components/SinglePersonCooperation.vue')
const subjectWorkList = read('./components/SubjectWorkList.vue')
const dashboard = read('./components/AnalysisDashboard.vue')
const adaptiveAppearance = read('./components/AdaptiveAppearanceList.vue')
const adaptiveRole = read('./components/AdaptiveRoleList.vue')
const ratingDistribution = read('./components/RatingDistributionChart.vue')
const comparisonDistribution = read('./components/ComparisonRatingDistribution.vue')

const tooltipSources = [
	query,
	inspector,
	cooperation,
	subjectWorkList,
	adaptiveAppearance,
	adaptiveRole,
	ratingDistribution,
	comparisonDistribution,
]
const tooltipBlocks = tooltipSources.flatMap((source) =>
	[...source.matchAll(/<n-tooltip\b[\s\S]*?<\/n-tooltip>/g)].map((match) => match[0]),
)

const infoTooltipBlocks = [query, inspector, cooperation, subjectWorkList]
	.flatMap((source) => [...source.matchAll(/<n-tooltip\b[\s\S]*?<\/n-tooltip>/g)]
		.map((match) => match[0]))
	.filter((block) => block.includes('<AppIcon name="info"'))

describe('interactive info tooltip contract', () => {
	it('uses raw Naive UI tooltips through public sizing and content APIs', () => {
		expect(tooltipBlocks).toHaveLength(13)
		for (const block of tooltipBlocks) {
			expect(block).toContain('trigger="manual"')
			expect(block).toContain(':show=')
			expect(block).toContain(':animated="false"')
			expect(block).toContain('style="max-width: min(336px, calc(100dvw - 72px));"')
			expect(block).toContain('content-class="workbench-tooltip-content"')
			expect(block).not.toContain('internal-extra-class')
		}
		expect(tooltipSources.join('\n')).not.toContain('WorkbenchTooltip')
	})

	it('keeps every workbench info tooltip on the controlled interaction contract', () => {
		expect(infoTooltipBlocks).toHaveLength(7)
		for (const block of infoTooltipBlocks) {
			for (const token of [
				'trigger="manual"',
				':show=',
				'style="max-width: min(336px, calc(100dvw - 72px));"',
				'content-class="workbench-tooltip-content"',
				'type="button"',
				'aria-label=',
				':aria-expanded=',
				'@mouseenter=',
				'@mouseleave=',
				'@focus=',
				'@blur=',
				'@click.stop=',
				'@keydown.esc.stop.prevent=',
			]) {
				expect(block).toContain(token)
			}
			expect(block).not.toContain('trigger="hover"')
		}
		expect(query).toContain('uidHelpTooltipVisible.value = false')
		expect(query).toContain('visibleQueryHelp.value = null')
	})

	it('keeps the empty-state info glyph decorative', () => {
		const emptyState = dashboard.match(/<section v-if="!workbench\.sharedSubjects\.value\.length"[\s\S]*?<\/section>/)?.[0] ?? ''
		expect(emptyState).toContain('<AppIcon name="info"')
		expect(emptyState).not.toContain('<button')
		expect(emptyState).not.toContain('<n-tooltip')
	})
})
