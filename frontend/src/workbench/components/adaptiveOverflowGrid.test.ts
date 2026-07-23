import { describe, expect, it } from 'vitest'
import { packAdaptiveOverflowRows, packCompactOverflowRows } from './adaptiveOverflowGrid'

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

	it('fills the remaining row with complete identity tags when space allows', () => {
		expect(packAdaptiveOverflowRows({
			widths: [80, 80, 80],
			availableWidth: 200,
			columnGap: 12,
			overflowWidth: 36,
			maxRows: 2,
		})).toEqual([
			{ entries: [0, 1] },
			{ entries: [2] },
		])
	})

	it('lets one long identity own a row while two short identities share the next', () => {
		expect(packAdaptiveOverflowRows({
			widths: [180, 60, 60],
			availableWidth: 200,
			columnGap: 12,
			overflowWidth: 36,
			maxRows: 2,
		})).toEqual([
			{ entries: [0] },
			{ entries: [1, 2] },
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

describe('packCompactOverflowRows', () => {
	it('packs any number of short tags tightly into one row', () => {
		expect(packCompactOverflowRows({
			widths: [48, 60, 56],
			availableWidth: 180,
			columnGap: 4,
			overflowWidth: 32,
			maxRows: 2,
		})).toEqual([
			{ entries: [0, 1, 2] },
		])
	})

	it('uses total natural width instead of strict half columns', () => {
		expect(packCompactOverflowRows({
			widths: [100, 36, 36],
			availableWidth: 160,
			columnGap: 4,
			overflowWidth: 32,
			maxRows: 2,
		})).toEqual([
			{ entries: [0, 1] },
			{ entries: [2] },
		])
	})

	it('reserves real space for the overflow counter on the final row', () => {
		expect(packCompactOverflowRows({
			widths: [52, 52, 52, 52, 52, 52, 52],
			availableWidth: 180,
			columnGap: 4,
			overflowWidth: 32,
			maxRows: 2,
		})).toEqual([
			{ entries: [0, 1, 2] },
			{ entries: [3, 4], hiddenCount: 2 },
		])
	})
})
