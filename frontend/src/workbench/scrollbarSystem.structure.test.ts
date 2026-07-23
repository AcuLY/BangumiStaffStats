import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const tokensSource = readFileSync(new URL('./styles/tokens.css', import.meta.url), 'utf8')
const workbenchStylesSource = readFileSync(new URL('./styles/workbench.css', import.meta.url), 'utf8')
const scrollbarStylesSource = readFileSync(new URL('./styles/modules/scrollbars.css', import.meta.url), 'utf8')
const themeSource = readFileSync(new URL('./naiveThemeOverrides.ts', import.meta.url), 'utf8')
const rankingSource = readFileSync(new URL('./components/RankingWorkbench.vue', import.meta.url), 'utf8')
const coStarSource = readFileSync(new URL('./components/CoStarWorkbench.vue', import.meta.url), 'utf8')
const pickerStylesSource = readFileSync(new URL('./styles/modules/people-picker.css', import.meta.url), 'utf8')

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

describe('workbench scrollbar system', () => {
	it('defines shared shell and component thickness tokens', () => {
		expect(tokensSource).toContain('--scrollbar-shell-size: 10px;')
		expect(tokensSource).toContain('--scrollbar-component-size: 6px;')
		expect(tokensSource).toContain('--scrollbar-thumb:')
		expect(tokensSource).toContain('--scrollbar-thumb-hover:')
	})

	it('styles page and header scrolling as shell surfaces', () => {
		expect(workbenchStylesSource).toContain("@import './modules/scrollbars.css';")
		const shellWebkitRule = cssBlockAfter(
			scrollbarStylesSource,
			':where(\n\t.workbench-page-scroll,\n\t.query-editor__scroll\n)::-webkit-scrollbar',
		)
		expect(shellWebkitRule).toContain('width: var(--scrollbar-shell-size);')
		expect(shellWebkitRule).toContain('height: var(--scrollbar-shell-size);')
	})

	it('styles every native component scrollbar with the thin tier', () => {
		for (const selector of [
			'.workbench-tooltip-content',
			'.person-work-list',
			'.character-role-list',
			'.selected-people-list',
			'.matrix-details--scrollable > .data-scroll-x',
		]) {
			expect(scrollbarStylesSource).toContain(selector)
		}
		const firefoxFallback = cssBlockAfter(scrollbarStylesSource, '@supports not selector(::-webkit-scrollbar)')
		expect(firefoxFallback).toContain('scrollbar-width: auto;')
		expect(firefoxFallback).toContain('scrollbar-width: thin;')
		expect(firefoxFallback).toContain('scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);')
		expect(scrollbarStylesSource.match(/scrollbar-width: (?:auto|thin);/g) ?? []).toHaveLength(2)
		expect(scrollbarStylesSource.match(/scrollbar-color: var\(/g) ?? []).toHaveLength(2)
		expect(scrollbarStylesSource).not.toContain('@supports selector(::-webkit-scrollbar) {')

		const componentWebkitRule = cssBlockAfter(
			scrollbarStylesSource,
			':where(\n\t.workbench-tooltip-content,\n\t.person-work-list,\n\t.character-role-list,\n\t.selected-people-list,\n\t.matrix-details--scrollable > .data-scroll-x\n)::-webkit-scrollbar',
		)
		expect(componentWebkitRule).toContain('width: var(--scrollbar-component-size);')
		expect(componentWebkitRule).toContain('height: var(--scrollbar-component-size);')
		expect(firefoxFallback).toContain('.selected-people-list')
		expect(scrollbarStylesSource).not.toMatch(/\.n-|--n-/)
	})

	it('restores an independently bounded selected tray without stealing candidate scrolling', () => {
		expect(pickerStylesSource).toMatch(/\.selected-tray\s*\{[^}]*max-height:\s*min\(320px, 42dvh\);[^}]*overflow-y:\s*auto;/s)
		expect(pickerStylesSource).toMatch(/\.person-picker--drawer \.selected-tray\.is-expanded \.selected-people-list\s*\{[^}]*height:\s*var\(--selected-tray-list-height\);[^}]*overflow-y:\s*auto;[^}]*scrollbar-gutter:\s*stable;/s)
		expect(pickerStylesSource).toMatch(/\.person-list--candidate\s*\{[^}]*overflow-y:\s*auto;[^}]*scrollbar-gutter:\s*stable;/s)
		expect(pickerStylesSource).toMatch(/\.person-picker--drawer \.person-list--candidate\s*\{[^}]*overflow:\s*visible;[^}]*scrollbar-gutter:\s*auto;/s)
	})

	it('uses thin Naive scrollbars globally and the shell tier in both drawers', () => {
		expect(themeSource).toContain('Scrollbar: componentScrollbarThemeOverrides')
		expect(themeSource).toContain('export const shellScrollbarThemeOverrides')
		for (const source of [rankingSource, coStarSource]) {
			expect(source).toContain('shellScrollbarThemeOverrides')
			expect(source).toContain('themeOverrides: shellScrollbarThemeOverrides')
		}
	})
})
