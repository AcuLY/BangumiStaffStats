import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const componentUrl = new URL('./ComparisonRatingDistribution.vue', import.meta.url)
const source = existsSync(componentUrl) ? readFileSync(componentUrl, 'utf8') : ''
const rankingChartSource = readFileSync(new URL('./RatingDistributionChart.vue', import.meta.url), 'utf8')
const styles = readFileSync(new URL('../styles/modules/analysis-insights.css', import.meta.url), 'utf8')

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
		expect(source).toContain('v-for="(series, seriesIndex) in visibleScoreSeries"')
		expect(source).toContain('<template v-if="chartMode === \'score\'">')
		expect(source).toContain('v-if="visibleScoreTotal"')
		expect(source).toContain('请至少勾选一组评分分布。')
		expect(source).toContain('v-for="(series, seriesIndex) in renderedTimeSeries"')
		expect(source).toContain(':class="{ \'is-shared\': series.key === \'shared-works\' }"')
		expect(source).toContain('请至少勾选一条时间曲线。')
		expect(source).toContain('class="rating-distribution-panel__empty" role="status">请至少勾选一条时间曲线。')
		expect(styles).toMatch(/\.comparison-time-chart__line\s*{[^}]*stroke:\s*color-mix\(in srgb, var\(--series-color\) 75%, var\(--text-1\)\);[^}]*stroke-opacity:\s*0\.85;/s)
		expect(styles).toMatch(/\.comparison-time-chart__series\.is-shared \.comparison-time-chart__line\s*{[^}]*stroke-opacity:\s*1;/s)
		expect(styles).toMatch(/:root\[data-theme="dark"\] \.comparison-time-chart__line\s*{[^}]*stroke:\s*color-mix\(in srgb, var\(--series-color\) 75%, var\(--text-1\)\);[^}]*stroke-opacity:\s*0\.85;/s)
		expect(styles).toMatch(/:root\[data-theme="dark"\] \.comparison-time-chart__series\.is-shared \.comparison-time-chart__line\s*{[^}]*stroke-opacity:\s*1;/s)
	})

	it('only shows grouped bar values when each bar has enough inline space', () => {
		expect(styles).toMatch(/\.grouped-bin__slot\s*{[^}]*container-type:\s*inline-size;/s)
		expect(styles).toMatch(/\.grouped-bin__bar span\s*{[^}]*display:\s*none;[^}]*font-variant-numeric:\s*tabular-nums;[^}]*white-space:\s*nowrap;/s)
		expect(styles).toMatch(/@container\s*\(min-width:\s*18px\)\s*{[^}]*\.grouped-bin__bar span\s*{[^}]*display:\s*block;/s)
	})

	it('keeps every series in an equal grid slot with centered value labels', () => {
		expect(source).toContain('<TransitionGroup')
		expect(source).toContain(':css="false"')
		expect(source).toContain(':style="{ \'--series-count\': visibleScoreSeries.length }"')
		expect(source).toContain('class="grouped-bin__slot"')
		expect(styles).toMatch(/\.grouped-bin__bars\s*{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*repeat\(var\(--series-count\),\s*minmax\(0,\s*18px\)\);[^}]*column-gap:\s*0;/s)
		expect(styles).not.toMatch(/@media\s*\(max-width:\s*520px\)\s*{[\s\S]*?\.grouped-bin__bars\s*{[^}]*column-gap:/s)
		expect(styles).not.toContain('.grouped-bin__bars > i:first-child span')
		expect(styles).not.toContain('.grouped-bin__bars > i:last-child span')
	})

	it('centers the legend and shares one plot baseline with the ranking chart', () => {
		expect(styles).toMatch(/\.distribution-legend\s*{[^}]*align-items:\s*center;/s)
		expect(styles).toMatch(/\.grouped-distribution\s*{[^}]*--grouped-label-row:\s*18px;[^}]*--grouped-bin-gap:\s*var\(--space-1\);[^}]*--grouped-plot-bottom:\s*calc\(var\(--grouped-label-row\) \+ var\(--grouped-bin-gap\)\);/s)
		expect(styles).toMatch(/\.grouped-distribution::before\s*{[^}]*inset:\s*18px 4px var\(--grouped-plot-bottom\) 28px;/s)
		expect(styles).toMatch(/\.grouped-distribution \.score-distribution__axis\s*{[^}]*inset:\s*18px auto var\(--grouped-plot-bottom\) 0;/s)
		expect(styles).toMatch(/\.grouped-bin\s*{[^}]*grid-template-rows:\s*minmax\(0, 1fr\) var\(--grouped-label-row\);[^}]*gap:\s*var\(--grouped-bin-gap\);/s)
		expect(styles).toMatch(/\.grouped-bin__bar::before\s*{[^}]*border-radius:\s*4px 4px 1px 1px;/s)
		expect(styles).not.toMatch(/@media\s*\(max-width:\s*520px\)\s*{[\s\S]*?\.grouped-bin\s*{/s)
	})

	it('animates both chart types without forcing motion on reduced-motion users', () => {
		const motionMediaIndex = styles.indexOf('@media (prefers-reduced-motion: no-preference)')
		const baseStyles = styles.slice(0, motionMediaIndex)
		const motionStyles = styles.slice(motionMediaIndex)

		expect(source).toContain('pathLength="1"')
		expect(source).toContain(':key="`${scoreSource}-${series.key}`"')
		expect(source).toContain('<Transition name="score-source" mode="out-in">')
		expect(source).toContain(':key="scoreSource"')
		expect(source).toMatch(/v-for="\(series, seriesIndex\) in visibleScoreSeries"[\s\S]*?:key="series\.key"/s)
		expect(motionMediaIndex).toBeGreaterThan(-1)
		expect(baseStyles).not.toMatch(/\.comparison-time-chart__point\s*{[^}]*transition:/s)
		expect(motionStyles).toMatch(/\.comparison-time-chart__point\s*{[^}]*transition:\s*transform\s+160ms/s)
		expect(styles).toContain('@keyframes grouped-bar-grow')
		expect(styles).toContain('@keyframes comparison-time-line-draw')
		expect(motionStyles).toMatch(/\.grouped-bar-move\s*{[^}]*transition:\s*transform\s+180ms/s)
		expect(motionStyles).toMatch(/\.score-source-leave-active\s*{[^}]*transition:\s*opacity\s+100ms/s)
		expect(motionStyles).toMatch(/\.score-source-leave-to\s*{[^}]*opacity:\s*0;/s)
		expect(motionStyles).not.toMatch(/\.score-source-leave-(?:active|to)\s*{[^}]*transform:/s)
	})
})
