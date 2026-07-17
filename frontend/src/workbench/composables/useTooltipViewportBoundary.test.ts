import { describe, expect, it } from 'vitest'
import { calculateTooltipViewportShift } from './useTooltipViewportBoundary'

const bounds = { left: 12, top: 12, right: 308, bottom: 628 }

describe('calculateTooltipViewportShift', () => {
	it('keeps an in-bounds tooltip in place', () => {
		expect(calculateTooltipViewportShift(
			{ left: 16, top: 147, right: 308, bottom: 226 },
			bounds,
		)).toEqual({ x: 0, y: 0 })
	})

	it('pulls horizontal overflow back inside the safe gutter', () => {
		expect(calculateTooltipViewportShift(
			{ left: 69, top: 147, right: 361, bottom: 226 },
			bounds,
		)).toEqual({ x: -53, y: 0 })
	})

	it('corrects top and bottom overflow', () => {
		expect(calculateTooltipViewportShift(
			{ left: 16, top: -10, right: 200, bottom: 80 },
			bounds,
		)).toEqual({ x: 0, y: 22 })
		expect(calculateTooltipViewportShift(
			{ left: 16, top: 560, right: 200, bottom: 650 },
			bounds,
		)).toEqual({ x: 0, y: -22 })
	})
})
