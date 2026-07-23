import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const componentSource = readFileSync(new URL('./SharedRatingSummary.vue', import.meta.url), 'utf8')
const dashboardSource = readFileSync(new URL('./AnalysisDashboard.vue', import.meta.url), 'utf8')
const profileStyles = readFileSync(new URL('../styles/modules/analysis-profiles.css', import.meta.url), 'utf8')
const selectedPeopleStyles = readFileSync(new URL('../styles/modules/selected-people.css', import.meta.url), 'utf8')

const extractCssBlock = (styles: string, prelude: string) => {
	const start = styles.indexOf(prelude)
	const openingBrace = styles.indexOf('{', start)
	if (start < 0 || openingBrace < 0) return ''

	let depth = 0
	for (let index = openingBrace; index < styles.length; index += 1) {
		if (styles[index] === '{') depth += 1
		if (styles[index] === '}') depth -= 1
		if (depth === 0) return styles.slice(start, index + 1)
	}

	return ''
}

describe('SharedRatingSummary metric grid', () => {
	it('uses one semantic grid whose values precede their labels', () => {
		const metricUnits = [...componentSource.matchAll(/<div[^>]*class="[^"]*\bmetric-unit\b[^"]*"[^>]*>([\s\S]*?)<\/div>/g)]
			.map((match) => match[1])
		const labels = [...componentSource.matchAll(/<dt[^>]*>([^<]+)<\/dt>/g)]
			.map((match) => match[1])

		expect(componentSource).toContain('<dl\n\t\tclass="analysis-profile-summary shared-rating-summary shared-rating-summary--below metric-grid"')
		expect(componentSource).not.toContain('<aside')
		expect(componentSource).not.toContain('placement:')
		expect(componentSource).not.toContain('props.placement')
		expect(componentSource).toContain('aria-label="多人组合概览"')
		expect(componentSource).toContain(':data-metric-count="props.showPersonal ? 6 : 2"')
		expect(metricUnits).toHaveLength(6)
		for (const unit of metricUnits) {
			expect(unit.indexOf('<dd class="metric-unit__value">')).toBeGreaterThan(-1)
			expect(unit.indexOf('<dd class="metric-unit__value">')).toBeLessThan(unit.indexOf('<dt class="metric-unit__label">'))
		}
		expect(labels).toEqual([
			"{{ props.seriesMode ? '共同系列' : '共同作品' }}",
			"{{ props.seriesMode ? '已评系列' : '已评作品' }}",
			"{{ props.showPersonal ? '全站均分' : '均分' }}",
			'我的均分',
			"{{ props.seriesMode ? '最高均分' : '最高评分' }}",
			"{{ props.seriesMode ? '最低均分' : '最低评分' }}",
		])
		expect(profileStyles).not.toContain('.shared-rating-summary--pair')
		expect(profileStyles).not.toMatch(/\.shared-rating-summary--below\s+(?:dt|dd)\s*\{[^}]*order:/s)
	})

	it('switches between compact series and normal work terminology', () => {
		expect(componentSource).toContain('seriesMode?: boolean')
		expect(componentSource).toContain("props.seriesMode ? '共同系列' : '共同作品'")
		expect(componentSource).toContain("props.seriesMode ? '已评系列' : '已评作品'")
		expect(componentSource).toContain("props.seriesMode ? '最高均分' : '最高评分'")
		expect(componentSource).toContain("props.seriesMode ? '最低均分' : '最低评分'")
		expect(dashboardSource).toContain(':series-mode="seriesMode"')
	})

	it('uses two columns by default and at most four summary columns in the roomy selected-person panel', () => {
		const baseSummaryRule = extractCssBlock(profileStyles, '.shared-rating-summary--below[data-metric-count]')
		const roomyPanelRule = extractCssBlock(selectedPeopleStyles, '@container selected-people-panel (min-width: 544px)')

		expect(profileStyles).toContain('grid-auto-rows: minmax(64px, auto);')
		expect(baseSummaryRule).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));')
		expect(roomyPanelRule).toContain('.selected-people-panel > .shared-rating-summary--below[data-metric-count] {\n\t\tgrid-template-columns: repeat(4, minmax(0, 1fr));')
		expect(`${profileStyles}\n${selectedPeopleStyles}`).not.toMatch(/\.shared-rating-summary--below[^}]*grid-template-columns:\s*repeat\((?:5|6|7|8|9)/s)
		expect(selectedPeopleStyles).toContain('.selected-people-panel > .shared-rating-summary--below {\n\twidth: 100%;\n\tborder-top: 1px solid var(--divider);')
	})

	it('leaves the unused end cells empty on four-column summary rows', () => {
		const roomyPanelRule = extractCssBlock(selectedPeopleStyles, '@container selected-people-panel (min-width: 544px)')

		expect(roomyPanelRule).toMatch(/data-metric-count="6"\]::before,[\s\S]*data-metric-count="6"\]::after \{[\s\S]*content: '';/)
		expect(roomyPanelRule).toMatch(/data-metric-count="6"\]::before \{\s*grid-column: 3;/)
		expect(roomyPanelRule).toMatch(/data-metric-count="6"\]::after \{\s*grid-column: 4;/)
		expect(roomyPanelRule).toMatch(/data-metric-count="6"\]::before,[\s\S]*data-metric-count="6"\]::after \{\s*grid-row: 2;/)
		expect(selectedPeopleStyles).not.toContain('.shared-rating-summary--below[data-metric-count="6"] > div:nth-child')
	})

	it('keeps the summary as the full-width tail of the selected-person panel', () => {
		const panelStart = dashboardSource.indexOf('class="analysis-section relationship-hero selected-people-panel"')
		const listStart = dashboardSource.indexOf('<ol class="selected-people-grid">', panelStart)
		const listEnd = dashboardSource.indexOf('</ol>', listStart)
		const summaryStart = dashboardSource.indexOf('<SharedRatingSummary', listEnd)
		const panelEnd = dashboardSource.indexOf('</section>', summaryStart)
		const belowGridRule = extractCssBlock(profileStyles, '.shared-rating-summary--below')
		const selectedGridRule = extractCssBlock(selectedPeopleStyles, '.selected-people-grid')
		const selectedCardRule = extractCssBlock(selectedPeopleStyles, '.selected-person-card')

		expect([...dashboardSource.matchAll(/<SharedRatingSummary/g)]).toHaveLength(1)
		expect(panelStart).toBeGreaterThan(-1)
		expect(listStart).toBeGreaterThan(panelStart)
		expect(listEnd).toBeGreaterThan(listStart)
		expect(summaryStart).toBeGreaterThan(listEnd)
		expect(panelEnd).toBeGreaterThan(summaryStart)
		expect(dashboardSource).not.toContain('placement=')
		expect(belowGridRule).toContain('grid-column: 1 / -1;')
		expect(belowGridRule).toContain('width: 100%;')
		expect(selectedGridRule).toContain('gap: 1px;')
		expect(selectedGridRule).toContain('padding: 0;')
		expect(selectedGridRule).toContain('background: var(--divider);')
		expect(selectedCardRule).not.toContain('border:')
		expect(selectedCardRule).not.toContain('border-radius:')
		expect(selectedPeopleStyles).toContain('.selected-people-panel > .shared-rating-summary--below {\n\twidth: 100%;\n\tborder-top: 1px solid var(--divider);')
		expect(dashboardSource).not.toContain('profile-stage__connector')
		expect(dashboardSource).not.toContain('data-profile-count')
	})
})
