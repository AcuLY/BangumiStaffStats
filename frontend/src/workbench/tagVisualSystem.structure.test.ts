import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readWorkbenchFile = (relativePath: string) => readFileSync(
	new URL(relativePath, import.meta.url),
	'utf8',
)

const tokensSource = readWorkbenchFile('./styles/tokens.css')
const themeSource = readWorkbenchFile('./naiveThemeOverrides.ts')
const querySource = readWorkbenchFile('./components/QueryWorkspace.vue')
const queryStyles = readWorkbenchFile('./styles/modules/query-workspace.css')
const pickerStyles = readWorkbenchFile('./styles/modules/people-picker.css')
const analysisProfileStyles = readWorkbenchFile('./styles/modules/analysis-profiles.css')
const subjectWorkStyles = readWorkbenchFile('./styles/modules/subject-work-list.css')
const roleTagSource = readWorkbenchFile('./components/CharacterRoleTag.vue')
const analysisDashboardStyles = readWorkbenchFile('./styles/modules/analysis-dashboard.css')
const tagSkeletonSource = readWorkbenchFile('./components/QueryTagSummarySkeleton.vue')
const workSkeletonSource = readWorkbenchFile('./components/QueryWorkBrowserSkeleton.vue')

describe('workbench tag visual system', () => {
	it('defines one pink rounded-rectangle token family for interactive tags', () => {
		for (const token of [
			'--workbench-tag-background:',
			'--workbench-tag-background-strong:',
			'--workbench-tag-border:',
			'--workbench-tag-text:',
			'--workbench-tag-radius: var(--radius-control);',
		]) expect(tokensSource).toContain(token)

		expect(themeSource).toContain('const tagThemeOverrides = {')
		expect(themeSource).toContain("borderRadius: 'var(--workbench-tag-radius)'")
		expect(themeSource).toContain("colorBorderedPrimary: 'var(--workbench-tag-background)'")
		expect(themeSource).toContain('Tag: tagThemeOverrides')
	})

	it('renders query and selected-position tags as primary rectangles and centers tag rows', () => {
		expect(querySource).toContain("import { NTag } from 'naive-ui'")
		expect(querySource).toMatch(/const renderPositionTag[\s\S]*?type:\s*'primary'/)
		expect(querySource).toContain(':render-tag="renderPositionTag"')
		expect(querySource.match(/class="query-tags"/g)).toHaveLength(2)
		expect(querySource.match(/<n-dynamic-tags[\s\S]*?type="primary"/g)).toHaveLength(2)
		expect(querySource).not.toMatch(/<n-dynamic-tags[\s\S]*?\n\s+round\n/)
		expect(queryStyles).toMatch(/\.query-tags\s*\{[^}]*align-items:\s*center;/s)
		expect(pickerStyles).toMatch(/\.selected-position-action__surface\s*\{[^}]*border:\s*1px solid var\(--workbench-tag-border\);[^}]*border-radius:\s*var\(--workbench-tag-radius\);[^}]*background:\s*var\(--workbench-tag-background\);/s)
	})

	it('uses neutral capsules for passive content tags', () => {
		expect(analysisProfileStyles).toMatch(/\.tag-row span\s*\{[^}]*border:\s*1px solid var\(--border\);[^}]*border-radius:\s*999px;[^}]*background:\s*var\(--surface-subtle\);[^}]*color:\s*var\(--text-2\);/s)
		expect(subjectWorkStyles).toMatch(/\.subject-work-row__meta li\s*\{[^}]*border:\s*1px solid var\(--subject-work-divider, var\(--divider\)\);[^}]*border-radius:\s*999px;[^}]*color:\s*var\(--text-3\);/s)
		expect(roleTagSource).toMatch(/\.character-role-tag\s*\{[^}]*min-height:\s*18px;[^}]*border:\s*1px solid var\(--border\);[^}]*border-radius:\s*999px;[^}]*background:\s*var\(--surface-subtle\);[^}]*color:\s*var\(--text-2\);/s)
		expect(roleTagSource).toMatch(/\.character-role-tag--prominent\s*\{[^}]*border-color:\s*var\(--control-border\);[^}]*background:\s*var\(--surface-sunken\);[^}]*color:\s*var\(--text-1\);/s)
		expect(analysisDashboardStyles).toMatch(/\.tag-summary > span\s*\{[^}]*border:\s*1px solid var\(--border\);[^}]*border-radius:\s*999px;[^}]*background:\s*var\(--surface-subtle\);[^}]*color:\s*var\(--text-2\);/s)

		for (const source of [analysisProfileStyles, subjectWorkStyles, roleTagSource, analysisDashboardStyles]) {
			expect(source).not.toMatch(/(?:tag-row span|subject-work-row__meta li|character-role-tag|tag-summary > span)\s*\{[^}]*--workbench-tag-/s)
		}
	})

	it('mirrors passive capsule shapes and heights in loading silhouettes', () => {
		expect(tagSkeletonSource).toContain(":height=\"compactViewport ? '20px' : '28px'\"")
		expect(tagSkeletonSource).toMatch(/:height="compactViewport \? '20px' : '28px'"[\s\S]*?round/)
		expect(workSkeletonSource).toContain('height="var(--query-skeleton-meta-tag-height)"')
		expect(workSkeletonSource).toContain(":height=\"fact === 3 ? '18px' : '15px'\"")
		expect(workSkeletonSource).toContain(':round="fact === 3"')
		expect(workSkeletonSource).toContain('width="44%" height="18px" round')
		expect(workSkeletonSource.match(/query-skeleton__role-tag/g)).toHaveLength(2)
	})
})
