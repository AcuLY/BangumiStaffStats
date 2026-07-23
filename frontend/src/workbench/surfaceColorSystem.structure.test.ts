import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { getWorkbenchThemeOverrides } from './naiveThemeOverrides'

const readWorkbenchFile = (relativePath: string) => readFileSync(
	new URL(relativePath, import.meta.url),
	'utf8',
)

const tokensSource = readWorkbenchFile('./styles/tokens.css')
const foundationSource = readWorkbenchFile('./styles/modules/foundation.css')
const responsiveSource = readWorkbenchFile('./styles/modules/foundation-responsive.css')
const pickerSource = readWorkbenchFile('./styles/modules/people-picker.css')
const querySource = readWorkbenchFile('./styles/modules/query-workspace.css')
const appSource = readWorkbenchFile('./WorkbenchApp.vue')
const htmlSource = readWorkbenchFile('../../person-workbench.html')
const legacyThemeSource = readWorkbenchFile('../constants/themes.ts')
const legacyStyleSource = readWorkbenchFile('../style.css')
const legacyItemNamesSource = readWorkbenchFile('../components/columns/ItemNames.vue')
const paletteLabSource = readWorkbenchFile('../../prototypes/palette-lab.html')
const surfacePreviewSource = readWorkbenchFile('../../prototypes/surface-color-preview.html')
const surfaceLabSource = readWorkbenchFile('../../prototypes/surface-color-lab.html')
const designSource = readWorkbenchFile('../../../DESIGN.md')

function designColor(name: string) {
	const match = designSource.match(new RegExp(`^  ${name}:\\s+"([^"]+)"$`, 'm'))
	if (!match) throw new Error(`Missing DESIGN.md frontmatter color: ${name}`)
	return match[1]
}

function cssBlockAfter(source: string, marker: string) {
	const markerIndex = source.indexOf(marker)
	if (markerIndex < 0) throw new Error(`Missing CSS marker: ${marker}`)

	const openingBrace = source.indexOf('{', markerIndex)
	if (openingBrace < 0) throw new Error(`Missing CSS block after: ${marker}`)

	let depth = 0
	for (let index = openingBrace; index < source.length; index += 1) {
		if (source[index] === '{') depth += 1
		if (source[index] === '}') depth -= 1
		if (depth === 0) return source.slice(openingBrace + 1, index)
	}

	throw new Error(`Unterminated CSS block after: ${marker}`)
}

describe('confirmed workbench surface color system', () => {
	it('uses the approved light main, card, raised, sunken, border, and header colors', () => {
		const lightTokens = cssBlockAfter(tokensSource, ':root[data-visual="archive"]')

		expect(lightTokens).toContain('--canvas: hsl(240 9.6% 96.2%);')
		expect(lightTokens).toContain('--surface: hsl(240 18.5% 98.3%);')
		expect(lightTokens).toContain('--surface-subtle: hsl(0 0% 100%);')
		expect(lightTokens).toContain('--surface-sunken: hsl(240 10.2% 92.4%);')
		expect(lightTokens).toContain('--border: hsl(240 7.9% 86.1%);')
		expect(lightTokens).toContain('--divider: hsl(240 8.5% 90.8%);')
		expect(lightTokens).toContain('--control-border: #928D94;')
		expect(lightTokens).toContain('--chrome: hsl(0 0% 100%);')
		expect(designColor('control-border-light')).toBe('#928D94')
	})

	it('uses the approved dark main, card, raised, sunken, border, and header colors', () => {
		const darkTokens = cssBlockAfter(tokensSource, ':root[data-visual="archive"][data-theme="dark"]')

		expect(darkTokens).toContain('--canvas: hsl(240 7.8% 5.8%);')
		expect(darkTokens).toContain('--surface: hsl(240 7.1% 9.8%);')
		expect(darkTokens).toContain('--surface-subtle: hsl(240 6.8% 12.8%);')
		expect(darkTokens).toContain('--surface-sunken: hsl(240 8.5% 4.5%);')
		expect(darkTokens).toContain('--border: hsl(240 6.1% 20.5%);')
		expect(darkTokens).toContain('--divider: hsl(240 5.9% 15.8%);')
		expect(darkTokens).toContain('--control-border: #64656D;')
		expect(darkTokens).toContain('--chrome: hsl(240 12.6% 2.4%);')
		expect(designColor('control-border-dark')).toBe('#64656D')
	})

	it('keeps current interaction and overlay runtime tokens plus documented text and state colors', () => {
		const lightTokens = cssBlockAfter(tokensSource, ':root[data-visual="archive"]')
		const darkTokens = cssBlockAfter(tokensSource, ':root[data-visual="archive"][data-theme="dark"]')
		const expectedLightTokens = [
			['--hover: oklch(0.94 0.014 350);'],
			['--pressed: oklch(0.915 0.018 350);'],
			['--text-1: oklch(0.24 0.015 285);', 'text-primary-light'],
			['--text-2: oklch(0.34 0.014 285);', 'text-secondary-light'],
			['--text-3: oklch(0.47 0.015 285);', 'text-tertiary-light'],
			['--disabled: oklch(0.62 0.01 300);'],
			['--on-primary: oklch(0.99 0 0);', 'on-primary-light', '#FFFFFF'],
			['--success: oklch(0.43 0.12 160);', 'success-light'],
			['--warning: oklch(0.43 0.09 80);', 'warning-light'],
			['--error: oklch(0.48 0.18 25);', 'error-light'],
			['--overlay: oklch(0.2 0.01 285 / 0.48);'],
		]
		const expectedDarkTokens = [
			['--hover: oklch(0.27 0.012 280);'],
			['--pressed: oklch(0.3 0.015 280);'],
			['--text-1: oklch(0.95 0.006 280);', 'text-primary-dark'],
			['--text-2: oklch(0.82 0.01 280);', 'text-secondary-dark'],
			['--text-3: oklch(0.69 0.012 280);', 'text-tertiary-dark'],
			['--disabled: oklch(0.52 0.01 280);'],
			['--on-primary: #17171B;', 'on-primary-dark'],
			['--success: oklch(0.68 0.13 160);', 'success-dark'],
			['--warning: oklch(0.75 0.11 80);', 'warning-dark'],
			['--error: oklch(0.72 0.16 25);', 'error-dark'],
			['--overlay: oklch(0.08 0.004 280 / 0.72);'],
		]

		for (const [token, designName, canonicalDesignValue] of expectedLightTokens) {
			expect(lightTokens).toContain(token)
			if (designName) {
				expect(designColor(designName)).toBe(
					canonicalDesignValue ?? token.slice(token.indexOf(':') + 1, -1).trim(),
				)
			}
		}
		for (const [token, designName, canonicalDesignValue] of expectedDarkTokens) {
			expect(darkTokens).toContain(token)
			if (designName) {
				expect(designColor(designName)).toBe(
					canonicalDesignValue ?? token.slice(token.indexOf(':') + 1, -1).trim(),
				)
			}
		}
		expect(designSource).not.toContain('#FFF8FB')
	})

	it('keeps both header themes on one shared 92 percent translucent chrome contract', () => {
		const sharedTokens = cssBlockAfter(tokensSource, ':root[data-visual="archive"]')
		const lightOverrides = cssBlockAfter(tokensSource, ':root[data-visual="archive"][data-theme="light"]')
		const headerBlock = cssBlockAfter(foundationSource, '.workbench-header')
		const summaryAndEditorBlock = cssBlockAfter(querySource, '.query-summary,\n.query-editor')
		const editorOverlayBlock = cssBlockAfter(querySource, '.query-editor-overlay')

		expect(sharedTokens).toContain('--translucent-chrome-background: color-mix(in oklab, var(--chrome) 92%, transparent);')
		expect(sharedTokens).toContain('--translucent-chrome-fallback: var(--chrome);')
		expect(lightOverrides).not.toContain('--translucent-chrome-background:')
		expect(headerBlock).toContain('background: var(--translucent-chrome-background);')
		expect(summaryAndEditorBlock).not.toContain('background:')
		expect(editorOverlayBlock).toContain('background: var(--translucent-chrome-background);')
	})

	it('gives both mobile drawers one gray surface without a second translucent title layer', () => {
		const sharedTokens = cssBlockAfter(tokensSource, ':root[data-visual="archive"]')
		const darkTokens = cssBlockAfter(tokensSource, ':root[data-visual="archive"][data-theme="dark"]')
		const drawerBlock = cssBlockAfter(foundationSource, '.workbench-translucent-drawer')
		const pickerHeadingBlock = cssBlockAfter(responsiveSource, '.person-picker--drawer .picker-heading')
		const candidateBlock = cssBlockAfter(pickerSource, '.person-picker.person-picker--drawer .person-row--candidate')

		expect(sharedTokens).toContain('--drawer-surface: hsl(240 18.5% 97.5%);')
		expect(sharedTokens).toContain('--drawer-raised: hsl(0 0% 100%);')
		expect(sharedTokens).toContain('--translucent-drawer-background: color-mix(in oklab, var(--drawer-surface) 96%, transparent);')
		expect(darkTokens).toContain('--drawer-surface: hsl(240 7.1% 9.8%);')
		expect(darkTokens).toContain('--drawer-raised: hsl(240 6.8% 12.8%);')
		expect(drawerBlock).toContain('background: var(--translucent-drawer-background) !important;')
		expect(drawerBlock).not.toContain('var(--translucent-chrome-background)')
		expect(pickerHeadingBlock).toContain('background: transparent;')
		expect(pickerHeadingBlock).toContain('-webkit-backdrop-filter: none;')
		expect(pickerHeadingBlock).toContain('backdrop-filter: none;')
		expect(candidateBlock).toContain('background: var(--drawer-raised);')
	})

	it('keeps browser chrome color aligned with the page canvas', () => {
		expect(htmlSource).toContain('<meta name="theme-color" content="#f4f4f6" />')
		expect(appSource).toContain("theme === 'dark' ? '#0e0e10' : '#f4f4f6'")
	})

	it('keeps the provisional split primary palette aligned across design, CSS, and Naive UI', () => {
		const rootTokens = cssBlockAfter(tokensSource, ':root')
		const lightTokens = cssBlockAfter(tokensSource, ':root[data-visual="archive"]')
		const darkTokens = cssBlockAfter(tokensSource, ':root[data-visual="archive"][data-theme="dark"]')

		expect(designColor('primary-light')).toBe('#C82A70')
		expect(designColor('primary-light-hover')).toBe('#D23978')
		expect(designColor('primary-light-pressed')).toBe('#AD215F')
		expect(designColor('primary-dark')).toBe('#F16A9C')
		expect(designColor('primary-dark-hover')).toBe('#FC85AF')
		expect(designColor('primary-dark-pressed')).toBe('#DA578A')
		expect(rootTokens).toContain('--brand-primary-light: #C82A70;')
		expect(rootTokens).toContain('--brand-primary-light-hover: #D23978;')
		expect(rootTokens).toContain('--brand-primary-light-pressed: #AD215F;')
		expect(rootTokens).toContain('--brand-primary-dark: #F16A9C;')
		expect(rootTokens).toContain('--brand-primary-dark-hover: #FC85AF;')
		expect(rootTokens).toContain('--brand-primary-dark-pressed: #DA578A;')
		expect(rootTokens).toContain('--brand-primary: var(--brand-primary-light);')
		expect(rootTokens).toContain('--brand-decorative: var(--brand-primary);')
		expect(lightTokens).toContain('--primary: var(--brand-primary);')
		expect(lightTokens).toContain('--primary-hover: var(--brand-primary-hover);')
		expect(lightTokens).toContain('--primary-pressed: var(--brand-primary-pressed);')
		expect(lightTokens).toContain('--primary-text: var(--primary);')
		expect(darkTokens).toContain('--brand-primary: var(--brand-primary-dark);')
		expect(darkTokens).toContain('--brand-primary-hover: var(--brand-primary-dark-hover);')
		expect(darkTokens).toContain('--brand-primary-pressed: var(--brand-primary-dark-pressed);')
		expect(darkTokens).not.toContain('--primary-text:')
		expect(darkTokens).toContain('--on-primary: #17171B;')
		expect(legacyThemeSource).toContain("base: '#FF2075'")
		expect(legacyStyleSource).toContain('--color-primary: #FF2075;')
		expect(legacyItemNamesSource).toMatch(/\.subject-name\s*\{[^}]*color: var\(--color-primary\);/s)
		expect(legacyItemNamesSource).not.toContain('color: var(--color-primary-pressed);')
		expect(paletteLabSource).toContain('--primary: #C82A70;')
		expect(paletteLabSource).toContain('--primary: #F16A9C;')
		expect(paletteLabSource).toContain("const PALETTE_NAMES = ['系列粉', '青绿色'")
		expect(paletteLabSource).toContain("light: ['#C82A70', '#288183'")
		expect(paletteLabSource).toContain("dark: ['#F16A9C', '#61A8AA'")
		expect(surfacePreviewSource).toContain('--accent: #FF2075;')
		expect(surfaceLabSource).toContain('--accent: #FF2075;')

		const expectedPalettes = [
			{
				isDark: false,
				base: '#C82A70',
				hover: '#D23978',
				pressed: '#AD215F',
				onPrimary: '#FFFFFF',
			},
			{
				isDark: true,
				base: '#F16A9C',
				hover: '#FC85AF',
				pressed: '#DA578A',
				onPrimary: '#17171B',
			},
		] as const

		for (const { isDark, base, hover, pressed, onPrimary } of expectedPalettes) {
			const overrides = getWorkbenchThemeOverrides(isDark)
			expect(overrides.common).toMatchObject({
				primaryColor: base,
				primaryColorHover: hover,
				primaryColorPressed: pressed,
				primaryColorSuppl: base,
			})
			expect(overrides.Button).toMatchObject({ textColorPrimary: onPrimary })
			expect(overrides.Radio).toMatchObject({ buttonTextColorActive: onPrimary })
			expect(overrides.Tabs).toMatchObject({
				tabColorSegment: base,
				tabTextColorActiveSegment: onPrimary,
			})
			expect(overrides.Tabs).not.toHaveProperty('colorSegment')
			expect(overrides.Select).toEqual({
				peers: {
					InternalSelection: { borderRadius: '6px' },
				},
			})
			expect(overrides.Select?.peers).not.toHaveProperty('InternalSelectMenu')
		}
	})
})
