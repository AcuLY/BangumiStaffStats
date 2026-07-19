import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const tokensSource = readFileSync(new URL('./styles/tokens.css', import.meta.url), 'utf8')
const workbenchStylesSource = readFileSync(new URL('./styles/workbench.css', import.meta.url), 'utf8')
const scrollbarStylesSource = readFileSync(new URL('./styles/modules/scrollbars.css', import.meta.url), 'utf8')
const themeSource = readFileSync(new URL('./naiveThemeOverrides.ts', import.meta.url), 'utf8')
const rankingSource = readFileSync(new URL('./components/RankingWorkbench.vue', import.meta.url), 'utf8')
const coStarSource = readFileSync(new URL('./components/CoStarWorkbench.vue', import.meta.url), 'utf8')

describe('workbench scrollbar system', () => {
	it('defines shared shell and component thickness tokens', () => {
		expect(tokensSource).toContain('--scrollbar-shell-size: 10px;')
		expect(tokensSource).toContain('--scrollbar-component-size: 6px;')
		expect(tokensSource).toContain('--scrollbar-thumb:')
		expect(tokensSource).toContain('--scrollbar-thumb-hover:')
	})

	it('styles page and header scrolling as shell surfaces', () => {
		expect(workbenchStylesSource).toContain("@import './modules/scrollbars.css';")
		expect(scrollbarStylesSource).toContain('.workbench-page-scroll')
		expect(scrollbarStylesSource).toContain('.query-editor__scroll')
		expect(scrollbarStylesSource).toContain('scrollbar-width: auto;')
		expect(scrollbarStylesSource).toContain('var(--scrollbar-shell-size)')
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
		expect(scrollbarStylesSource).toContain('scrollbar-width: thin;')
		expect(scrollbarStylesSource).toContain('@supports selector(::-webkit-scrollbar)')
		expect(scrollbarStylesSource).toContain('var(--scrollbar-component-size)')
		expect(scrollbarStylesSource).not.toMatch(/\.n-|--n-/)
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
