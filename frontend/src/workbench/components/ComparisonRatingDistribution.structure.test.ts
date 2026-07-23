import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const componentUrl = new URL('./ComparisonRatingDistribution.vue', import.meta.url)
const source = existsSync(componentUrl) ? readFileSync(componentUrl, 'utf8') : ''
const rankingChartSource = readFileSync(new URL('./RatingDistributionChart.vue', import.meta.url), 'utf8')
const styles = readFileSync(new URL('../styles/modules/analysis-insights.css', import.meta.url), 'utf8')
const rankingStyles = readFileSync(new URL('../styles/modules/ranking-inspector.css', import.meta.url), 'utf8')

describe('ComparisonRatingDistribution structure', () => {
	it('matches the ranking score and time controls', () => {
		expect(source).toContain('aria-label="评分图表维度"')
		expect(source).toContain('<n-radio-button value="score">按评分</n-radio-button>')
		expect(source).toContain('<n-radio-button value="time">按时间</n-radio-button>')
		expect(source).toContain('aria-label="评分数据来源"')
		expect(source).toContain('v-if="!isGlobalQuery" class="rating-distribution-panel__control-group"')
		expect(source).toContain('<n-radio-button value="personal">我的评分</n-radio-button>')
		expect(source).not.toContain(':disabled="isGlobalQuery"')
		expect(source).toContain('<n-radio-button value="global">全站评分</n-radio-button>')
	})

	it('removes the whole dimension switch and resets to score in series mode', () => {
		for (const componentSource of [source, rankingChartSource]) {
			expect(componentSource).toContain('seriesMode?: boolean')
			expect(componentSource).toContain('seriesMode: false')
			expect(componentSource).toMatch(/watch\(\(\) => props\.seriesMode, \(seriesMode\) => \{\s*if \(seriesMode\) chartMode\.value = 'score'\s*\}, \{ immediate: true \}\)/)
			expect(componentSource).toContain("{{ seriesMode ? '系列均分分布' : '评分分布' }}")
			expect(componentSource).toContain('v-if="!seriesMode || !isGlobalQuery" class="rating-distribution-panel__controls"')

			const dimensionGroup = componentSource.match(/<div v-if="!seriesMode" class="rating-distribution-panel__control-group">[\s\S]*?<\/div>/)?.[0] ?? ''
			expect(dimensionGroup).toContain('aria-label="评分图表维度"')
			expect(dimensionGroup).toContain('<n-radio-button value="score">按评分</n-radio-button>')
			expect(dimensionGroup).toContain('<n-radio-button value="time">按时间</n-radio-button>')
			expect(componentSource).toContain('v-if="!isGlobalQuery" class="rating-distribution-panel__control-group"')
		}
		expect(rankingStyles).toMatch(/\.rating-distribution-panel__controls > \.rating-distribution-panel__control-group:only-child\s*\{[^}]*margin-inline-start:\s*auto;/s)
	})

	it('renders a concise legend and a quarterly comparison chart', () => {
		expect(source).toContain('buildQuarterlyRatingAverages')
		expect(source).toContain('class="comparison-time-chart__series"')
		expect(source).toContain("import type { CheckboxProps } from 'naive-ui'")
		expect(source).toContain("const seriesCheckboxThemeOverrides: NonNullable<CheckboxProps['themeOverrides']>")
		expect(source).toContain(':theme-overrides="seriesCheckboxThemeOverrides"')
		expect(source).toContain("checkMarkColor: 'var(--series-contrast)'")
		expect(source).toContain("'--series-contrast': seriesCheckMarkColor(series.color)")
		for (const token of ['colorChecked', 'borderChecked', 'borderFocus']) {
			expect(source).toMatch(new RegExp(`${token}:.*var\\(--series-color\\)`))
		}
		expect(source).not.toMatch(/\bborder:\s*'1px solid var\(--series-color\)'/)
		expect(source).toContain("boxShadowFocus: '0 0 0 2px var(--focus)'")
		expect(source).toContain('<b><template v-if="series.marker">{{ series.marker }} · </template>{{ series.label }}</b>')
		expect(source).not.toContain('<i aria-hidden="true" />')
		expect(styles).not.toContain('.distribution-legend i')
		expect(source).not.toContain('series.ratedCount')
		expect(source).not.toContain('series.average')
	})

	it('uses 8px points, 12px active points, and nearest-point 44px pointer targets', () => {
		for (const componentSource of [source, rankingChartSource]) {
			expect(componentSource).toContain('const TIME_POINT_RADIUS = 4')
			expect(componentSource).toContain('const TIME_POINT_ACTIVE_RADIUS = 6')
			expect(componentSource).toContain('const TIME_POINT_HIT_RADIUS = 22')
			expect(componentSource).toContain('Math.hypot(')
			expect(componentSource).toContain('nearestDistance <= TIME_POINT_HIT_RADIUS')
			expect(componentSource).toContain('tabindex="0"')
			expect(componentSource).not.toContain('r="3.5"')
			expect(componentSource).not.toContain('rating-time-chart__hit-target')
		}

		expect(source).toContain('@pointermove="updateHoveredTimePoint"')
		expect(source).toContain('@focus="focusedTimePointKey = comparisonTimePointKey(series.key, point.key)"')
		expect(rankingChartSource).toContain('@pointermove="updateHoveredTimeWork"')
		expect(rankingChartSource).toContain('@focus="focusedTimeWork = point.key"')
	})

	it('lets each series be toggled across score and time views while keeping shared works visually prominent', () => {
		expect(source).toContain('const hiddenSeriesKeys = ref<Set<string>>(new Set())')
		expect(source).toContain('const visibleScoreSeries = computed(')
		expect(source).toContain('const visibleTimeSeries = computed(')
		expect(source).toContain('<n-checkbox')
		expect(source).not.toContain('v-if="chartMode === \'time\'"')
		expect(source).toContain(':checked="isSeriesVisible(series.key) && isSeriesAvailable(series.key)"')
		expect(source).toContain('@update:checked="setSeriesVisible(series.key, $event)"')
		expect(source).toContain('v-for="(series, seriesIndex) in scoreBin.series"')
		expect(source).toContain('<template v-if="chartMode === \'score\'">')
		expect(source).toContain('v-if="scoreTotal"')
		expect(source).not.toContain('请至少勾选一组评分分布')
		expect(source).toContain('v-for="(series, seriesIndex) in renderedTimeSeries"')
		expect(source).toContain(':class="{ \'is-shared\': series.key === \'shared-works\' }"')
		expect(source).toContain('v-if="timePointTotal"')
		expect(source).not.toContain('请至少勾选一条时间曲线')
		expect(source).toContain('当前未显示时间曲线')
		expect(styles).toMatch(/\.comparison-time-chart__line\s*{[^}]*stroke:\s*color-mix\(in srgb, var\(--series-color\) 75%, var\(--text-1\)\);[^}]*stroke-opacity:\s*0\.85;/s)
		expect(styles).toMatch(/\.comparison-time-chart__series\.is-shared \.comparison-time-chart__line\s*{[^}]*stroke-opacity:\s*1;/s)
		expect(styles).toMatch(/:root\[data-theme="dark"\] \.comparison-time-chart__line\s*{[^}]*stroke:\s*color-mix\(in srgb, var\(--series-color\) 75%, var\(--text-1\)\);[^}]*stroke-opacity:\s*0\.85;/s)
		expect(styles).toMatch(/:root\[data-theme="dark"\] \.comparison-time-chart__series\.is-shared \.comparison-time-chart__line\s*{[^}]*stroke-opacity:\s*1;/s)
	})

	it('renders a horizontal mixed bar chart with scores on the vertical axis', () => {
		expect(source).toContain('class="horizontal-distribution"')
		expect(source).toContain('role="group"')
		expect(source).toContain(':aria-label="scoreComparisonLabel"')
		expect(source).toContain("'--series-count': Math.max(1, visibleScoreSeries.length)")
		expect(source).toContain('class="horizontal-distribution__axis"')
		expect(source).toContain('const scoreBins = computed(() => scoreLabels.value')
		expect(source).toContain('.reverse()')
		expect(source).toContain('const renderedScoreBins = computed(() => scoreBins.value.map((scoreBin) => ({')
		expect(source).toContain('series: visibleScoreSeries.value.filter((series) => series.counts[scoreBin.index] > 0)')
		expect(source).toContain('v-for="(scoreBin, scoreRowIndex) in renderedScoreBins"')
		expect(source).toContain('class="horizontal-score-group"')
		expect(source).toContain('v-for="(series, seriesIndex) in scoreBin.series"')
		expect(source).toContain('class="horizontal-score-bar"')
		expect(styles).toMatch(/\.horizontal-distribution\s*{[^}]*--comparison-score-column:\s*2ch;[^}]*display:\s*grid;[^}]*grid-template-columns:\s*var\(--comparison-score-column\) minmax\(0, 1fr\);/s)
		expect(styles).toMatch(/\.horizontal-score-group\s*{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*var\(--comparison-score-column\) minmax\(0, 1fr\);/s)
		expect(styles).toMatch(/\.horizontal-score-group > small\s*{[^}]*justify-self:\s*stretch;[^}]*text-align:\s*left;/s)
		expect(styles).toMatch(/\.horizontal-score-bar__fill\s*{[^}]*width:\s*var\(--bar-width\);[^}]*height:\s*100%;[^}]*background:\s*var\(--series-color\);[^}]*transform-origin:\s*left;/s)
	})

	it('keeps score bands equally tall while centering only their nonzero series', () => {
		expect(styles).toMatch(/\.distribution-legend\s*{[^}]*align-items:\s*center;/s)
		expect(source).toContain("'--distribution-steps': Math.max(1, distributionTicks.length - 1)")
		expect(source).toContain("'--bar-width': `${distributionBarWidth(series.counts[scoreBin.index])}%`")
		expect(source).toContain(':style="{ left: `${tick / distributionAxisMax * 100}%` }"')
		expect(source).toContain("'--series-count': Math.max(1, visibleScoreSeries.length)")
		expect(source).not.toContain("'--score-series-count': scoreBin.series.length")
		expect(styles).toMatch(/\.horizontal-score-group\s*{[^}]*align-items:\s*center;/s)
		expect(styles).toMatch(/\.horizontal-score-group__plot\s*{[^}]*grid-auto-rows:\s*var\(--comparison-bar-row-height\);[^}]*align-content:\s*center;[^}]*min-height:\s*max\(0px, calc\(/s)
		expect(styles).toContain('var(--series-count) * var(--comparison-bar-row-height)')
		expect(styles).toContain('(var(--series-count) - 1) * var(--comparison-bar-row-gap)')
		expect(styles).toMatch(/\.horizontal-score-group__plot::before\s*{[^}]*inset:\s*0 calc\(var\(--comparison-value-column\) \+ var\(--space-1\)\) 0 0;[^}]*linear-gradient\(to right,/s)
		expect(styles).toMatch(/\.horizontal-score-bar\s*{[^}]*display:\s*block;[^}]*height:\s*var\(--comparison-bar-row-height\);/s)
		expect(styles).toMatch(/\.horizontal-score-bar__track\s*{[^}]*padding-right:\s*calc\(var\(--comparison-value-column\) \+ var\(--space-1\)\);/s)
		expect(styles).toMatch(/\.horizontal-score-bar__value\s*{[^}]*position:\s*absolute;[^}]*left:\s*calc\(100% \+ var\(--space-1\)\);[^}]*transform:\s*translateY\(-50%\);/s)
		expect(source).not.toContain("class=\"{ 'is-empty':")
	})

	it('animates both chart types without forcing motion on reduced-motion users', () => {
		const motionMediaIndex = styles.indexOf('@media (prefers-reduced-motion: no-preference)')
		const baseStyles = styles.slice(0, motionMediaIndex)
		const motionStyles = styles.slice(motionMediaIndex)

		expect(source).toContain('pathLength="1"')
		expect(source).toContain(':key="`${scoreSource}-${series.key}`"')
		expect(source).toContain('<Transition name="score-source" mode="out-in">')
		expect(source).toContain(':key="scoreSource"')
		expect(source).toMatch(/v-for="\(series, seriesIndex\) in scoreBin\.series"[\s\S]*?:key="series\.key"/s)
		expect(motionMediaIndex).toBeGreaterThan(-1)
		expect(baseStyles).not.toMatch(/\.comparison-time-chart__point\s*{[^}]*transition:/s)
		expect(motionStyles).toMatch(/\.comparison-time-chart__point\s*{[^}]*transition:\s*transform\s+160ms/s)
		expect(styles).toContain('@keyframes comparison-score-bar-grow')
		expect(styles).toContain('@keyframes comparison-time-line-draw')
		expect(motionStyles).toMatch(/\.horizontal-score-bar__fill\s*{[^}]*animation:\s*comparison-score-bar-grow\s+220ms/s)
		expect(motionStyles).toMatch(/\.score-source-leave-active\s*{[^}]*transition:\s*opacity\s+100ms/s)
		expect(motionStyles).toMatch(/\.score-source-leave-to\s*{[^}]*opacity:\s*0;/s)
		expect(motionStyles).not.toMatch(/\.score-source-leave-(?:active|to)\s*{[^}]*transform:/s)
	})
})
