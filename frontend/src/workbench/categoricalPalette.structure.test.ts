import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { WORKBENCH_CATEGORICAL_PALETTES } from './categoricalPalette'

const designSource = readFileSync(new URL('../../../DESIGN.md', import.meta.url), 'utf8')
const paletteLabSource = readFileSync(new URL('../../prototypes/palette-lab.html', import.meta.url), 'utf8')

const expectedPalettes = {
	light: [
		'#c82a70', '#288183', '#c05852', '#916fc8', '#a07703',
		'#579459', '#368fc4', '#5b62ab', '#d96d92', '#c97f4e',
	],
	dark: [
		'#f16a9c', '#61a8aa', '#ef8e86', '#bea0f2', '#d2ab59',
		'#87bd87', '#6fb7e9', '#8992d6', '#ffa9c3', '#fdb78c',
	],
} as const

const declarationColors = (source: string, declaration: string, theme: 'light' | 'dark') => {
	const declarationMatch = source.match(new RegExp(`const ${declaration} = \\{([\\s\\S]*?)\\}\\s*(?:as const)?;?`))
	if (!declarationMatch) throw new Error(`Missing ${declaration} palette declaration`)
	const declarationBlock = declarationMatch[1]
	const match = declarationBlock.match(new RegExp(`${theme}: \\[([\\s\\S]*?)\\]`))
	if (!match) throw new Error(`Missing ${declaration}.${theme} palette declaration`)
	return [...match[1].matchAll(/#[\da-f]{6}/gi)].map(([hex]) => hex.toLowerCase())
}

const designSeriesColors = (theme: 'light' | 'dark') => (
	[...designSource.matchAll(new RegExp(`^  series-${theme}-\\d{2}:\\s+"(#[\\da-f]{6})"$`, 'gim'))]
		.map(([, hex]) => hex.toLowerCase())
)

const hexChannels = (hex: string) => {
	const value = Number.parseInt(hex.slice(1), 16)
	return [(value >> 16) & 255, (value >> 8) & 255, value & 255] as const
}

const linearChannel = (value: number) => {
	const channel = value / 255
	return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
}

const relativeLuminance = (hex: string) => {
	const [red, green, blue] = hexChannels(hex).map(linearChannel)
	return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

const contrastRatio = (foreground: string, background: string) => {
	const foregroundLuminance = relativeLuminance(foreground)
	const backgroundLuminance = relativeLuminance(background)
	return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
		/ (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
}

const oklch = (hex: string) => {
	const [red, green, blue] = hexChannels(hex).map(linearChannel)
	const l = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue)
	const m = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue)
	const s = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue)
	const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
	const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
	const b = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
	const hue = (Math.atan2(b, a) * 180 / Math.PI + 360) % 360
	return { lightness, chroma: Math.hypot(a, b), hue }
}

const hueDifference = (first: number, second: number) => {
	const difference = Math.abs(first - second)
	return Math.min(difference, 360 - difference)
}

describe('categorical palette contract', () => {
	it('keeps both theme-aware ten-color palettes aligned across design, runtime, and palette lab', () => {
		for (const theme of ['light', 'dark'] as const) {
			expect(designSeriesColors(theme)).toEqual(expectedPalettes[theme])
			expect(WORKBENCH_CATEGORICAL_PALETTES[theme].map((hex) => hex.toLowerCase())).toEqual(expectedPalettes[theme])
			expect(declarationColors(paletteLabSource, 'INITIAL_PALETTES', theme)).toEqual(expectedPalettes[theme])
		}
		expect(WORKBENCH_CATEGORICAL_PALETTES.light[0]).toBe('#C82A70')
		expect(WORKBENCH_CATEGORICAL_PALETTES.dark[0]).toBe('#F16A9C')
	})

	it('starts palette-lab storage from the split-palette baseline version', () => {
		expect(paletteLabSource).toContain("const STORAGE_KEY = 'bgmss-palette-lab-v3'")
	})

	it('preserves slot hues while adapting lightness, chroma, and surface contrast by theme', () => {
		for (let index = 0; index < WORKBENCH_CATEGORICAL_PALETTES.light.length; index += 1) {
			const lightHex = WORKBENCH_CATEGORICAL_PALETTES.light[index]
			const darkHex = WORKBENCH_CATEGORICAL_PALETTES.dark[index]
			const light = oklch(lightHex)
			const dark = oklch(darkHex)

			expect(hueDifference(light.hue, dark.hue)).toBeLessThanOrEqual(2)
			expect(dark.lightness).toBeGreaterThan(light.lightness)
			expect(dark.chroma).toBeLessThanOrEqual(light.chroma + 0.001)
			expect(contrastRatio(lightHex, '#FAFAFB')).toBeGreaterThanOrEqual(3)
			expect(contrastRatio(darkHex, '#18181C')).toBeGreaterThanOrEqual(3)
		}
	})
})
