import { readdirSync, readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const workbenchRoot = fileURLToPath(new URL('./', import.meta.url))
const stylesRoot = join(workbenchRoot, 'styles')
const componentsRoot = join(workbenchRoot, 'components')

const collectFiles = (directory: string, extensions: Set<string>): string[] => readdirSync(directory, { withFileTypes: true })
	.flatMap((entry) => {
		const path = join(directory, entry.name)
		return entry.isDirectory()
			? collectFiles(path, extensions)
			: (extensions.has(extname(entry.name)) ? [path] : [])
	})

const readSources = (paths: string[]) => paths.map((path) => ({
	path,
	source: readFileSync(path, 'utf8'),
}))

const cssSources = readSources(collectFiles(stylesRoot, new Set(['.css'])))
const vueSources = readSources(collectFiles(workbenchRoot, new Set(['.vue'])))
const vueStyleSources = vueSources.flatMap(({ path, source }) => [...source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)]
	.map((match, index) => ({ path: `${path}#style-${index + 1}`, source: match[1] })))
const activeStyleSources = [...cssSources, ...vueStyleSources]
const themeSource = readFileSync(join(workbenchRoot, 'naiveThemeOverrides.ts'), 'utf8')
const queryWorkspaceSource = readFileSync(join(componentsRoot, 'QueryWorkspace.vue'), 'utf8')
const subjectWorkBrowserStyles = readFileSync(join(stylesRoot, 'modules', 'subject-work-browser.css'), 'utf8')
const workspaceResponsiveStyles = readFileSync(join(stylesRoot, 'modules', 'workspace-responsive.css'), 'utf8').replace(/\r\n/g, '\n')
const dataResponsiveStyles = readFileSync(join(stylesRoot, 'modules', 'data-responsive.css'), 'utf8').replace(/\r\n/g, '\n')

describe('workbench typography boundaries', () => {
	it('styles query status text without reaching into Naive button internals', () => {
		expect(queryWorkspaceSource).toContain('class="query-editor__status"')
		for (const { path, source } of activeStyleSources) {
			expect(source, path).not.toMatch(/\.query-editor__footer\s+span\b/)
		}
		expect(activeStyleSources.map(({ source }) => source).join('\n')).toMatch(/\.query-editor__status\s*{[^}]*font-size\s*:\s*var\(--text-caption\)/s)
	})

	it('keeps project CSS font sizes on semantic rem tokens', () => {
		for (const { path, source } of activeStyleSources) {
			expect(source, path).not.toMatch(/font-size\s*:[^;{}]*\b\d*\.?\d+px\b/i)
		}
		expect(subjectWorkBrowserStyles).not.toMatch(/\.subject-work-browser__density-label\s*{[^}]*font-size/s)
	})

	it('uses the approved compact hierarchies only on mobile', () => {
		expect(workspaceResponsiveStyles).toContain(`@media (width < 780px) {
	.query-editor__title {
		font-size: var(--text-caption);
	}`)
		expect(workspaceResponsiveStyles).toContain(`
	.query-stage__heading h2 {
		font-size: var(--text-body);
	}`)
		expect(workspaceResponsiveStyles).toContain(`
	.query-editor .field > span,
	.query-editor .field legend,
	.query-editor .field-label-row label {
		font-size: var(--text-caption);
	}`)

		const mobileRankingStyles = dataResponsiveStyles.slice(
			dataResponsiveStyles.indexOf('@media (width < 780px) {'),
			dataResponsiveStyles.indexOf('@media (max-width: 520px) {'),
		)
		expect(mobileRankingStyles).toContain(`
	.ranking-pane .person-row--ranking .person-row__rank,
	.ranking-pane .person-row--ranking .person-row__identity strong,
	.ranking-pane .person-row--ranking .person-row__metric strong {
		font-size: var(--text-caption);
	}`)
	})

	it('keeps project Naive font overrides on the rem scale without mobile forks', () => {
		expect(themeSource).not.toMatch(/\b\w*fontSize\w*\s*:\s*['"][^'"]*\b\d*\.?\d+px\b[^'"]*['"]/i)
		expect(themeSource).not.toMatch(/THEME_FONT_SIZE\s*=\s*{[^}]*\b\d*\.?\d+px\b/s)
		for (const value of ['0.875rem', '1rem', '1.125rem', '1.25rem']) {
			expect(themeSource).toContain(`'${value}'`)
		}

		const forbiddenSymbols = [
			'mobileControlThemeOverrides',
			'mobileSelectThemeOverrides',
			'getWorkbenchControlThemeOverrides',
			'getWorkbenchSelectThemeOverrides',
		]
		for (const symbol of forbiddenSymbols) {
			expect(themeSource).not.toContain(symbol)
			for (const { path, source } of vueSources) expect(source, path).not.toContain(symbol)
		}

		for (const file of ['PersonPicker.vue', 'WorkListToolbar.vue', 'SinglePersonCooperation.vue']) {
			const source = readFileSync(join(componentsRoot, file), 'utf8')
			expect(source, file).not.toContain('controlThemeOverrides')
			expect(source, file).not.toContain('selectThemeOverrides')
		}
	})

	it('reserves the micro token for accessible chart internals', () => {
		const allowedSelectors = new Set([
			'.grouped-bin__bar span',
			'.score-distribution__axis',
			'.rating-time-chart__grid text',
		])
		const microSelectors = activeStyleSources.flatMap(({ source }) => [...source.matchAll(/([^{}]+)\{[^{}]*font-size\s*:\s*var\(--text-micro\)/g)]
			.map((match) => match[1].trim()))

		expect(microSelectors.length).toBeGreaterThan(0)
		for (const selector of microSelectors) {
			expect(allowedSelectors, selector).toContain(selector)
		}
	})
})
