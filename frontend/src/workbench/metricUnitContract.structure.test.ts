import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), 'utf8')

const contractStyles = read('./styles/modules/metric-units.css')
const workbenchStyles = read('./styles/workbench.css')
const dashboardSource = read('./components/AnalysisDashboard.vue')
const selectedPersonCardSource = read('./components/SelectedPersonCard.vue')
const sharedSummarySource = read('./components/SharedRatingSummary.vue')
const inspectorSource = read('./components/PersonInspector.vue')
const cooperationSource = read('./components/SinglePersonCooperation.vue')
const rankingRowSource = read('./components/RankedPersonList.vue')
const subjectWorkSource = read('./components/SubjectWorkList.vue')

describe('self-contained metric grid contract', () => {
	it('places values above labels on one left-aligned start edge', () => {
		const unitRule = contractStyles.match(/\.metric-grid > \.metric-unit \{([\s\S]*?)\n\}/)?.[1] ?? ''
		const valueRule = contractStyles.match(/\.metric-unit__value \{([\s\S]*?)\n\}/)?.[1] ?? ''
		const labelRule = contractStyles.match(/\.metric-unit__label \{([\s\S]*?)\n\}/)?.[1] ?? ''

		expect(unitRule).toContain('"value"\n\t\t"label"')
		expect(unitRule).toContain('justify-items: stretch;')
		expect(unitRule).toContain('gap: var(--space-1);')
		expect(unitRule).toContain('text-align: left;')
		expect(valueRule).toContain('grid-area: value;')
		expect(valueRule).toContain('font-variant-numeric: tabular-nums;')
		expect(labelRule).toContain('grid-area: label;')
		expect(labelRule).toContain('white-space: nowrap;')
	})

	it('keeps container styling outside the shared leaf contract', () => {
		const forbiddenDeclarations = [
			'grid-template-columns:',
			'padding:',
			'border:',
			'background:',
			'font-size:',
			'color:',
		]

		for (const declaration of forbiddenDeclarations) {
			expect(contractStyles).not.toContain(declaration)
		}
	})

	it('is consumed by every live self-contained overview grid', () => {
		for (const source of [selectedPersonCardSource, sharedSummarySource, inspectorSource, cooperationSource]) {
			expect(source).toContain('metric-grid')
			expect(source).toContain('metric-unit')
			expect(source).toContain('metric-unit__label')
			expect(source).toContain('metric-unit__value')
		}

		expect(sharedSummarySource).toContain("<dt class=\"metric-unit__label\">{{ props.seriesMode ? '共同系列' : '共同作品' }}</dt>")
		expect([...selectedPersonCardSource.matchAll(/<div class="metric-unit">/g)]).toHaveLength(2)
		expect(selectedPersonCardSource).toContain("{{ workbench.query.mergeSeries ? '参与系列' : workbench.query.isGlobal ? '参与作品' : '收藏作品' }}")
		expect(selectedPersonCardSource).toContain('<dt class="metric-unit__label">均分</dt>')
		expect(inspectorSource).toContain("<small class=\"metric-unit__label\">{{ seriesMode ? '参与系列' : '参与作品' }}</small>")
		expect(cooperationSource).toMatch(/metric-unit__label">合作人物<\/small>[\s\S]*?<b class="metric-unit__value"/)
	})

	it('keeps supported leader content secondary to the same metric order', () => {
		expect(cooperationSource).toContain('single-cooperation__leader metric-unit metric-unit--with-support')
		expect(cooperationSource).toContain('single-cooperation__leader-person metric-unit__support')
		expect(contractStyles).toContain('"value support" auto\n\t\t"label support" auto')
		expect(contractStyles).toContain('"value" auto\n\t\t\t"label" auto\n\t\t\t"support" minmax(0, 1fr)')
	})

	it('does not spread into column, matrix, chart, inline, or composite fact semantics', () => {
		const matrixStart = dashboardSource.indexOf('<table class="matrix-table"')
		const matrixEnd = dashboardSource.indexOf('</table>', matrixStart)
		const matrixSource = dashboardSource.slice(matrixStart, matrixEnd)

		expect(rankingRowSource).not.toContain('metric-unit')
		expect(subjectWorkSource).not.toContain('metric-unit')
		expect(matrixStart).toBeGreaterThan(-1)
		expect(matrixSource).not.toContain('metric-unit')
	})

	it('loads after component responsive rules and keeps content-image enforcement last', () => {
		const responsiveImport = workbenchStyles.indexOf("@import './modules/component-responsive.css';")
		const contractImport = workbenchStyles.indexOf("@import './modules/metric-units.css';")
		const contentImageImport = workbenchStyles.indexOf("@import './modules/content-images.css';")

		expect(responsiveImport).toBeGreaterThan(-1)
		expect(contractImport).toBeGreaterThan(responsiveImport)
		expect(contentImageImport).toBeGreaterThan(contractImport)
		expect(workbenchStyles.trimEnd().endsWith("@import './modules/content-images.css';")).toBe(true)
	})
})
