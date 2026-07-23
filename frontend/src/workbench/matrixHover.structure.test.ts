import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const matrixStyles = readFileSync(new URL('./styles/modules/analysis-timeline-matrix.css', import.meta.url), 'utf8')

describe('relationship matrix hover boundary', () => {
	it('layers hover feedback over every body cell after the semantic backgrounds', () => {
		const semanticBackgroundIndex = matrixStyles.indexOf('.matrix-table .is-best')
		const rowHoverRule = matrixStyles.match(/\.matrix-table tbody tr:hover > th,\s*\.matrix-table tbody tr:hover > td\s*\{[^}]*\}/s)

		expect(semanticBackgroundIndex).toBeGreaterThan(-1)
		expect(rowHoverRule).not.toBeNull()
		expect(rowHoverRule?.[0]).toContain('background-image: linear-gradient(')
		expect(rowHoverRule?.[0]).toContain('var(--hover) 60%')
		expect(rowHoverRule?.[0]).toContain('transparent')
		expect(matrixStyles.indexOf(rowHoverRule?.[0] ?? '')).toBeGreaterThan(semanticBackgroundIndex)
	})
})
