import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const cooperationSource = readFileSync(new URL('./SinglePersonCooperation.vue', import.meta.url), 'utf8')
const rankingSource = readFileSync(new URL('./RankingWorkbench.vue', import.meta.url), 'utf8')
const rankingSkeletonSource = readFileSync(new URL('./RankingQuerySkeleton.vue', import.meta.url), 'utf8')
const rankedListSource = readFileSync(new URL('./RankedPersonList.vue', import.meta.url), 'utf8')
const toolbarSource = readFileSync(new URL('./WorkListToolbar.vue', import.meta.url), 'utf8')
const composableSource = readFileSync(new URL('../composables/useWorkbench.ts', import.meta.url), 'utf8')
const cooperationStyles = readFileSync(new URL('../styles/modules/single-person-cooperation.css', import.meta.url), 'utf8')
const rankingRefinementStyles = readFileSync(new URL('../styles/modules/ranking-refinements.css', import.meta.url), 'utf8')
const componentResponsiveStyles = readFileSync(new URL('../styles/modules/component-responsive.css', import.meta.url), 'utf8')

describe('shared ranking controls', () => {
	it('uses WorkListToolbar for both work and cooperation-person sorting', () => {
		expect(cooperationSource).toContain("import WorkListToolbar from './WorkListToolbar.vue'")
		expect(cooperationSource).toContain('<WorkListToolbar')
		expect(cooperationSource).not.toContain("import SortDirectionButton from './SortDirectionButton.vue'")
		expect(cooperationSource).not.toContain('<n-input')
	})

	it('supports an optional filter inside the shared toolbar', () => {
		expect(toolbarSource).toMatch(/<slot\s+name="before-sort"/)
		expect(cooperationStyles).toContain('grid-template-columns: minmax(0, 1fr) minmax(116px, auto) auto;')
	})

	it('keeps ranking headers and rows under one component owner', () => {
		expect(rankingSource).not.toContain('RankingListColumns')
		expect(cooperationSource).not.toContain('RankingListColumns')
		expect(rankedListSource).toContain('class="list-columns list-columns--ranking"')
		expect(rankedListSource).toContain('<span>均分</span>')
		expect(rankedListSource).not.toContain('averageLabel }}</span>')
		expect(rankedListSource).toContain(`:class="{ 'single-cooperation__list-columns': variant === 'cooperation' }"`)
		expect(cooperationSource).not.toContain('single-cooperation__list-columns')
	})

	it('uses compact series terms while preserving the normal work terms', () => {
		expect(rankingSource).toContain("{ label: workbench.query.mergeSeries ? '系列数' : '作品数', value: 'count' }")
		expect(rankingSource).toContain("workbench.query.mergeSeries ? ' 个系列' : ' 个条目'")
		expect(rankedListSource).toContain("{{ workbench.query.mergeSeries ? '系列' : '作品' }}")
		expect(rankedListSource).toContain("workbench.query.mergeSeries ? '个系列' : '部作品'")
		expect(cooperationSource).toContain("{ label: seriesMode.value ? '系列数' : '作品数', value: 'count' as const }")
	})

	it('keeps result statistics independent from the local ranking search', () => {
		expect(composableSource).toContain('rankingResultPeople: ComputedRef<Person[]>')
		expect(composableSource).toContain('const rankingResultPeople = computed(() => {')
		expect(composableSource).toContain('return rankingResultPeople.value')
		expect(composableSource).toContain('for (const person of rankingResultPeople.value)')
		expect(rankingSource).toContain(':to="workbench.rankingResultPeople.value.length"')
		expect(rankingSource).toContain(':item-count="workbench.rankingPeople.value.length"')
	})

	it('aligns ranking headers and values on evenly spaced metric starts', () => {
		const metricRule = rankingRefinementStyles.match(/\.list-columns__metrics,\s*\.person-row__metrics\s*\{([^}]*)\}/s)?.[1] ?? ''
		expect(metricRule).toContain('width: 100%;')
		expect(metricRule).toContain('--ranking-preference-track: 40px;')
		expect(metricRule).toContain('grid-template-columns: repeat(3, minmax(0, 1fr)) var(--ranking-preference-track);')
		expect(metricRule).toContain('padding-inline-start: var(--space-1);')
		expect(metricRule).toContain('gap: 0;')
		expect(metricRule).not.toContain('justify-content: space-between;')
		expect(metricRule).not.toContain('width: max-content;')
		expect(rankingRefinementStyles).toMatch(/\.list-columns__metrics\.is-global,\s*\.person-row__metrics\.is-global\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);/s)
		expect(rankedListSource).toContain(`<span class="list-columns__metrics" :class="{ 'is-global': !showPreference }">`)
		expect(rankedListSource).toContain(`:class="{ 'is-global': !showPreference }"`)
		expect(rankingRefinementStyles).not.toContain('grid-template-columns: 25px 28px 28px 40px;')
		expect(rankingRefinementStyles).not.toContain('grid-template-columns: 25px 24px 24px 34px;')
		expect(rankingRefinementStyles).not.toContain('@container ranking-pane (min-width: 580px)')
	})

	it('keeps the ranking skeleton header on the same four direct column tracks', () => {
		const headerStart = rankingSkeletonSource.indexOf('class="list-columns list-columns--ranking query-skeleton__list-columns"')
		const headerEnd = rankingSkeletonSource.indexOf('</div>', headerStart)
		const headerBlock = rankingSkeletonSource.slice(headerStart, headerEnd)
		const avatarColumn = headerBlock.indexOf('<span />')
		const personColumn = headerBlock.indexOf('class="query-skeleton__person-column"')
		const metricColumn = headerBlock.indexOf('class="list-columns__metrics"')

		expect(headerStart).toBeGreaterThan(-1)
		expect(avatarColumn).toBeGreaterThan(-1)
		expect(personColumn).toBeGreaterThan(avatarColumn)
		expect(metricColumn).toBeGreaterThan(personColumn)
	})

	it('owns the mobile inspector header and close target explicitly', () => {
		expect(rankingSource).toContain('height="calc(100dvh - var(--workbench-header-bar-height))"')
		expect(rankingSource).toContain('class="ranking-inspector-drawer__close"')
		expect(rankingSource).toContain('class="ranking-inspector-drawer__close-hit"')
		expect(rankingSource).toContain(':size="controlSize"')
		expect(rankingSource).toContain('<AppIcon name="close" :size="16" />')
		expect(rankingSource).toContain(':closable="false"')
		expect(componentResponsiveStyles).toMatch(/\.ranking-inspector-drawer__header\s*\{[^}]*height:\s*52px;/s)
		expect(componentResponsiveStyles).toMatch(/\.ranking-inspector-drawer__close-hit\s*\{[^}]*width:\s*var\(--touch-target-min\);[^}]*height:\s*var\(--touch-target-min\);/s)
	})
})
