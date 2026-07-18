import { describe, expect, it } from 'vitest'
import { packAdaptiveOverflowRows } from './adaptiveOverflowGrid'

describe('packAdaptiveOverflowRows', () => {
	it('shows every entry when the complete list fits the row budget', () => {
		expect(packAdaptiveOverflowRows({
			widths: [80, 80, 80, 80],
			availableWidth: 200,
			columnGap: 12,
			overflowWidth: 36,
			maxRows: 2,
		})).toEqual([
			{ entries: [0, 1] },
			{ entries: [2, 3] },
		])
	})

	it('uses the final half-cell for the overflow count when it fits', () => {
		expect(packAdaptiveOverflowRows({
			widths: [80, 80, 80, 80, 80, 80],
			availableWidth: 200,
			columnGap: 12,
			overflowWidth: 36,
			maxRows: 2,
		})).toEqual([
			{ entries: [0, 1] },
			{ entries: [2], hiddenCount: 3 },
		])
	})

	it('never leaves the overflow count on its own row', () => {
		expect(packAdaptiveOverflowRows({
			widths: [180, 180, 180],
			availableWidth: 300,
			columnGap: 12,
			overflowWidth: 36,
			maxRows: 2,
		})).toEqual([
			{ entries: [0], hiddenCount: 2 },
		])
	})
})
